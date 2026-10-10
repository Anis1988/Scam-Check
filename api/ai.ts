import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { CheckResult } from '../src/lib/types.js';
import { guard, json } from '../server/guard.js';
import { askAi, isPrivate, noAiNote, pickAi } from '../server/ai.js';
import { buildResult, freeChecks } from '../server/analyze.js';
import { mergeAi } from '../server/merge.js';
import { getResult, getSettings, recordBill, saveResult, takeAi } from '../server/store.js';
import { Body, idOf, out } from './check.js';

const AiBody = Body.extend({
  file: z.object({ mime: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']), data: z.string().max(4_300_000).regex(/^[A-Za-z0-9+/=]+$/) }).optional(),
});

/**
 * POST /api/ai {the same message as /api/check, plus the file} -> the final result with the AI's opinion (10-40 s).
 * The message and file are only used for this answer, never stored.
 */
export async function POST(req: Request): Promise<Response> {
  const blocked = guard(req, 'ai', 10);
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
    if (cached?.ai === 'done') return out(cached);
    if (!text && !b.file) return json({ error: 'Nothing to check.' }, 400);
    const cfg = await getSettings();
    const free = text ? await freeChecks(text, { from: b.from, check: cfg.checks }) : { text: '', signals: [], links: [], phones: [] };
    const base = buildResult(id, b.kind, text || (b.kind === 'bill' ? 'Bill (picture or PDF)' : 'Screenshot'), free, 'pending');
    // Claude or Gemini (Settings → AI); bills and PDFs may be kept for Claude only.
    const priv = isPrivate(b.kind, b.file?.mime ?? (b.pdf ? 'application/pdf' : undefined));
    const prov = pickAi(cfg.ai, priv);
    if (!prov) return out({ ...base, ai: 'off', aiNote: noAiNote(cfg.ai, priv) });
    if (!(await takeAi(prov))) return out({ ...base, ai: 'limit', aiNote: `Today’s ${prov === 'gemini' ? 'Gemini' : 'AI'} checks are used up (daily limit in Settings). The result below is from the free checks.`, unchecked: !text || undefined });
    let result: CheckResult;
    try {
      const a = await askAi({ kind: b.kind, text: text || undefined, file: b.file, from: b.from, signals: free.signals }, cfg.ai, prov);
      // A picture or PDF: the free checks also run on what the AI read in it (its links and phone numbers too).
      const all = text ? free : await freeChecks(a.readText, { from: b.from, links: a.links, phones: a.phones, check: cfg.checks });
      result = { ...mergeAi(base, all, a, cfg.ai.summaries), aiBy: a.by };
      // 📅 Bills: a safe bill is listed, and compared with the same company's last one.
      if (result.bill && cfg.bills.track) result.billCompare = await recordBill(result).catch(() => undefined);
    } catch (e) {
      result = { ...base, ai: 'failed', unchecked: !text || undefined, aiNote: `The AI check failed (${(e instanceof Error ? e.message : String(e)).slice(0, 160)}). The result below is from the free checks.` };
    }
    await saveResult(result, cfg.checks.rememberDays).catch(() => undefined);
    return out(result);
  } catch (e) {
    return json({ error: (e instanceof Error ? e.message : String(e)).slice(0, 300) }, 502);
  }
}
