import type { AiMode, CheckResult, Kind } from './types';

const CODE_KEY = 'sc.accessCode';
export const getCode = (): string => { try { return localStorage.getItem(CODE_KEY) ?? ''; } catch { return ''; } };
export const setCode = (c: string): void => { try { if (c) localStorage.setItem(CODE_KEY, c); else localStorage.removeItem(CODE_KEY); } catch { /* private mode */ } };

export async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const code = getCode();
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}), ...(code ? { 'X-Access-Token': code } : {}) } });
  } catch {
    throw new Error('Could not reach the server. Check your internet connection.');
  }
  let data: any = null;
  try { data = await res.json(); } catch { /* not JSON */ }
  if (!res.ok || data === null) {
    if (res.status === 401) window.dispatchEvent(new Event('sc-unauthorized'));
    if (res.status === 413) throw new Error('That file is too big. Use a smaller picture or a PDF under 4 MB.');
    throw new Error(data?.error ?? (data === null ? 'The server part is not available here (it runs on Netlify).' : `HTTP ${res.status}`));
  }
  return data as T;
}

export interface Status { ai: boolean; model: string; used: number; limit: number; safeBrowsing: boolean }
export interface Upload { mime: string; data: string; name: string; preview?: string }

export const api = {
  status: () => call<Status>('/api/status'),
  check: (b: { kind: Kind; text?: string; from?: string; file?: Upload; aiMode: AiMode }) =>
    call<CheckResult>('/api/check', { method: 'POST', body: JSON.stringify({ kind: b.kind, text: b.text || undefined, from: b.from || undefined, file: b.file ? { mime: b.file.mime, data: b.file.data } : undefined, aiMode: b.aiMode }) }),
  result: (id: string) => call<CheckResult>(`/api/check?id=${encodeURIComponent(id)}`),
};

/** Waits for the AI part (asks every 2.5 s, up to about 3 minutes). */
export async function waitForAi(r: CheckResult, onUpdate: (r: CheckResult) => void): Promise<CheckResult> {
  let cur = r;
  for (let i = 0; i < 72 && cur.ai === 'pending'; i++) {
    await new Promise((ok) => setTimeout(ok, 2500));
    try { cur = await api.result(r.id); } catch { /* try again */ }
    if (cur.ai !== 'pending') onUpdate(cur);
  }
  return cur;
}

/**
 * Pictures are made smaller on the phone first (max 1600 px, JPEG), so they upload fast and stay under the limit.
 * PDFs are sent as they are (4 MB max).
 */
export async function readUpload(f: File): Promise<Upload> {
  if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) {
    if (f.size > 4 * 1024 * 1024) throw new Error('This PDF is over 4 MB. Take a photo or screenshot of the page instead.');
    return { mime: 'application/pdf', data: await toBase64(f), name: f.name };
  }
  if (/\.eml$/i.test(f.name) || f.type === 'message/rfc822') throw new Error('EML');
  if (!f.type.startsWith('image/') && !/\.(heic|heif|jpe?g|png|webp|gif)$/i.test(f.name)) throw new Error('Choose a picture (photo or screenshot) or a PDF.');
  const img = await loadImage(f);
  const k = Math.min(1, 1600 / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * k);
  c.height = Math.round(img.height * k);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  const url = c.toDataURL('image/jpeg', 0.85);
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
