import { useEffect, useState } from 'react';
import { api, getCode, type Status } from './api';

/** What is set up, today's AI use and the settings: loaded once, shared by every screen, refreshed after changes. */
let current: Status | null = null;
let loading: Promise<void> | null = null;
/** Why the last load failed ('' = it didn't), so screens can say so instead of loading forever. */
let lastError = '';
const errListeners = new Set<(e: string) => void>();
const listeners = new Set<(s: Status | null) => void>();

export function refreshStatus(): Promise<void> {
  loading = api.status().then(
    (s) => { current = s; lastError = ''; listeners.forEach((f) => f(s)); errListeners.forEach((f) => f('')); },
    (e) => { lastError = e instanceof Error ? e.message : String(e); errListeners.forEach((f) => f(lastError)); },
  ).finally(() => { loading = null; });
  return loading;
}
/** After saving settings: everyone sees them at once. */
export function setStatusSettings(settings: Status['settings']): void {
  if (!current) return;
  current = { ...current, settings, model: settings.ai.model, limit: settings.ai.unlimited ? null : settings.ai.dailyLimit };
  listeners.forEach((f) => f(current));
}

export function useStatus(): Status | null {
  const [s, setS] = useState(current);
  useEffect(() => {
    listeners.add(setS);
    if (!current && !loading && getCode()) void refreshStatus();
    return () => void listeners.delete(setS);
  }, []);
  return s;
}

/** AI checks left today (null = unlimited or not known yet). */
export const aiLeft = (s: Status | null) => (s && s.limit !== null ? Math.max(0, s.limit - s.used) : null);

/** The error of the last status load ('' when fine). */
export function useStatusError(): string {
  const [e, setE] = useState(lastError);
  useEffect(() => {
    errListeners.add(setE);
    return () => void errListeners.delete(setE);
  }, []);
  return e;
}
