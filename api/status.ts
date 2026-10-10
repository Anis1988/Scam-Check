import { guard, json } from '../server/guard.js';
import { aiReady } from '../server/ai.js';
import { aiUsed, getSettings, storeReady } from '../server/store.js';

/** GET /api/status -> what is set up, today's AI use, and the settings (so every screen uses the same ones). */
export async function GET(req: Request): Promise<Response> {
  const blocked = guard(req, 'status', 30);
  if (blocked) return blocked;
  const settings = await getSettings();
  return json({
    ai: aiReady(), store: storeReady(), model: settings.ai.model, used: await aiUsed().catch(() => 0),
    limit: settings.ai.unlimited ? null : settings.ai.dailyLimit, safeBrowsing: !!process.env.GOOGLE_SAFE_BROWSING_KEY, settings,
  });
}
