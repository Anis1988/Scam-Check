import { z } from 'zod';
import type { CheckResult, SavedItem } from '../src/lib/types.js';
import { guard, json } from '../server/guard.js';
import { KIND_LABEL } from '../src/lib/types.js';
import { cleanUp, deleteFile, deleteSaved, getResult, getSaved, listSaved, nextSavedNumber, putFile, putSaved } from '../server/store.js';

const Post = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('save'), id: z.string().regex(/^[a-f0-9]{32}$/), note: z.string().trim().max(500).default(''),
    // "Keep the original": the message and the picture/PDF, so you can see (and download) them later.
    text: z.string().max(100_000).optional(),
    file: z.object({ mime: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']), name: z.string().max(200), data: z.string().max(4_300_000).regex(/^[A-Za-z0-9+/=]+$/) }).optional(),
  }),
  z.object({ action: z.literal('delete-file'), id: z.string().regex(/^[a-f0-9]{32}$/) }),
  z.object({ action: z.literal('note'), id: z.string().regex(/^[a-f0-9]{32}$/), note: z.string().trim().max(500), name: z.string().trim().min(1).max(80).optional() }),
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
    brief: r.brief,
  };
}

/** What it is, in a few words: the AI's title, else who it pretends to be, a real company's website, the sender, the kind. */
function titleOf(r: CheckResult): string {
  const real = r.links.map((l) => l.note.match(/^Real (.+) website/)?.[1]).find(Boolean);
  const fake = r.signals.map((s) => s.title.match(/^Pretends to be (.+)$/)?.[1]).find(Boolean);
  return (r.title || r.impersonating || (fake && `Fake ${fake}`) || real || r.sender?.name || r.links[0]?.domain || KIND_LABEL[r.kind].text).replace(/\s+/g, ' ').trim().slice(0, 60);
}
/** A file name the phone and computer accept. */
const fileName = (name: string, mime: string) => `${name.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'scam-check'}${mime === 'application/pdf' ? '.pdf' : mime === 'image/png' ? '.png' : '.jpg'}`;

/** GET /api/saved -> your saved checks (newest first). */
export async function GET(req: Request): Promise<Response> {
  const blocked = guard(req, 'saved', 30);
  if (blocked) return blocked;
  try {
    await cleanUp().catch(() => 0); // auto clean-up (Settings), at most once an hour
    return json(await listSaved());
  } catch (e) {
    return json({ error: (e instanceof Error ? e.message : String(e)).slice(0, 300) }, 502);
  }
}

/** POST /api/saved {action: save | note | delete | delete-file, id, note?, name?} */
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
    if (b.action === 'delete-file') {
      const item = await getSaved(b.id);
      if (!item) return json({ error: 'Not found.' }, 404);
      await deleteFile(b.id);
      const next = { ...item, file: undefined, text: undefined };
      await putSaved(next);
      return json(next);
    }
    if (b.action === 'note') {
      const item = await getSaved(b.id);
      if (!item) return json({ error: 'Not found.' }, 404);
      const name = b.name ?? item.name;
      const next = { ...item, note: b.note, name, file: item.file && name ? { ...item.file, name: fileName(name, item.file.mime) } : item.file };
      await putSaved(next);
      return json(next);
    }
    // Saved from the check's own result on the server (kept 7 days), so what is saved is what was checked.
    const r = await getResult(b.id);
    if (!r) return json({ error: 'This check is too old to save (results are kept 7 days). Check it again first.' }, 404);
    // A name that starts with a number going up with each save: "1-Duke Energy", "2-USPS package text"…
    // Saving the same check again keeps its name.
    const before = await getSaved(b.id);
    const name = before?.name ?? `${await nextSavedNumber()}-${titleOf(r)}`;
    const item: SavedItem = { ...keyFacts(r, b.note), name, text: b.text?.trim() || undefined };
    if (b.file) {
      const fname = fileName(name, b.file.mime);
      await putFile(b.id, { mime: b.file.mime, name: fname, data: b.file.data });
      item.file = { mime: b.file.mime, name: fname, size: Math.floor((b.file.data.length * 3) / 4) };
    }
    await putSaved(item);
    return json(item);
  } catch (e) {
    return json({ error: (e instanceof Error ? e.message : String(e)).slice(0, 300) }, 502);
  }
}
