import { Capacitor } from '@capacitor/core';

/** True inside the Android (later iPhone) app, false on the website. */
export const isNative = (): boolean => Capacitor.isNativePlatform();

/**
 * The app has no server of its own: it talks to the live website's server functions (Vercel).
 * The address is built in (VITE_API_BASE), and can be changed on the app's first screen.
 * On the website the paths stay relative ("/api/…"), exactly as before.
 */
const SERVER_KEY = 'sc.server';
export const DEFAULT_SERVER = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') || 'https://scamcheck.vercel.app';
export const getServer = (): string => { try { return localStorage.getItem(SERVER_KEY) || DEFAULT_SERVER; } catch { return DEFAULT_SERVER; } };
export function setServer(url: string): void {
  const clean = url.trim().replace(/\/+$/, '');
  try {
    if (!clean || clean === DEFAULT_SERVER) localStorage.removeItem(SERVER_KEY);
    else localStorage.setItem(SERVER_KEY, /^https?:\/\//i.test(clean) ? clean : `https://${clean}`);
  } catch { /* private mode */ }
}
export const apiUrl = (path: string): string => (isNative() && path.startsWith('/') ? getServer() + path : path);
