import { Redis } from '@upstash/redis';
import type { AppSettings, Bill, BillCompare, CheckResult, ListEntry, SavedItem } from '../src/lib/types.js';
import { DEFAULT_SETTINGS } from '../src/lib/types.js';
import { LocalStore } from './localStore.js';

/**
 * Upstash Redis (Vercel → Storage → Upstash for Redis, free): check results (7 days by default: the same message is
 * never paid for twice), today's AI count, settings and ⭐ Saved. Messages are only stored when you save with
 * "Keep the original".
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

export async function getResult(id: string): Promise<CheckResult | null> {
  return (await db()?.get<CheckResult>(`sc:result:${id}`)) ?? null;
}
/** Kept for "Results remembered" days (Settings, 7 by default): the same message is answered again for free. */
export async function saveResult(r: CheckResult, days?: number): Promise<void> {
  const d = days ?? (await getSettings()).checks.rememberDays;
  await db()?.set(`sc:result:${r.id}`, r, { ex: Math.max(1, d) * 86400 });
}

/**
 * Paid AI: never more than the daily limit (Settings; starts from AI_DAILY_LIMIT, 5 by default), unless you chose
 * "Unlimited". No storage = no AI (the limit can't be kept). null = unlimited.
 */
export const aiLimit = async (): Promise<number | null> => {
  const s = await getSettings();
  return s.ai.unlimited ? null : s.ai.dailyLimit;
};
export const overLimit = async () => {
  const limit = await aiLimit();
  return limit !== null && (await aiUsed()) >= limit;
};
const dayKey = () => `sc:ai:${new Date().toISOString().slice(0, 10)}`;

export async function aiUsed(): Promise<number> {
  return Number((await db()?.get<number>(dayKey())) ?? 0);
}

