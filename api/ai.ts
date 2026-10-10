import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { CheckResult } from '../src/lib/types';
import { guard, json } from '../server/guard';
import { askAi, aiReady } from '../server/ai';
import { buildResult, freeChecks } from '../server/analyze';
import { mergeAi } from '../server/merge';
import { getResult, saveResult, takeAi } from '../server/store';
import { Body, idOf } from './check';

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
    if (cached?.ai === 'done') return json(cached);
    if (!text && !b.file) return json({ error: 'Nothing to check.' }, 400);
    const free = text ? await freeChecks(text, { from: b.from }) : { text: '', signals: [], links: [], phones: [] };
    const base = buildResult(id, b.kind, text || (b.kind === 'bill' ? 'Bill (picture or PDF)' : 'Screenshot'), free, 'pending');
    if (!aiReady()) return json({ ...base, ai: 'off', aiNote: 'The AI check is not set up (ANTHROPIC_API_KEY in Vercel).' });
    if (!(await takeAi())) return json({ ...base, ai: 'limit', aiNote: 'Today’s AI checks are used up (AI_DAILY_LIMIT). The result below is from the free checks.', unchecked: !text || undefined });
    let result: CheckResult;
    try {
      const a = await askAi({ kind: b.kind, text: text || undefined, file: b.file, from: b.from, signals: free.signals });
      // A picture or PDF: the free checks also run on what the AI read in it (its links and phone numbers too).
      const all = text ? free : await freeChecks(a.readText, { from: b.from, links: a.links, phones: a.phones });
      result = mergeAi(base, all, a);
    } catch (e) {
      result = { ...base, ai: 'failed', unchecked: !text || undefined, aiNote: `The AI check failed (${(e instanceof Error ? e.message : String(e)).slice(0, 160)}). The result below is from the free checks.` };
    }
    await saveResult(result).catch(() => undefined);
    return json(result);
  } catch (e) {
    return json({ error: (e instanceof Error ? e.message : String(e)).slice(0, 300) }, 502);
  }
}
