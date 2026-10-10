import type { AiMode, AppSettings, CheckResult, Kind, SavedItem } from './types';

const CODE_KEY = 'sc.accessCode';
export const getCode = (): string => { try { return localStorage.getItem(CODE_KEY) ?? ''; } catch { return ''; } };
export const setCode = (c: string): void => { try { if (c) localStorage.setItem(CODE_KEY, c); else localStorage.removeItem(CODE_KEY); } catch { /* private mode */ } };

/** Vercel's error pages carry a code like FUNCTION_INVOCATION_FAILED or NOT_FOUND: shown to find the cause fast. */
const vercelCode = (raw: string) => {
  const code = raw.match(/\b([A-Z]+(?:_[A-Z]+)+)\b/)?.[1];
  return code ? `, ${code}` : raw.trim() ? `: ${raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)}` : '';
};

export async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const code = getCode();
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}), ...(code ? { 'X-Access-Token': code } : {}) } });
  } catch {
    throw new Error('Could not reach the server. Check your internet connection.');
  }
  let data: any = null;
  const raw = await res.text().catch(() => '');
  try { data = JSON.parse(raw); } catch { /* not JSON: e.g. Vercel's own error page */ }
  if (!res.ok || data === null) {
    if (res.status === 401) window.dispatchEvent(new Event('sc-unauthorized'));
    if (res.status === 413) throw new Error('That file is too big. Use a smaller picture or a PDF under 3 MB.');
    const local = /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);
    const noServer = local
      ? `The server part didn't answer (HTTP ${res.status}). Get the latest code (git pull, npm install), then restart npm run dev (not npm run preview).`
      : `The server part didn't answer (HTTP ${res.status}${vercelCode(raw)}). Check Vercel → Logs.`;
    throw new Error(data?.error ?? (data === null ? (res.status === 504 ? 'The check took too long. Try again.' : noServer) : `HTTP ${res.status}`));
  }
  return data as T;
}

/** limit null = unlimited. */
export interface Status { ai: boolean; store: boolean; model: string; used: number; limit: number | null; safeBrowsing: boolean; settings: AppSettings }
export interface Upload { mime: string; data: string; name: string; preview?: string }

export interface CheckInput { kind: Kind; text?: string; from?: string; file?: Upload; aiMode: AiMode }

/** SHA-256 of the file (the server reuses a result for the same file without receiving it again). */
const hashOf = async (s: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((x) => x.toString(16).padStart(2, '0')).join('');

export const api = {
  status: () => call<Status>('/api/status'),
  /** The free checks, at once (the file itself isn't sent here). */
  check: async (b: CheckInput) =>
    call<CheckResult>('/api/check', { method: 'POST', body: JSON.stringify({ kind: b.kind, text: b.text || undefined, from: b.from || undefined, fileHash: b.file ? await hashOf(b.file.data) : undefined, aiMode: b.aiMode }) }),
  /** The AI's opinion (10-40 s): the same message, with the file. */
  ai: (b: CheckInput) =>
    call<CheckResult>('/api/ai', { method: 'POST', body: JSON.stringify({ kind: b.kind, text: b.text || undefined, from: b.from || undefined, file: b.file ? { mime: b.file.mime, data: b.file.data } : undefined, aiMode: b.aiMode }) }),
  result: (id: string) => call<CheckResult>(`/api/check?id=${encodeURIComponent(id)}`),
  saved: () => call<SavedItem[]>('/api/saved'),
  save: (id: string, note: string, keep?: { text?: string; file?: Upload }) =>
    call<SavedItem>('/api/saved', { method: 'POST', body: JSON.stringify({ action: 'save', id, note, text: keep?.text?.trim() || undefined, file: keep?.file ? { mime: keep.file.mime, name: keep.file.name, data: keep.file.data } : undefined }) }),
  file: (id: string) => call<{ mime: string; name: string; data: string }>(`/api/file?id=${encodeURIComponent(id)}`),
  removeFile: (id: string) => call<SavedItem>('/api/saved', { method: 'POST', body: JSON.stringify({ action: 'delete-file', id }) }),
  settings: () => call<AppSettings>('/api/settings'),
  resetSettings: () => call<AppSettings & { cleaned: number }>('/api/settings', { method: 'POST', body: JSON.stringify({ reset: true }) }),
  saveSettings: (s: AppSettings) => call<AppSettings & { cleaned: number }>('/api/settings', { method: 'POST', body: JSON.stringify(s) }),
  setNote: (id: string, note: string, name?: string) => call<SavedItem>('/api/saved', { method: 'POST', body: JSON.stringify({ action: 'note', id, note, name: name?.trim() || undefined }) }),
  unsave: (id: string) => call<{ ok: boolean }>('/api/saved', { method: 'POST', body: JSON.stringify({ action: 'delete', id }) }),
};

/**
 * Pictures are made smaller on the phone first (1400 px by default, Settings → Pictures, JPEG): fast to upload and
 * fewer AI credits (a picture's cost grows with its size), while text in screenshots stays readable.
 * PDFs are sent as they are (3 MB max).
 */
export async function readUpload(f: File, maxSize = 1400): Promise<Upload> {
  if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) {
    if (f.size > 3 * 1024 * 1024) throw new Error('This PDF is over 3 MB. Take a photo or screenshot of the page instead.');
    return { mime: 'application/pdf', data: await toBase64(f), name: f.name };
  }
  if (/\.eml$/i.test(f.name) || f.type === 'message/rfc822') throw new Error('EML');
  if (!f.type.startsWith('image/') && !/\.(heic|heif|jpe?g|png|webp|gif)$/i.test(f.name)) throw new Error('Choose a picture (photo or screenshot) or a PDF.');
  const img = await loadImage(f);
  const k = Math.min(1, maxSize / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * k);
  c.height = Math.round(img.height * k);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  URL.revokeObjectURL(img.src);
  const url = c.toDataURL('image/jpeg', 0.8);
  return { mime: 'image/jpeg', data: url.split(',')[1], name: f.name, preview: url };
}

function loadImage(f: File): Promise<HTMLImageElement> {
  return new Promise((ok, fail) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => fail(new Error('This picture could not be opened. Try a screenshot (PNG/JPEG) instead.'));
    img.src = URL.createObjectURL(f);
  });
}

const toBase64 = (f: File) => new Promise<string>((ok, fail) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result).split(',')[1] ?? '');
  r.onerror = () => fail(new Error('The file could not be read.'));
  r.readAsDataURL(f);
});

/** A kept file (base64) -> a link the browser can show or save. */
export function fileLink(f: { mime: string; data: string }): string {
  const bin = atob(f.data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: f.mime }));
}

/** Saves a kept file to the phone or computer (Downloads), named after the saved check ("1-Duke Energy.jpg"). */
export function downloadFile(f: { mime: string; name: string; data: string }): void {
  const href = fileLink(f);
  const ext = f.mime === 'application/pdf' ? '.pdf' : f.mime === 'image/png' ? '.png' : '.jpg';
  const base = f.name.replace(/[\\/:*?"<>|]+/g, ' ').trim();
  const name = /\.(jpe?g|png|pdf|webp|gif)$/i.test(base) ? base : `${base || 'scam-check'}${ext}`;
  const a = Object.assign(document.createElement('a'), { href, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 60_000);
}
