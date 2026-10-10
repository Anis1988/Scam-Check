import { Redis } from '@upstash/redis';
import type { CheckResult } from '../src/lib/types';

/**
 * Upstash Redis (Vercel → Storage → Upstash for Redis, free): check results for 7 days (the same message is
 * never paid for twice) and today's AI count. Messages themselves are never stored.
 */
let redis: Redis | null | undefined;
function db(): Redis | null {
  if (redis !== undefined) return redis;
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  redis = url && token ? new Redis({ url, token }) : null;
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

/** Paid AI: never more than AI_DAILY_LIMIT checks a day (default 20). No storage = no AI (the limit can't be kept). */
export const aiLimit = () => Math.max(0, Number(process.env.AI_DAILY_LIMIT ?? 20) || 0);
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
