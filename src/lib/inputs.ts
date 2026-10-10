import type { CheckInput } from './api';

/**
 * The original of each check in History (the words and the picture/PDF), kept on THIS device only (IndexedDB),
 * so ↻ Re-check can ask the AI again later. As many as History keeps; removed with History.
 */
const DB = 'scam-check';
const STORE = 'inputs';

function open(): Promise<IDBDatabase> {
  return new Promise((ok, fail) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fail(r.error);
  });
}
async function tx<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((ok, fail) => {
    const req = f(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => ok(req.result);
    req.onerror = () => fail(req.error);
  });
}

/** Keeps the original of a check (by its result id). Never throws: Re-check is just not offered if it fails. */
export async function keepInput(id: string, input: CheckInput): Promise<void> {
  try {
    const { file, ...rest } = input;
    // The small preview isn't needed again: only what the AI needs.
    await tx('readwrite', (s) => s.put({ ...rest, file: file ? { mime: file.mime, data: file.data, name: file.name } : undefined, at: Date.now() }, id));
  } catch { /* private mode or full */ }
}
export async function getInput(id: string): Promise<CheckInput | null> {
  try { return ((await tx('readonly', (s) => s.get(id))) as CheckInput | undefined) ?? null; } catch { return null; }
}
/**
 * Keeps only the originals of checks still in History. Ones from the last 10 minutes always stay: checks running
 * at the same time reach History one by one.
 */
export async function pruneInputs(keepIds: string[]): Promise<void> {
  try {
    const keys = (await tx('readonly', (s) => s.getAllKeys())) as string[];
    const vals = (await tx('readonly', (s) => s.getAll())) as { at?: number }[];
    const keep = new Set(keepIds);
    for (let i = 0; i < keys.length; i++) {
      if (!keep.has(keys[i]) && Date.now() - (vals[i]?.at ?? 0) > 10 * 60_000) await tx('readwrite', (s) => s.delete(keys[i]));
    }
  } catch { /* ignore */ }
}
export async function clearInputs(): Promise<void> {
  try { await tx('readwrite', (s) => s.clear()); } catch { /* ignore */ }
}
