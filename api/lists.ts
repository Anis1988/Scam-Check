import { z } from 'zod';
import { guard, json } from '../server/guard.js';
import { listKey, normalize } from '../server/lists.js';
import { deleteList, getLists, putList } from '../server/store.js';

const Post = z.discriminatedUnion('action', [
  z.object({ action: z.literal('add'), value: z.string().trim().min(3).max(200), list: z.enum(['trusted', 'blocked']) }),
  z.object({ action: z.literal('remove'), key: z.string().max(260) }),
]);

/** GET /api/lists -> ✅ trusted and 🚫 blocked phone numbers, email addresses and websites. */
export async function GET(req: Request): Promise<Response> {
  const blocked = guard(req, 'lists', 30);
  if (blocked) return blocked;
  return json(await getLists().catch(() => []));
}

/** POST /api/lists {action: add, value, list} | {action: remove, key} */
export async function POST(req: Request): Promise<Response> {
  const blocked = guard(req, 'lists', 30);
  if (blocked) return blocked;
  let b: z.infer<typeof Post>;
  try {
    b = Post.parse(await req.json());
  } catch {
    return json({ error: 'Invalid request.' }, 400);
  }
  try {
    if (b.action === 'remove') return (await deleteList(b.key), json({ ok: true }));
    const n = normalize(b.value);
    if (!n) return json({ error: 'Type a phone number, an email address or a website (like chase.com).' }, 400);
    const e = { key: listKey(n), ...n, list: b.list, addedAt: new Date().toISOString() };
    await putList(e);
    return json(e);
  } catch (e) {
    return json({ error: (e instanceof Error ? e.message : String(e)).slice(0, 300) }, 502);
  }
}
