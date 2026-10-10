import { guard, json } from '../server/guard.js';
import { getFile } from '../server/store.js';

/** GET /api/file?id=... -> the kept picture or PDF of a saved check ({mime, name, data base64}). */
export async function GET(req: Request): Promise<Response> {
  const blocked = guard(req, 'file', 30);
  if (blocked) return blocked;
  const id = new URL(req.url).searchParams.get('id') ?? '';
  if (!/^[a-f0-9]{32}$/.test(id)) return json({ error: 'Bad id.' }, 400);
  const f = await getFile(id).catch(() => null);
  return f ? json(f) : json({ error: 'This file is no longer kept (deleted or cleaned up).' }, 404);
}
