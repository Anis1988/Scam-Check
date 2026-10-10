import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { CheckResult } from '../../src/lib/types';
import { guard, json } from '../lib/guard';
import { buildResult, freeChecks, type FreeResult } from '../lib/analyze';
import { aiReady } from '../lib/ai';
import { readJson, store, takeAi, writeJson } from '../lib/store';

export const config = { path: '/api/check' };

const Body = z.object({
  kind: z.enum(['email', 'text', 'bill', 'screenshot']),
  text: z.string().max(100_000).optional(),
  from: z.string().trim().max(60).optional(),
  file: z.object({ mime: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']), data: z.string().max(6_000_000).regex(/^[A-Za-z0-9+/=]+$/) }).optional(),
  aiMode: z.enum(['smart', 'always', 'never']).default('smart'),
});

/** What the background AI job needs (kept until it is done). */
export interface Job { kind: CheckResult['kind']; text?: string; from?: string; file?: { mime: string; data: string }; free: FreeResult; base: CheckResult }

const EMPTY: FreeResult = { text: '', signals: [], links: [], phones: [] };

// POST /api/check {kind, text?, from?, file?, aiMode} -> the result (ai "pending": ask again with GET until it is done)
// GET  /api/check?id=...                             -> a result
export default async (req: Request): Promise<Response> => {
  const blocked = guard(req, 'check', 20);
  if (blocked) return blocked;
  try {
    if (req.method === 'GET') {
      const id = new URL(req.url).searchParams.get('id') ?? '';
      if (!/^[a-f0-9]{32}$/.test(id)) return json({ error: 'Bad id.' }, 400);
      const r = await readJson<CheckResult | null>(`result/${id}`, null);
      if (!r) return json({ error: 'Not found (results are kept 7 days).' }, 404);
      // An AI job that never finished (e.g. the background job crashed): stop waiting after 3 minutes.
      if (r.ai === 'pending' && Date.now() - Date.parse(r.checkedAt) > 180_000) return json({ ...r, ai: 'failed', aiNote: 'The AI check took too long. The result below is from the free checks.' });
      return json(r);
    }
    if (req.method !== 'POST') return json({ error: 'GET or POST only' }, 405);
    let b: z.infer<typeof Body>;
    try {
      b = Body.parse(await req.json());
    } catch (e) {
      return json({ error: e instanceof z.ZodError ? `Invalid request: ${e.issues[0]?.path.join('.')} ${e.issues[0]?.message}` : 'Invalid request (file too big? 4 MB max).' }, 400);
    }
    const text = (b.text ?? '').trim();
    if (!text && !b.file) return json({ error: 'Paste the message or add a picture first.' }, 400);
    const id = createHash('sha256').update(JSON.stringify([b.kind, b.from ?? '', text, b.file?.data.slice(0, 200_000) ?? '', b.file?.data.length ?? 0])).digest('hex').slice(0, 32);

    // Same message checked in the last 7 days: the saved answer (no new AI cost) — unless AI is now asked for.
    const cached = await readJson<(CheckResult & { savedAt?: number }) | null>(`result/${id}`, null);
    const fresh = cached && Date.now() - (cached.savedAt ?? Date.parse(cached.checkedAt)) < 7 * 86400_000;
    if (cached && fresh && (cached.ai === 'done' || cached.ai === 'pending' || b.aiMode !== 'always')) return json(cached);

    // 1. Free checks first: patterns, links, phone numbers, email sender.
    const free = text ? await freeChecks(text, { from: b.from }) : EMPTY;
    const preview = text || (b.file ? `${b.file.mime === 'application/pdf' ? 'PDF' : 'Picture'} (${b.kind})` : '');
    const base = buildResult(id, b.kind, preview, free, 'off');
    if (b.file && !text) Object.assign(base, { unchecked: true, summary: 'Pictures and PDFs are read by the AI check.' });

    // 2. AI, only when useful: pictures/PDFs, "always", or when the free checks aren't already sure it's a scam.
    const wantAi = b.aiMode === 'always' || (b.aiMode === 'smart' && (!!b.file || base.score < 65));
    let result: CheckResult = base;
    if (wantAi && !aiReady()) result = { ...base, ai: 'off', aiNote: 'The AI check is not set up (ANTHROPIC_API_KEY in Netlify).' };
    else if (wantAi && !(await takeAi())) result = { ...base, ai: 'limit', aiNote: 'Today’s AI checks are used up (AI_DAILY_LIMIT). The result below is from the free checks.' };
    else if (wantAi) {
      result = { ...base, ai: 'pending' };
      const job: Job = { kind: b.kind, text: text || undefined, from: b.from, file: b.file, free, base: result };
      await store().setJSON(`job/${id}`, job);
      await writeJson(`result/${id}`, { ...result, savedAt: Date.now() });
      // The AI can take 10-40 seconds: a background job does it, and the app asks for the result.
      const res = await fetch(new URL('/.netlify/functions/check-ai-background', req.url), { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Job-Key': process.env.APP_ACCESS_TOKEN ?? '' }, body: JSON.stringify({ id }) }).catch(() => null);
      if (!res || res.status >= 400) result = { ...base, ai: 'failed', aiNote: 'The AI check could not start. The result below is from the free checks.' };
      else return json(result);
    } else if (b.aiMode === 'smart' && base.score >= 65) result = { ...base, ai: 'skipped', aiNote: 'The free checks were already sure, so no AI credit was used.' };
    await writeJson(`result/${id}`, { ...result, savedAt: Date.now() });
    return json(result);
  } catch (e) {
    return json({ error: (e instanceof Error ? e.message : String(e)).slice(0, 300) }, 502);
  }
};
