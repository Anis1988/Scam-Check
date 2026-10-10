import { guard, json } from '../lib/guard';
import { aiReady, MODEL } from '../lib/ai';
import { aiLimit, aiUsed } from '../lib/store';

export const config = { path: '/api/status' };

// GET /api/status -> what is set up, and today's AI use
export default async (req: Request): Promise<Response> => {
  const blocked = guard(req, 'status', 30);
  if (blocked) return blocked;
  return json({ ai: aiReady(), model: MODEL, used: await aiUsed(), limit: aiLimit(), safeBrowsing: !!process.env.GOOGLE_SAFE_BROWSING_KEY });
};
