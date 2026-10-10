import { Redis } from '@upstash/redis';
import type { CheckResult, SavedItem } from '../src/lib/types';
import { LocalStore } from './localStore';

/**
 * Upstash Redis (Vercel → Storage → Upstash for Redis, free): check results for 7 days (the same message is
 * never paid for twice) and today's AI count. Messages themselves are never stored.
 */
let redis: Redis | null | undefined;
function db(): Redis | null {
  if (redis !== undefined) return redis;
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  // npm run dev without Upstash keys: a small local file instead (set by vite.config.ts, never on Vercel).
  redis = url && token ? new Redis({ url, token }) : process.env.SCAM_LOCAL_STORE === '1' ? (new LocalStore() as unknown as Redis) : null;
  return redis;
}
export const storeReady = () => !!db();

const WEEK = 7 * 86400;
export async function getResult(id: string): Promise<CheckResult | null> {
  return (await db()?.get<CheckResult>(`sc:result:${id}`)) ?? null;
}
export async function saveResult(r: CheckResult): Promise<void> {
  await db()?.set(`sc:result:${r.id}`, r, { ex: WEEK });
}

/** Paid AI: never more than AI_DAILY_LIMIT checks a day (default 5). No storage = no AI (the limit can't be kept). */
export const aiLimit = () => Math.max(0, Number(process.env.AI_DAILY_LIMIT ?? 5) || 0);
const dayKey = () => `sc:ai:${new Date().toISOString().slice(0, 10)}`;

export async function aiUsed(): Promise<number> {
  return Number((await db()?.get<number>(dayKey())) ?? 0);
}

/** Takes one AI check from today's budget (atomic); false when the limit is reached. */
export async function takeAi(): Promise<boolean> {
  const r = db();
  if (!r) return false;
  const n = await r.incr(dayKey());
  if (n === 1) await r.expire(dayKey(), 2 * 86400);
  if (n > aiLimit()) {
    await r.decr(dayKey());
    return false;
  }
  return true;
}

/** ⭐ Saved checks: kept until you delete them (max 500). */
const SAVED = 'sc:saved';
export async function listSaved(): Promise<SavedItem[]> {
  const all = (await db()?.hgetall<Record<string, SavedItem>>(SAVED)) ?? {};
  return Object.values(all).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}
export async function putSaved(item: SavedItem): Promise<void> {
  const r = db();
  if (!r) throw new Error('Saving needs the free Upstash Redis storage (Vercel → Storage).');
  if (!(await r.hexists(SAVED, item.id)) && (await r.hlen(SAVED)) >= 500) throw new Error('You have 500 saved checks: delete some old ones first.');
  await r.hset(SAVED, { [item.id]: item });
}
export async function getSaved(id: string): Promise<SavedItem | null> {
  return (await db()?.hget<SavedItem>(SAVED, id)) ?? null;
}
export async function deleteSaved(id: string): Promise<void> {
  await db()?.hdel(SAVED, id);
}
