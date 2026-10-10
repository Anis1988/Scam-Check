import type { AiMode, CheckResult } from './types';

/** Your past checks, kept on this device only (the last 50). */
const KEY = 'sc.history';
export function loadHistory(): CheckResult[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') as CheckResult[]; } catch { return []; }
}
export function saveToHistory(r: CheckResult): CheckResult[] {
  const list = [r, ...loadHistory().filter((x) => x.id !== r.id)].slice(0, 50);
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* full or private mode */ }
  return list;
}
export function clearHistory(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

const MODE_KEY = 'sc.aiMode';
export const getAiMode = (): AiMode => { try { const m = localStorage.getItem(MODE_KEY); return m === 'smart' || m === 'always' || m === 'never' ? m : 'ask'; } catch { return 'ask'; } };
export const setAiMode = (m: AiMode) => { try { localStorage.setItem(MODE_KEY, m); } catch { /* ignore */ } };
