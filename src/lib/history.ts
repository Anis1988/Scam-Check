import type { CheckResult } from './types';
import { clearInputs, pruneInputs } from './inputs';

/** Choices that only apply to this phone or computer (Settings → This device). */
export interface DevicePrefs { textSize: 'normal' | 'large'; historySize: number }
const PREFS_KEY = 'sc.device';
export function getPrefs(): DevicePrefs {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<DevicePrefs>;
    return { textSize: p.textSize === 'large' ? 'large' : 'normal', historySize: [20, 50, 100].includes(p.historySize ?? 0) ? p.historySize! : 50 };
  } catch {
    return { textSize: 'normal', historySize: 50 };
  }
}
export function setPrefs(p: DevicePrefs): void {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* private mode */ }
  applyPrefs(p);
}
/** Bigger text: the whole app scales with the page's base size. */
export const applyPrefs = (p = getPrefs()) => document.documentElement.classList.toggle('text-large', p.textSize === 'large');

/** Your past checks, kept on this device only (the last 50 by default). */
const KEY = 'sc.history';
export function loadHistory(): CheckResult[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') as CheckResult[]; } catch { return []; }
}
export function saveToHistory(r: CheckResult): CheckResult[] {
  const list = [r, ...loadHistory().filter((x) => x.id !== r.id)].slice(0, getPrefs().historySize);
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* full or private mode */ }
  window.dispatchEvent(new Event('sc-history'));
  void pruneInputs(list.map((x) => x.id));
  return list;
}
export function clearHistory(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  void clearInputs();
  window.dispatchEvent(new Event('sc-history'));
}
