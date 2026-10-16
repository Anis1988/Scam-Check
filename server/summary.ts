import { HISTORY, aiUsedOn, getSettings, syncedList } from './store.js';
import { PROVIDERS, VERDICT_LABEL, modelName, providerOf, type CheckResult, type Provider } from '../src/lib/types.js';

/**
 * GET /api/summary (served by api/status.ts through a rewrite in vercel.json: the plan allows 12 functions) for the
 * owner's "My apps" page (LifeTracker public/apps.html). Read-only: a few lines + what the AIs cost.
 *
 * Cost: the app doesn't keep token counts, so Claude is an ESTIMATE per check: about 4,000 tokens in (picture or
 * message + instructions) and 1,500 out, at Anthropic's list prices (Opus 5.5 $4/$20, Sonnet 5.5 $2/$10,
 * Haiku 5.5 $0.10/$0.50 per million tokens), rounded. Web searches (Look up, Video) cost a little more.
 * The free AIs (Gemini, Groq, OpenRouter) count calls at $0.
 */
const CLAUDE_USD_PER_CALL: Record<string, number> = { 'claude-opus-5-5': 0.05, 'claude-sonnet-5-5': 0.025, 'claude-haiku-5-5': 0.002 };
const DEFAULT_USD_PER_CALL = 0.05;

export const SUMMARY_ORIGIN = 'https://anis1988.github.io';

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const round = (n: number) => Math.round(n * 100) / 100;

export async function buildSummary() {
  const settings = await getSettings();
  const now = new Date();
  const today = ymd(now);
  // This calendar month and the last 7 days (UTC, like the daily AI counters), newest first.
  const days: string[] = [];
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const from = Math.min(first.getTime(), now.getTime() - 6 * 86400_000);
  for (let t = now.getTime(); t >= from - 1; t -= 86400_000) days.push(ymd(new Date(t)));
  const week = new Set(days.slice(0, 7));
  const month = today.slice(0, 7);

  const claudeUsd = CLAUDE_USD_PER_CALL[settings.ai.model] ?? DEFAULT_USD_PER_CALL;
  const per = await Promise.all(PROVIDERS.map(async (p) => ({ p: p.id as Provider, counts: await aiUsedOn(p.id, days).catch(() => days.map(() => 0)) })));
  const sum = (pick: (day: string) => boolean) => {
    let calls = 0, usd = 0;
    for (const { p, counts } of per) counts.forEach((n, i) => {
      if (!pick(days[i])) return;
      calls += n;
      if (providerOf(p).paid) usd += n * claudeUsd;
    });
    return { calls, usd: round(usd) };
  };
  const byModel = per
    .map(({ p, counts }) => ({ model: p === 'claude' ? modelName(p, settings.ai.model) : `${providerOf(p).name} (free)`, calls: counts[0], usd: round(providerOf(p).paid ? counts[0] * claudeUsd : 0) }))
    .filter((m) => m.calls > 0);

  // Lines from 🕘 History (the same list every device shows: the last 100 checks).
  const list = (await syncedList<CheckResult>(HISTORY).catch(() => [])).map(([, c]) => c);
  const checkedToday = list.filter((c) => c.checkedAt?.slice(0, 10) === today).length;
  const weekAgo = now.getTime() - 7 * 86400_000;
  const scamsWeek = list.filter((c) => c.verdict === 'scam' && !c.unchecked && Date.parse(c.checkedAt) >= weekAgo).length;
  const last = list.find((c) => !c.unchecked && c.ai !== 'pending');
  const lines: { icon: string; text: string; tone: 'good' | 'warn' | 'info' }[] = [
    { icon: '🛡️', text: checkedToday ? `${checkedToday} check${checkedToday === 1 ? '' : 's'} today` : 'No checks today', tone: 'info' },
  ];
  if (last) {
    const what = (last.title || last.impersonating || '').trim().slice(0, 40);
    lines.push({ icon: VERDICT_LABEL[last.verdict].icon, text: `Last: ${VERDICT_LABEL[last.verdict].text}${what ? ` (${what})` : ''}`, tone: last.verdict === 'safe' ? 'good' : 'warn' });
  }
  lines.push({ icon: '🚨', text: scamsWeek ? `${scamsWeek} likely scam${scamsWeek === 1 ? '' : 's'} this week` : 'No likely scams this week', tone: scamsWeek ? 'warn' : 'good' });

  return {
    app: 'scam-check' as const,
    lines,
    ai: {
      today: sum((d) => d === today),
      week: sum((d) => week.has(d)),
      month: sum((d) => d.startsWith(month)),
      byModel,
      estimate: true,
      // Days were only kept 2 days before this summary existed: week and month count from 2026-10-16.
      since: '2026-10-16',
    },
    at: now.toISOString(),
  };
}
