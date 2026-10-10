import type { CheckResult } from './types';
import { clearInputs, pruneInputs } from './inputs';

/** Choices that only apply to this phone or computer (Settings → This device). */
export interface DevicePrefs { textSize: 'normal' | 'large'; historySize: number; theme: 'light' | 'dark' }
const PREFS_KEY = 'sc.device';
export function getPrefs(): DevicePrefs {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<DevicePrefs>;
    return { textSize: p.textSize === 'large' ? 'large' : 'normal', historySize: [20, 50, 100].includes(p.historySize ?? 0) ? p.historySize! : 50, theme: p.theme === 'dark' ? 'dark' : 'light' };
  } catch {
    return { textSize: 'normal', historySize: 50, theme: 'light' };
  }
}
export function setPrefs(p: DevicePrefs): void {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* private mode */ }
  applyPrefs(p);
}
/** Bigger text (the whole app scales with the page's base size) and ☀️ light / 🌙 dark (the colours are CSS variables, index.css). */
export function applyPrefs(p = getPrefs()): void {
  const html = document.documentElement;
  html.classList.toggle('text-large', p.textSize === 'large');
  html.classList.toggle('dark', p.theme === 'dark');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', p.theme === 'dark' ? '#0D1418' : '#EBF0F3');
  window.dispatchEvent(new Event('sc-prefs'));
}

/** A one-time step already done on this device (e.g. sharing old lists with the server)? */
export const once = (key: string): boolean => { try { return localStorage.getItem(key) === '1'; } catch { return true; } };
export const done = (key: string): void => { try { localStorage.setItem(key, '1'); } catch { /* private mode */ } };

/** Your past checks, kept on this device only (the last 50 by default). */
const KEY = 'sc.history';
/** The last 100 checks, the same on every device (the server keeps as many). */
export const HISTORY_MAX = 100;
export function loadHistory(): CheckResult[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') as CheckResult[]; } catch { return []; }
}
export function saveToHistory(r: CheckResult): CheckResult[] {
  const list = [r, ...loadHistory().filter((x) => x.id !== r.id)].slice(0, HISTORY_MAX);
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* full or private mode */ }
  window.dispatchEvent(new Event('sc-history'));
  void pruneInputs(list.map((x) => x.id));
  return list;
}
/** 🔄 History as the server has it (the same on every device), kept here too for a quick start. */
export function replaceHistory(checks: CheckResult[]): CheckResult[] {
  const list = checks.slice(0, HISTORY_MAX);
  const before = localStorage.getItem(KEY);
  const next = JSON.stringify(list);
  if (before === next) return list;
  try { localStorage.setItem(KEY, next); } catch { /* full or private mode */ }
  window.dispatchEvent(new Event('sc-history'));
  void pruneInputs(list.map((x) => x.id));
  return list;
}

/** Takes checks out of History on this device (see deleteChecks in lib/batch for everywhere). */
export function dropFromHistory(ids: string[]): CheckResult[] {
  const gone = new Set(ids);
  const list = loadHistory().filter((x) => !gone.has(x.id));
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* ignore */ }
  window.dispatchEvent(new Event('sc-history'));
  return list;
}
export function clearHistory(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  void clearInputs();
  window.dispatchEvent(new Event('sc-history'));
}
