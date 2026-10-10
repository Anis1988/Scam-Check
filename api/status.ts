import { guard, json } from '../server/guard';
import { aiReady, MODEL } from '../server/ai';
import { aiLimit, aiUsed, storeReady } from '../server/store';

/** GET /api/status -> what is set up, and today's AI use. */
export async function GET(req: Request): Promise<Response> {
  const blocked = guard(req, 'status', 30);
  if (blocked) return blocked;
  return json({ ai: aiReady(), store: storeReady(), model: MODEL, used: await aiUsed().catch(() => 0), limit: aiLimit(), safeBrowsing: !!process.env.GOOGLE_SAFE_BROWSING_KEY });
}
