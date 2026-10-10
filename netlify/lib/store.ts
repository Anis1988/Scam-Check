import { getStore } from '@netlify/blobs';

/** Netlify Blobs: check results (kept 7 days, so the same message is never paid for twice), the waiting AI jobs, the AI budget. */
export const store = () => getStore({ name: 'scam', consistency: 'strong' });

export async function readJson<T>(key: string, fallback: T): Promise<T> {
  return ((await store().get(key, { type: 'json' })) as T | null) ?? fallback;
}

export async function writeJson(key: string, value: unknown): Promise<void> {
  await store().setJSON(key, value);
}

/** Paid AI: never more than AI_DAILY_LIMIT checks a day (default 20). */
export const aiLimit = () => Math.max(0, Number(process.env.AI_DAILY_LIMIT ?? 20) || 0);
const today = () => new Date().toISOString().slice(0, 10);

export async function aiUsed(): Promise<number> {
  const b = await readJson<{ day: string; n: number }>('ai-budget', { day: today(), n: 0 });
  return b.day === today() ? b.n : 0;
}

/** Takes one AI check from today's budget; false when the limit is reached. */
export async function takeAi(): Promise<boolean> {
  const n = await aiUsed();
  if (n >= aiLimit()) return false;
  await writeJson('ai-budget', { day: today(), n: n + 1 });
  return true;
}
