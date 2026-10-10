import { z } from 'zod';
import type { CheckResult, SavedItem } from '../src/lib/types.js';
import { guard, json } from '../server/guard.js';
import { deleteSaved, getResult, getSaved, listSaved, putSaved } from '../server/store.js';

const Post = z.discriminatedUnion('action', [
  z.object({ action: z.literal('save'), id: z.string().regex(/^[a-f0-9]{32}$/), note: z.string().trim().max(500).default('') }),
  z.object({ action: z.literal('note'), id: z.string().regex(/^[a-f0-9]{32}$/), note: z.string().trim().max(500) }),
  z.object({ action: z.literal('delete'), id: z.string().regex(/^[a-f0-9]{32}$/) }),
]);

/** Only the key facts of a check: verdict, who it pretended to be, sender, numbers, websites, reasons, steps, a short excerpt. */
function keyFacts(r: CheckResult, note: string): SavedItem {
  const reasons = [...new Set(r.signals.filter((s) => s.weight > 0 || s.source === 'ai').sort((a, b) => b.weight - a.weight).map((s) => s.title))].slice(0, 6);
  return {
    id: r.id, savedAt: new Date().toISOString(), checkedAt: r.checkedAt, note, kind: r.kind, verdict: r.verdict, unchecked: r.unchecked, score: r.score,
    summary: r.summary.slice(0, 400), impersonating: r.impersonating?.slice(0, 80),
    sender: r.sender ? { name: r.sender.name?.slice(0, 80), address: r.sender.address?.slice(0, 120) } : undefined,
    links: r.links.slice(0, 6).map((l) => ({ domain: l.domain.slice(0, 120), note: l.note.slice(0, 160), level: l.level })),
    phones: r.phones.slice(0, 6).map((p) => ({ number: p.number.slice(0, 30), note: p.note.slice(0, 160), level: p.level })),
    reasons: reasons.map((x) => x.slice(0, 120)),
    whatToDo: r.whatToDo.slice(0, 4).map((x) => x.slice(0, 240)),
    excerpt: r.preview.slice(0, 140),
  };
}

/** GET /api/saved -> your saved checks (newest first). */
export async function GET(req: Request): Promise<Response> {
  const blocked = guard(req, 'saved', 30);
  if (blocked) return blocked;
  try {
    return json(await listSaved());
  } catch (e) {
    return json({ error: (e instanceof Error ? e.message : String(e)).slice(0, 300) }, 502);
  }
}

/** POST /api/saved {action: save | note | delete, id, note?} */
export async function POST(req: Request): Promise<Response> {
  const blocked = guard(req, 'saved', 30);
  if (blocked) return blocked;
  let b: z.infer<typeof Post>;
  try {
    b = Post.parse(await req.json());
  } catch {
    return json({ error: 'Invalid request.' }, 400);
  }
  try {
    if (b.action === 'delete') return (await deleteSaved(b.id), json({ ok: true }));
    if (b.action === 'note') {
      const item = await getSaved(b.id);
      if (!item) return json({ error: 'Not found.' }, 404);
      const next = { ...item, note: b.note };
      await putSaved(next);
      return json(next);
    }
    // Saved from the check's own result on the server (kept 7 days), so what is saved is what was checked.
    const r = await getResult(b.id);
    if (!r) return json({ error: 'This check is too old to save (results are kept 7 days). Check it again first.' }, 404);
    const item = keyFacts(r, b.note);
    await putSaved(item);
    return json(item);
  } catch (e) {
    return json({ error: (e instanceof Error ? e.message : String(e)).slice(0, 300) }, 502);
  }
}
