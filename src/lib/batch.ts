import { useSyncExternalStore } from 'react';
import { api, type CheckInput } from './api';
import { saveToHistory } from './history';
import { keepInput } from './inputs';
import type { CheckResult } from './types';
import { refreshStatus } from './useStatus';

/**
 * The checks on the Check screen, kept outside the screen: switching tabs (or leaving the app for a moment) doesn't
 * stop or forget them. Every message is sent to the server at once, and the server finishes each one even if the
 * app or browser closes; History then picks up the answers.
 */
export interface Item { key: string; input?: CheckInput; result?: CheckResult; error?: string; waiting?: boolean; savedName?: string }
interface State { items: Item[]; busy: boolean; openKey: string }

let state: State = { items: [], busy: false, openKey: '' };
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export const useBatch = (): State => useSyncExternalStore((f) => (subs.add(f), () => void subs.delete(f)), () => state);
export function setBatch(p: Partial<State>): void {
  state = { ...state, ...p };
  emit();
}
export function patchItem(key: string, p: Partial<Item>): void {
  state = { ...state, items: state.items.map((x) => (x.key === key ? { ...x, ...p } : x)) };
  emit();
}
const itemOf = (key: string) => state.items.find((x) => x.key === key);

let seq = 0;
export const newKey = () => `k${Date.now()}-${seq++}`;

const failed = (r: CheckResult, e: unknown): CheckResult => ({ ...r, ai: 'failed', aiNote: `The AI check failed (${e instanceof Error ? e.message : e}). The result is from the free checks.` });

/** One message: free checks (at once), then the AI if needed. Its original is kept on this device for ↻ Re-check. */
async function runOne(it: Item): Promise<void> {
  if (!it.input) return;
  patchItem(it.key, { waiting: false });
  try {
    const r = await api.check(it.input);
    await keepInput(r.id, it.input);
    patchItem(it.key, { result: r });
    saveToHistory(r);
    if (r.ai === 'pending') {
      const done = await api.ai(it.input).catch((e) => failed(r, e));
      patchItem(it.key, { result: done });
      saveToHistory(done);
    }
  } catch (e) {
    patchItem(it.key, { error: e instanceof Error ? e.message : String(e) });
  }
}

/** Checks everything at once (each picture is its own check). */
export async function runBatch(inputs: CheckInput[]): Promise<void> {
  const items: Item[] = inputs.map((input) => ({ key: newKey(), input, waiting: true }));
  setBatch({ items, busy: true, openKey: '' });
  await Promise.all(items.map(runOne));
  setBatch({ busy: false });
  void refreshStatus();
}

/**
 * Asks the AI about one item: "Ask the AI" / "Summarize" (fresh = false), or ↻ Re-check with the AI picked in
 * Settings now (fresh = true, even if an answer is remembered). Uses 1 AI check.
 */
export async function askAgain(key: string, fresh: boolean): Promise<string | null> {
  const it = itemOf(key);
  if (!it?.input || !it.result) return null;
  const before = it.result;
  patchItem(key, { result: { ...before, ai: 'pending', aiOffer: false, briefOffer: false } });
  try {
    const done = await api.ai({ ...it.input, aiMode: 'always' }, fresh);
    patchItem(key, { result: done });
    saveToHistory(done);
    return done.ai === 'done' && !done.remembered ? null : done.aiNote ?? null;
  } catch (e) {
    patchItem(key, { result: before });
    return e instanceof Error ? e.message : String(e);
  } finally {
    void refreshStatus();
  }
}

/** One result shown on its own (from Recent, History, a look-up). Still-running ones are fetched from the server. */
export function showOne(r: CheckResult, input?: CheckInput): void {
  const key = newKey();
  setBatch({ items: [{ key, result: r, input }], openKey: '' });
  if (r.ai === 'pending') void api.result(r.id).then((x) => (patchItem(key, { result: x }), saveToHistory(x)), () => undefined);
}
