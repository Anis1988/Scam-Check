import { createHash } from 'node:crypto';
import { waitUntil } from '@vercel/functions';
import { z } from 'zod';
import type { CheckResult } from '../src/lib/types.js';
import { pickModel, providerOf } from '../src/lib/types.js';
import { guard, json } from '../server/guard.js';
import { aiName, askAi, isPrivate, noAiNote, pickAi } from '../server/ai.js';
import { buildResult, freeChecks } from '../server/analyze.js';
import { mergeAi } from '../server/merge.js';
import { getResult, getSettings, recordBill, saveResult, takeAi } from '../server/store.js';
import { Body, idOf, out } from './check.js';

const AiBody = Body.extend({
  file: z.object({ mime: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']), data: z.string().max(4_300_000).regex(/^[A-Za-z0-9+/=]+$/) }).optional(),
  fresh: z.boolean().optional(), // ↻ Re-check: ask the AI again, even if an answer is remembered
  // ↻ Re-check with a model picked just for this once (Settings stay as they are).
  model: z.object({ provider: z.enum(['claude', 'gemini', 'groq', 'openrouter']), id: z.string().regex(/^[A-Za-z0-9._:/-]{2,120}$/) }).optional(),
});

/**
 * POST /api/ai {the same message as /api/check, plus the file} -> the final result with the AI's opinion (10-40 s).
 * The message and file are only used for this answer, never stored. The work carries on (waitUntil) even if the
 * phone or browser goes away: the answer is saved, and History picks it up later.
 */
export async function POST(req: Request): Promise<Response> {
  const blocked = guard(req, 'ai', 30);
  if (blocked) return blocked;
  let b: z.infer<typeof AiBody>;
  try {
    b = AiBody.parse(await req.json());
  } catch (e) {
    return json({ error: e instanceof z.ZodError ? `Invalid request: ${e.issues[0]?.path.join('.')} ${e.issues[0]?.message}` : 'Invalid request (file too big? 3 MB max).' }, 400);
  }
  if (b.file) b.fileHash = createHash('sha256').update(b.file.data).digest('hex');
  const id = idOf(b);
  const text = (b.text ?? '').trim();
  try {
    const cached = await getResult(id).catch(() => null);
    if (cached?.ai === 'done' && !b.fresh) return out({ ...cached, remembered: true });
    if (!text && !b.file) return json({ error: 'Nothing to check.' }, 400);
    const job = work(b, id, text, cached);
    waitUntil(job.catch(() => undefined)); // keeps going if the app is closed or the tab changes
    return out(await job);
  } catch (e) {
    return json({ error: (e instanceof Error ? e.message : String(e)).slice(0, 300) }, 502);
  }
}

async function work(b: z.infer<typeof AiBody>, id: string, text: string, cached: CheckResult | null): Promise<CheckResult> {
  {
    const saved = await getSettings();
    const pick = b.fresh ? b.model : undefined;
    const cfg = !pick ? saved : { ...saved, ai: { ...saved.ai, ...pickModel(saved.ai, pick.provider, pick.id) } };
    const free = text ? await freeChecks(text, { from: b.from, check: cfg.checks }) : { text: '', signals: [], links: [], phones: [] };
    const base = buildResult(id, b.kind, text || (b.kind === 'bill' ? 'Bill (picture or PDF)' : 'Screenshot'), free, 'pending');
    // Claude or Gemini (Settings → AI); bills and PDFs may be kept for Claude only.
    const priv = isPrivate(b.kind, b.file?.mime ?? (b.pdf ? 'application/pdf' : undefined));
    const prov = pickAi(cfg.ai, priv);
    // A re-check that can't run keeps the answer you already had.
    const keep = (note: string, r: CheckResult) => (b.fresh && cached?.ai === 'done' ? { ...cached, aiNote: note, remembered: true } : r);
    if (!prov) return keep(noAiNote(cfg.ai, priv), { ...base, ai: 'off', aiNote: noAiNote(cfg.ai, priv) });
    const tried = aiName(prov, cfg.ai);
    const over = `Today’s ${providerOf(prov).name} checks are used up (daily limit in Settings). The result below is from the free checks: pick another model to continue.`;
    if (!(await takeAi(prov))) return keep(over, { ...base, ai: 'limit', aiNote: over, aiTried: tried, unchecked: !text || undefined });
    let result: CheckResult;
    try {
      const a = await askAi({ kind: b.kind, text: text || undefined, file: b.file, from: b.from, signals: free.signals }, cfg.ai, prov);
      // A picture or PDF: the free checks also run on what the AI read in it (its links and phone numbers too).
      const all = text ? free : await freeChecks(a.readText, { from: b.from, links: a.links, phones: a.phones, check: cfg.checks });
      result = { ...mergeAi(base, all, a, cfg.ai.summaries), aiBy: a.by, aiNote: a.note };
      // 📅 Bills: a safe bill is listed, and compared with the same company's last one.
      if (result.bill && cfg.bills.track) result.billCompare = await recordBill(result).catch(() => undefined);
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      // "401 {"type":"error","error":{…"message":"invalid x-api-key"}}" -> "invalid x-api-key"
      const why = raw.match(/"message"\s*:\s*"([^"]{1,160})"/)?.[1] ?? raw.slice(0, 160);
      const note = `${tried} couldn’t check it (${why}). The result below is from the free checks: pick another model to try again.`;
      result = keep(note, { ...base, ai: 'failed', aiTried: tried, unchecked: !text || undefined, aiNote: note });
    }
    if (!result.remembered) await saveResult(result, cfg.checks.rememberDays).catch(() => undefined);
    return result;
  }
}
