import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { CheckResult } from '../src/lib/types';
import { guard, json } from '../server/guard';
import { buildResult, freeChecks } from '../server/analyze';
import { aiReady } from '../server/ai';
import { aiLimit, aiUsed, getResult, saveResult, storeReady } from '../server/store';

export const Body = z.object({
  kind: z.enum(['email', 'text', 'bill', 'screenshot']),
  text: z.string().max(100_000).optional(),
  from: z.string().trim().max(60).optional(),
  fileHash: z.string().regex(/^[a-f0-9]{64}$/).optional(), // SHA-256 of the picture/PDF (the file itself only goes to /api/ai)
  aiMode: z.enum(['ask', 'smart', 'always', 'never']).default('ask'),
});
export type CheckBody = z.infer<typeof Body>;

/** The same message (same kind, sender, words and file) always gets the same id: its result is reused for 7 days. */
export const idOf = (b: CheckBody) => createHash('sha256').update(JSON.stringify([b.kind, b.from ?? '', (b.text ?? '').trim(), b.fileHash ?? ''])).digest('hex').slice(0, 32);

const parseError = (e: unknown) => (e instanceof z.ZodError ? `Invalid request: ${e.issues[0]?.path.join('.')} ${e.issues[0]?.message}` : 'Invalid request.');

/** GET /api/check?id=... -> a saved result (7 days). */
export async function GET(req: Request): Promise<Response> {
  const blocked = guard(req, 'check', 30);
  if (blocked) return blocked;
  const id = new URL(req.url).searchParams.get('id') ?? '';
  if (!/^[a-f0-9]{32}$/.test(id)) return json({ error: 'Bad id.' }, 400);
  const r = await getResult(id).catch(() => null);
  return r ? json(r) : json({ error: 'Not found (results are kept 7 days).' }, 404);
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
    // Checked in the last 7 days: the saved answer (no new AI cost), unless AI is now asked for
    // or the AI failed / was over the limit last time (then it may try again).
    const cached = await getResult(id).catch(() => null);
    if (cached && (cached.ai === 'done' || (b.aiMode !== 'always' && cached.ai !== 'failed' && cached.ai !== 'limit'))) return json(cached);

    // 1. Free checks first: patterns, links, phone numbers, email sender.
    const free = text ? await freeChecks(text, { from: b.from }) : { text: '', signals: [], links: [], phones: [] };
    const base = buildResult(id, b.kind, text || (b.kind === 'bill' ? 'Bill (picture or PDF)' : 'Screenshot'), free, 'off');
    if (b.fileHash && !text) Object.assign(base, { unchecked: true, summary: 'Pictures and PDFs are read by the AI check.' });

    // 2. The AI, only when needed (it costs money): pictures/PDFs (it is the only way to read them), "always",
    //    or "smart" when the free checks aren't already sure. With "ask" (the default), text only gets an
    //    "Ask the AI" button when the free checks aren't sure.
    const wantAi = b.aiMode === 'always' || (b.aiMode !== 'never' && !!b.fileHash) || (b.aiMode === 'smart' && base.score < 65);
    if (b.aiMode === 'ask' && !wantAi && base.score < 65 && aiReady() && storeReady()) Object.assign(base, { aiOffer: true });
    let result: CheckResult = base;
    if (wantAi && !aiReady()) result = { ...base, aiNote: 'The AI check is not set up (ANTHROPIC_API_KEY in Vercel).' };
    else if (wantAi && !storeReady()) result = { ...base, aiNote: 'The AI check needs the free Upstash Redis storage (Vercel → Storage) to keep its daily limit.' };
    else if (wantAi && (await aiUsed()) >= aiLimit()) result = { ...base, ai: 'limit', aiNote: 'Today’s AI checks are used up (AI_DAILY_LIMIT). The result below is from the free checks.' };
    else if (wantAi) return json({ ...base, ai: 'pending' });
    else if (b.aiMode === 'smart' && base.score >= 65) result = { ...base, ai: 'skipped', aiNote: 'The free checks were already sure, so no AI credit was used.' };
    await saveResult(result).catch(() => undefined);
    return json(result);
  } catch (e) {
    return json({ error: (e instanceof Error ? e.message : String(e)).slice(0, 300) }, 502);
  }
}
