import { guard, json } from '../server/guard.js';
import { aiName, ready } from '../server/ai.js';
import { aiLimit, aiUsed, getSettings, storeReady } from '../server/store.js';
import { PROVIDERS, type Provider } from '../src/lib/types.js';

/**
 * GET /api/status -> what is set up, today's AI use and the settings (so every screen uses the same ones).
 * ai / used / limit / model are for the AI picked in Settings; providers gives every AI (Claude, Gemini, Groq…).
 */
export async function GET(req: Request): Promise<Response> {
  const blocked = guard(req, 'status', 30);
  if (blocked) return blocked;
  const settings = await getSettings();
  const providers = Object.fromEntries(await Promise.all(PROVIDERS.map(async (p) => [p.id, {
    ready: ready(p.id), used: await aiUsed(p.id).catch(() => 0), limit: await aiLimit(p.id),
  }] as const))) as Record<Provider, { ready: boolean; used: number; limit: number | null }>;
  const main = providers[settings.ai.provider];
  return json({
    ai: main.ready, store: storeReady(), model: aiName(settings.ai.provider, settings.ai), used: main.used, limit: main.limit,
    providers, claude: providers.claude, gemini: providers.gemini, safeBrowsing: !!process.env.GOOGLE_SAFE_BROWSING_KEY, settings,
  });
}
