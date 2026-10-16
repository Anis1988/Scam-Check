/**
 * Something shared to the app (Share → Scam Check): the website's Web Share Target and the Android app both open
 * /share?title=…&text=…&url=… (the Android app can add files=…&mimes=…).
 *
 * Read ONCE, when this file is first loaded (before React draws anything), then the address is cleaned up.
 * Reading it inside a React state initializer and clearing the address there lost the text in development:
 * React's StrictMode calls initializers twice, and the second call found the address already cleared.
 */
const captured: URLSearchParams | null = (() => {
  try {
    if (!window.location.pathname.startsWith('/share')) return null;
    const q = new URLSearchParams(window.location.search);
    window.history.replaceState(null, '', '/');
    return q;
  } catch {
    return null;
  }
})();

const used = new Set<string>();

/** The shared parameters for one screen ("check", "video"…), or null when nothing was shared or it was already used. */
export const sharedParams = (screen: string): URLSearchParams | null => (used.has(screen) ? null : captured);
/** Called once the screen has shown it (in an effect), so coming back to that tab later doesn't show it again. */
export const shareUsed = (screen: string): void => void used.add(screen);

/** The shared message: title, text and link on separate lines. */
export const sharedText = (q: URLSearchParams | null): string =>
  q ? [q.get('title'), q.get('text'), q.get('url')].filter(Boolean).join('\n').slice(0, 20_000) : '';

/** A YouTube or TikTok link in what was shared (it opens 🎬 Video). */
export const sharedVideoLink = (q: URLSearchParams | null): string =>
  q ? [q.get('url'), ...(q.get('text') ?? '').split(/\s+/)].find((x) => x && /^https?:\/\/([a-z0-9-]+\.)*(youtube\.com|youtu\.be|tiktok\.com)\//i.test(x)) ?? '' : '';
