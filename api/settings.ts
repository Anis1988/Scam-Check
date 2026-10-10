import { z } from 'zod';
import { guard, json } from '../server/guard.js';
import { cleanUp, getSettings, resetSettings, saveSettings, storeReady } from '../server/store.js';

// Everything in Settings, checked before it is saved.
const Body = z.object({
  ai: z.object({
    mode: z.enum(['ask', 'smart', 'always', 'never']),
    model: z.string().trim().regex(/^claude-[a-z0-9.-]{2,60}$/, 'Unknown model name'),
    dailyLimit: z.number().int().min(0).max(1000),
    unlimited: z.boolean(),
    effort: z.enum(['low', 'medium', 'high']),
    summaries: z.boolean(),
    provider: z.enum(['claude', 'gemini', 'groq', 'openrouter']),
    geminiModel: z.string().trim().regex(/^gemini-[a-z0-9.-]{2,60}$/, 'Unknown Gemini model name'),
    geminiDailyLimit: z.number().int().min(0).max(1000),
    privateToClaude: z.boolean(),
    freeModels: z.object({ groq: z.string().trim().min(2).max(120), openrouter: z.string().trim().min(2).max(120) }),
    freeDailyLimit: z.number().int().min(0).max(1000),
  }),
  checks: z.object({ safeBrowsing: z.boolean(), websiteAge: z.boolean(), rememberDays: z.number().int().min(1).max(30) }),
  pictures: z.object({ maxSize: z.number().int().min(800).max(2400), maxBatch: z.number().int().min(1).max(10) }),
  saving: z.object({ keepOriginal: z.boolean() }),
  bills: z.object({ track: z.boolean() }),
  cleanup: z.object({ enabled: z.boolean(), days: z.number().int().min(7).max(3650), what: z.enum(['files', 'all']) }),
});

/** GET /api/settings -> the settings (what you chose, or the starting values from Vercel). */
export async function GET(req: Request): Promise<Response> {
  const blocked = guard(req, 'settings', 30);
  if (blocked) return blocked;
  return json(await getSettings());
}

/** POST /api/settings {all settings} -> saved; runs the clean-up once right away. {reset: true} -> starting values. */
export async function POST(req: Request): Promise<Response> {
  const blocked = guard(req, 'settings', 30);
  if (blocked) return blocked;
  if (!storeReady()) return json({ error: 'Settings need the Upstash Redis storage (Vercel → Storage).' }, 503);
  let b: z.infer<typeof Body>;
  try {
    const raw = await req.json();
    if (raw?.reset === true) return (await resetSettings(), json({ ...(await getSettings()), cleaned: 0 }));
    b = Body.parse(raw);
  } catch (e) {
    return json({ error: e instanceof z.ZodError ? `Invalid setting: ${e.issues[0]?.path.join('.')} ${e.issues[0]?.message}` : 'Invalid settings.' }, 400);
  }
  await saveSettings(b);
  const cleaned = await cleanUp(true).catch(() => 0);
  return json({ ...b, cleaned });
}