/** Takes one AI check from today's budget (atomic); false when the limit is reached. */
export async function takeAi(): Promise<boolean> {
  const r = db();
  if (!r) return false;
  const limit = await aiLimit();
  const n = await r.incr(dayKey()); // counted even when unlimited, to show what was used today
  if (n === 1) await r.expire(dayKey(), 2 * 86400);
  if (limit !== null && n > limit) {
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
/** The next number for a saved check's name ("1-Duke Energy", "2-…"): it only goes up, even after deletes. */
export async function nextSavedNumber(): Promise<number> {
  return Number((await db()?.incr('sc:saved:seq')) ?? 1);
}
export async function deleteSaved(id: string): Promise<void> {
  await db()?.hdel(SAVED, id);
  await deleteFile(id);
}

/** A kept picture or PDF of a saved check (base64), until the check is deleted or cleaned up. */
export interface StoredFile { mime: string; name: string; data: string }
const FILE = (id: string) => `sc:file:${id}`;
export const putFile = async (id: string, f: StoredFile) => { await db()?.set(FILE(id), f); };
export const getFile = async (id: string) => (await db()?.get<StoredFile>(FILE(id))) ?? null;
export const deleteFile = async (id: string) => { await db()?.del(FILE(id)); };

/** The Vercel variables are only the starting values: what you choose in Settings wins. */
function startingSettings(): AppSettings {
  const d = DEFAULT_SETTINGS;
  const limit = Number(process.env.AI_DAILY_LIMIT);
  return { ...d, ai: { ...d.ai, model: process.env.AI_MODEL?.trim() || d.ai.model, dailyLimit: Number.isFinite(limit) && process.env.AI_DAILY_LIMIT ? Math.max(0, limit) : d.ai.dailyLimit } };
}
let cached: { at: number; s: AppSettings } | null = null;
export async function getSettings(): Promise<AppSettings> {
  if (cached && Date.now() - cached.at < 2000) return cached.s;
  const start = startingSettings();
  const s = await db()?.get<Partial<AppSettings>>('sc:settings');
  const out = Object.fromEntries((Object.keys(start) as (keyof AppSettings)[]).map((k) => [k, { ...start[k], ...((s?.[k] as object) ?? {}) }])) as unknown as AppSettings;
  cached = { at: Date.now(), s: out };
  return out;
}
/** Back to the starting values (the Vercel variables, or the app's defaults). */
export const resetSettings = async () => {
  await db()?.del('sc:settings');
  cached = null;
};
export const saveSettings = async (s: AppSettings) => {
  await db()?.set('sc:settings', s);
  cached = null;
};

/**
 * Auto clean-up (Settings): saved checks older than N days lose their kept picture and message ("files"),
 * or are deleted completely ("all"). Runs at most once an hour, when the Saved list is opened.
 */
export async function cleanUp(force = false): Promise<number> {
  const r = db();
  if (!r) return 0;
  const s = await getSettings();
  if (!s.cleanup.enabled) return 0;
  if (!force && (await r.get('sc:cleanup:recent'))) return 0;
  await r.set('sc:cleanup:recent', 1, { ex: 3600 });
  const cutoff = Date.now() - s.cleanup.days * 86400_000;
  let n = 0;
  for (const item of await listSaved()) {
    if (Date.parse(item.savedAt) > cutoff) continue;
    if (s.cleanup.what === 'all') {
      await deleteSaved(item.id);
      n++;
    } else if (item.file || item.text) {
      await deleteFile(item.id);
      await r.hset(SAVED, { [item.id]: { ...item, file: undefined, text: undefined, cleanedAt: new Date().toISOString() } });
      n++;
    }
  }
  return n;
}

/** 📅 Bills: safe bills the AI read (who, how much, when), kept until you delete them (max 300). */
const BILLS = 'sc:bills';
export async function listBills(): Promise<Bill[]> {
  const all = (await db()?.hgetall<Record<string, Bill>>(BILLS)) ?? {};
  return Object.values(all).sort((a, b) => (b.dueDate || b.checkedAt).localeCompare(a.dueDate || a.checkedAt));
}
export const companyKey = (c: string) => c.toLowerCase().replace(/\b(inc|llc|corp|co|company|the)\b\.?/g, '').replace(/[^a-z0-9]+/g, '');
/**
 * Records a bill and compares it with the same company's previous one. The same bill (company + due date)
 * checked twice counts once.
 */
export async function recordBill(r: CheckResult): Promise<BillCompare | undefined> {
  const d = db();
  if (!d || !r.bill) return undefined;
  const ck = companyKey(r.bill.company);
  if (!ck) return undefined;
  const key = `${ck}|${r.bill.dueDate || r.id}`;
  const all = await listBills();
  const old = all.find((b) => b.key === key);
  if (!old && all.length >= 300) return undefined;
  await d.hset(BILLS, { [key]: { ...r.bill, key, id: r.id, checkedAt: old?.checkedAt ?? r.checkedAt, paid: old?.paid } satisfies Bill });
  const when = (b: { dueDate: string; checkedAt: string }) => b.dueDate || b.checkedAt.slice(0, 10);
  const prev = all
    .filter((b) => b.key !== key && companyKey(b.company) === ck && when(b) < when({ dueDate: r.bill!.dueDate, checkedAt: r.checkedAt }))
    .sort((a, b) => when(b).localeCompare(when(a)))[0];
  if (!prev || !prev.amount) return undefined;
  return { prevAmount: prev.amount, prevDue: prev.dueDate, prevCheckedAt: prev.checkedAt, change: Math.round(((r.bill.amount - prev.amount) / prev.amount) * 100) };
}
export async function updateBill(key: string, patch: Partial<Bill>): Promise<Bill | null> {
  const d = db();
  const b = (await d?.hget<Bill>(BILLS, key)) ?? null;
  if (!d || !b) return null;
  const next = { ...b, ...patch, key };
  await d.hset(BILLS, { [key]: next });
  return next;
}
export const deleteBill = async (key: string) => { await db()?.hdel(BILLS, key); };

/** ✅ Trusted / 🚫 Blocked (max 500). */
const LISTS = 'sc:lists';
let listCache: { at: number; l: ListEntry[] } | null = null;
export async function getLists(): Promise<ListEntry[]> {
  if (listCache && Date.now() - listCache.at < 2000) return listCache.l;
  const all = (await db()?.hgetall<Record<string, ListEntry>>(LISTS)) ?? {};
  const l = Object.values(all).sort((a, b) => b.addedAt.localeCompare(a.addedAt));
  listCache = { at: Date.now(), l };
  return l;
}
export async function putList(e: ListEntry): Promise<void> {
  const d = db();
  if (!d) throw new Error('Lists need the Upstash Redis storage (Vercel → Storage).');
  if (!(await d.hexists(LISTS, e.key)) && (await d.hlen(LISTS)) >= 500) throw new Error('Your lists are full (500): remove some first.');
  await d.hset(LISTS, { [e.key]: e });
  listCache = null;
}
export async function deleteList(key: string): Promise<void> {
  await db()?.hdel(LISTS, key);
  listCache = null;
}
