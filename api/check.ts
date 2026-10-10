import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { CheckResult } from '../src/lib/types.js';
import { providerOf } from '../src/lib/types.js';
import { guard, json } from '../server/guard.js';
import { buildResult, freeChecks } from '../server/analyze.js';
import { isPrivate, noAiNote, pickAi } from '../server/ai.js';
import { deleteResult, getLists, getResult, getSettings, overLimit, saveResult, storeReady } from '../server/store.js';
import { withLists } from '../server/lists.js';

export const Body = z.object({
  kind: z.enum(['email', 'text', 'bill', 'screenshot', 'qr', 'voicemail']),
  text: z.string().max(100_000).optional(),
  from: z.string().trim().max(60).optional(),
  fileHash: z.string().regex(/^[a-f0-9]{64}$/).optional(), // SHA-256 of the picture/PDF (the file itself only goes to /api/ai)
  pdf: z.boolean().optional(), // the file is a PDF (private: may go to Claude only, Settings → AI)
  aiMode: z.enum(['ask', 'smart', 'always', 'never']).default('ask'),
});
export type CheckBody = z.infer<typeof Body>;

/** The same message (same kind, sender, words and file) always gets the same id: its result is reused (7 days by default). */
export const idOf = (b: CheckBody) => createHash('sha256').update(JSON.stringify([b.kind, b.from ?? '', (b.text ?? '').trim(), b.fileHash ?? ''])).digest('hex').slice(0, 32);

/** Every result goes out through your ✅ trusted / 🚫 blocked lists. */
export const out = async (r: CheckResult) => json(withLists(r, await getLists().catch(() => [])));

const parseError = (e: unknown) => (e instanceof z.ZodError ? `Invalid request: ${e.issues[0]?.path.join('.')} ${e.issues[0]?.message}` : 'Invalid request.');

/** GET /api/check?id=... -> a remembered result (7 days by default). */
export async function GET(req: Request): Promise<Response> {
  const blocked = guard(req, 'check', 30);
  if (blocked) return blocked;
  const id = new URL(req.url).searchParams.get('id') ?? '';
  if (!/^[a-f0-9]{32}$/.test(id)) return json({ error: 'Bad id.' }, 400);
  const r = await getResult(id).catch(() => null);
  return r ? out(r) : json({ error: 'Not found (this result is too old: check it again).' }, 404);
}

/** DELETE /api/check?ids=a,b -> 🗑 forgets these checks on the server too (up to 200 at once). */
export async function DELETE(req: Request): Promise<Response> {
  const blocked = guard(req, 'check', 30);
  if (blocked) return blocked;
  const ids = (new URL(req.url).searchParams.get('ids') ?? '').split(',').filter((x) => /^[a-f0-9]{32}$/.test(x)).slice(0, 200);
  if (!ids.length) return json({ error: 'Bad id.' }, 400);
  await Promise.all(ids.map((id) => deleteResult(id).catch(() => undefined)));
  return json({ deleted: ids.length });
}

/**
 * POST /api/check {kind, text?, from?, fileHash?, aiMode} -> the free checks' result, at once.
 * ai "pending" means: now call POST /api/ai with the same message (and the file) for the AI's opinion.
 */
export async function POST(req: Request): Promise<Response> {
  const blocked = guard(req, 'check', 20);
  if (blocked) return blocked;
  let b: CheckBody;
  try {
    b = Body.parse(await req.json());
  } catch (e) {
    return json({ error: parseError(e) }, 400);
  }
  try {
    const text = (b.text ?? '').trim();
    if (!text && !b.fileHash) return json({ error: 'Paste the message or add a picture first.' }, 400);
    const id = idOf(b);
    // Checked recently (Settings → Results remembered): the saved answer (no new AI cost), unless AI is now asked for
    // or the AI failed / was over the limit last time (then it may try again).
    const cached = await getResult(id).catch(() => null);
    if (cached && (cached.ai === 'done' || (b.aiMode !== 'always' && cached.ai !== 'failed' && cached.ai !== 'limit'))) return out(cached.ai === 'done' ? { ...cached, remembered: true } : cached);

    // 1. Free checks first: patterns, links, phone numbers, email sender.
    const cfg = await getSettings();
    const free = text ? await freeChecks(text, { from: b.from, check: cfg.checks }) : { text: '', signals: [], links: [], phones: [] };
    const base = buildResult(id, b.kind, text || (b.kind === 'bill' ? 'Bill (picture or PDF)' : b.kind === 'voicemail' ? 'Voicemail' : 'Screenshot'), free, 'off');
    if (b.fileHash && !text) Object.assign(base, { unchecked: true, summary: b.kind === 'voicemail' ? 'Recordings are listened to by the AI check.' : 'Pictures and PDFs are read by the AI check.' });

    // 2. The AI, only when needed (it costs money): pictures/PDFs (it is the only way to read them), "always",
    //    or "smart" when the free checks aren't already sure. With "ask" (the default), text only gets an
    //    "Ask the AI" button when the free checks aren't sure.
    const wantAi = b.aiMode === 'always' || (b.aiMode !== 'never' && !!b.fileHash) || (b.aiMode === 'smart' && base.score < 65);
    // With "ask": unsure -> an "Ask the AI" button; safe -> a "Summarize" button (both: 1 AI check, only if tapped).
    const prov = pickAi(cfg.ai, isPrivate(b.kind, b.pdf ? 'application/pdf' : undefined));
    if (b.aiMode === 'ask' && !wantAi && prov && storeReady()) {
      if (base.score >= 30 && base.score < 65) Object.assign(base, { aiOffer: true });
      else if (base.score < 30 && cfg.ai.summaries) Object.assign(base, { briefOffer: true });
    }
    let result: CheckResult = base;
    if (wantAi && !prov) result = { ...base, aiNote: noAiNote(cfg.ai, isPrivate(b.kind, b.pdf ? 'application/pdf' : undefined)) };
    else if (wantAi && !storeReady()) result = { ...base, aiNote: 'The AI check needs the free Upstash Redis storage (Vercel → Storage) to keep its daily limit.' };
    else if (wantAi && prov && (await overLimit(prov))) result = { ...base, ai: 'limit', aiNote: `Today’s ${providerOf(prov).name} checks are used up (daily limit in Settings). The result below is from the free checks: pick another model to continue.` };
    else if (wantAi) return out({ ...base, ai: 'pending' });
    else if (b.aiMode === 'smart' && base.score >= 65) result = { ...base, ai: 'skipped', aiNote: 'The free checks were already sure, so no AI credit was used.' };
    await saveResult(result, cfg.checks.rememberDays).catch(() => undefined);
    return out(result);
  } catch (e) {
    return json({ error: (e instanceof Error ? e.message : String(e)).slice(0, 300) }, 502);
  }
}
