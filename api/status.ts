import { guard, json } from '../server/guard.js';
import { aiName, claudeReady, geminiReady } from '../server/ai.js';
import { aiUsed, getSettings, storeReady } from '../server/store.js';

/**
 * GET /api/status -> what is set up, today's AI use and the settings (so every screen uses the same ones).
 * ai / used / limit / model are for the AI chosen in Settings (Claude or Gemini); claude and gemini give both.
 */
export async function GET(req: Request): Promise<Response> {
  const blocked = guard(req, 'status', 30);
  if (blocked) return blocked;
  const settings = await getSettings();
  const s = settings.ai;
  const claude = { ready: claudeReady(), used: await aiUsed('claude').catch(() => 0), limit: s.unlimited ? null : s.dailyLimit };
  const gemini = { ready: geminiReady(), used: await aiUsed('gemini').catch(() => 0), limit: s.geminiDailyLimit };
  const main = s.provider === 'gemini' ? gemini : claude;
  return json({
    ai: main.ready, store: storeReady(), model: aiName(s.provider, s), used: main.used, limit: main.limit,
    claude, gemini, safeBrowsing: !!process.env.GOOGLE_SAFE_BROWSING_KEY, settings,
  });
}
