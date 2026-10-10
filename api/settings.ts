import { z } from 'zod';
import { guard, json } from '../server/guard.js';
import { cleanUp, getSettings, saveSettings, storeReady } from '../server/store.js';

const Body = z.object({ cleanup: z.object({ enabled: z.boolean(), days: z.number().int().min(7).max(3650), what: z.enum(['files', 'all']) }) });

/** GET /api/settings -> the server settings. */
export async function GET(req: Request): Promise<Response> {
  const blocked = guard(req, 'settings', 30);
  if (blocked) return blocked;
  return json(await getSettings());
}

/** POST /api/settings {cleanup} -> saved; runs the clean-up once right away. */
export async function POST(req: Request): Promise<Response> {
  const blocked = guard(req, 'settings', 20);
  if (blocked) return blocked;
  if (!storeReady()) return json({ error: 'Settings need the Upstash Redis storage (Vercel → Storage).' }, 503);
  let b: z.infer<typeof Body>;
  try {
    b = Body.parse(await req.json());
  } catch {
    return json({ error: 'Invalid settings.' }, 400);
  }
  await saveSettings(b);
  const cleaned = await cleanUp(true).catch(() => 0);
  return json({ ...b, cleaned });
}
