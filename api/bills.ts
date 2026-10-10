import { z } from 'zod';
import { guard, json } from '../server/guard.js';
import { deleteBill, listBills, updateBill } from '../server/store.js';

const Post = z.discriminatedUnion('action', [
  z.object({ action: z.literal('paid'), key: z.string().max(200), paid: z.boolean() }),
  z.object({ action: z.literal('delete'), key: z.string().max(200) }),
]);

/** GET /api/bills -> 📅 your bills (the AI's reading of safe bills). */
export async function GET(req: Request): Promise<Response> {
  const blocked = guard(req, 'bills', 30);
  if (blocked) return blocked;
  return json(await listBills().catch(() => []));
}

/** POST /api/bills {action: paid | delete, key} */
export async function POST(req: Request): Promise<Response> {
  const blocked = guard(req, 'bills', 30);
  if (blocked) return blocked;
  let b: z.infer<typeof Post>;
  try {
    b = Post.parse(await req.json());
  } catch {
    return json({ error: 'Invalid request.' }, 400);
  }
  if (b.action === 'delete') return (await deleteBill(b.key), json({ ok: true }));
  const next = await updateBill(b.key, { paid: b.paid });
  return next ? json(next) : json({ error: 'Not found.' }, 404);
}
