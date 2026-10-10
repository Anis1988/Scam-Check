import type { CheckResult, Kind, LinkInfo, PhoneInfo, SenderInfo, Signal } from '../../src/lib/types';
import { verdictOf } from '../../src/lib/types';
import { patternSignals } from './patterns';
import { checkLinks } from './domains';
import { checkPhones, findPhones } from './phones';
import { looksLikeRawEmail, parseEmail } from './email';

/** Links written in a text: full addresses, and bare ones like "usps-redelivery.top/abc". */
export function findLinks(text: string): string[] {
  const t = text.slice(0, 20_000);
  const full = t.match(/\bhttps?:\/\/[^\s<>"')\]]+/gi) ?? [];
  const bare = t.match(/\b(?:[a-z0-9-]+\.)+(?:com|net|org|info|co|us|io|me|top|xyz|click|link|live|icu|cfd|sbs|online|site|shop|support|help|app|ly|gl|gd|cc|to|vip|win|bond|cam|buzz|rest|cyou|lol|mom|ml|tk|ga|cf|gq|zip|mov)(?:\/[^\s<>"')\]]*)?/gi) ?? [];
  const clean = (u: string) => u.replace(/[.,;:!?]+$/, '');
  const fulls = full.map(clean);
  // A bare address that is part of a full one ("https://x.top/pay" also matches "x.top/pay") counts once,
  // and email addresses' domains aren't links.
  const bares = bare.map(clean).filter((u) => !fulls.some((f) => f.includes(u)) && !new RegExp(`@${u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(t));
  return [...new Set([...fulls, ...bares])];
}

export interface FreeResult { text: string; signals: Signal[]; links: LinkInfo[]; phones: PhoneInfo[]; sender?: SenderInfo }

/** Every free check on a text (and the links / numbers found in it, or given by the AI for pictures). */
export async function freeChecks(raw: string, opts: { from?: string; links?: string[]; phones?: string[] } = {}): Promise<FreeResult> {
  let text = raw;
  let sender: SenderInfo | undefined;
  const signals: Signal[] = [];
  let links: string[] = [...(opts.links ?? [])];
  let shownOnly = new Set<string>();
  if (looksLikeRawEmail(raw)) {
    const e = await parseEmail(raw).catch(() => null);
    if (e) {
      text = `${e.sender.subject ?? ''}\n${e.text}`;
      sender = e.sender;
      signals.push(...e.signals);
      links.push(...e.links.map((l) => l.href));
      // The words of a link ("www.paypal.com") are not where it goes: only its real address is checked.
      shownOnly = new Set(e.links.map((l) => l.label.toLowerCase()));
    }
  }
  links = [...links, ...findLinks(text).filter((u) => ![...shownOnly].some((label) => label.includes(u.toLowerCase().replace(/^https?:\/\//, ''))))];
  signals.push(...patternSignals(text));
  const [l, p] = await Promise.all([checkLinks(links), Promise.resolve(checkPhones(findPhones(text, [...(opts.from ? [opts.from] : []), ...(opts.phones ?? [])])))]);
  signals.push(...l.signals, ...p.signals);
  return { text, signals, links: l.links, phones: p.phones, sender };
}

/** 0-100 from the signals (each kind of signal counts once). A certain sign puts it at 90 or more. */
export function scoreOf(signals: Signal[]): number {
  const seen = new Set<string>();
  let sum = 0;
  for (const s of signals) {
    if (s.source === 'ai') continue;
    const key = `${s.source}:${s.title.replace(/\S+\.\S+/g, '')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    sum += s.weight;
  }
  const score = Math.max(0, Math.min(100, Math.round(sum)));
  return signals.some((s) => s.hard) ? Math.max(score, 90) : score;
}

/** The steps to take for a verdict (the AI's own steps replace these when it ran). */
export function defaultSteps(v: CheckResult['verdict']): string[] {
  if (v === 'scam') return [
    'Don’t click the links, call the numbers, reply, or pay anything.',
    'Already paid or shared something? Call your bank or card company now, using the number on the back of your card.',
    'Report it: forward scam texts to 7726 (SPAM), phishing emails to reportphishing@apwg.org, and tell the FTC at reportfraud.ftc.gov.',
    'Then delete it and block the sender.',
  ];
  if (v === 'suspicious') return [
    'Don’t use the links or phone numbers in the message.',
    'Check it yourself: open the company’s app or type its website, or call the number on your card or a past bill.',
    'Never share passwords, one-time codes or card numbers with someone who contacted you.',
  ];
  return [
    'No warning signs found, but stay careful: scams change all the time.',
    'Never share passwords or one-time codes, even when a message looks real.',
  ];
}

export function summaryOf(v: CheckResult['verdict'], signals: Signal[]): string {
  // "Pretends to be USPS" -> "pretends to be USPS" (names keep their capitals).
  const lower = (t: string) => (/^[A-Z][a-z]/.test(t) ? t[0].toLowerCase() + t.slice(1) : t);
  const bad = [...new Set(signals.filter((s) => s.weight > 0).sort((a, b) => b.weight - a.weight).map((s) => lower(s.title)))].slice(0, 2);
  if (v === 'scam') return `This has strong signs of a scam${bad.length ? `: ${bad.join(' and ')}` : ''}.`;
  if (v === 'suspicious') return `Be careful: ${bad.length ? bad.join(' and ') : 'some things don’t add up'}. Check it another way before doing anything.`;
  return 'No known scam signs found.';
}

/** Puts a result together from the free checks (the AI part may come later). */
export function buildResult(id: string, kind: Kind, preview: string, f: FreeResult, ai: CheckResult['ai'], aiNote?: string): CheckResult {
  const score = scoreOf(f.signals);
  const verdict = verdictOf(score);
  return {
    id, kind, verdict, score, summary: summaryOf(verdict, f.signals), signals: f.signals, links: f.links, phones: f.phones, sender: f.sender,
    whatToDo: defaultSteps(verdict), ai, aiNote, preview: preview.replace(/\s+/g, ' ').trim().slice(0, 140), checkedAt: new Date().toISOString(),
  };
}
