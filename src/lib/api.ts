import type { AiMode, AppSettings, Bill, CheckResult, CompanyInfo, Kind, ListEntry, ModelChoice, Provider, SavedItem, VideoResult } from './types';

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
export interface AiUse { ready: boolean; used: number; limit: number | null }
/** ai / model / used / limit: the AI chosen in Settings (Claude or Gemini). */
export interface Status { ai: boolean; store: boolean; model: string; used: number; limit: number | null; providers: Record<Provider, AiUse>; claude: AiUse; gemini: AiUse; safeBrowsing: boolean; settings: AppSettings }
export interface Upload { mime: string; data: string; name: string; preview?: string }

export interface CheckInput { kind: Kind; text?: string; from?: string; file?: Upload; aiMode: AiMode }

/** SHA-256 of the file (the server reuses a result for the same file without receiving it again). */
const hashOf = async (s: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((x) => x.toString(16).padStart(2, '0')).join('');

export const api = {
  status: () => call<Status>('/api/status'),
  /** The free checks, at once (the file itself isn't sent here). */
  check: async (b: CheckInput) =>
    call<CheckResult>('/api/check', { method: 'POST', body: JSON.stringify({ kind: b.kind, text: b.text || undefined, from: b.from || undefined, fileHash: b.file ? await hashOf(b.file.data) : undefined, pdf: b.file?.mime === 'application/pdf' || undefined, aiMode: b.aiMode }) }),
  /** The AI's opinion (10-40 s): the same message, with the file. fresh = ↻ Re-check (ask again, even if remembered). */
  ai: (b: CheckInput, fresh = false, model?: ModelChoice) =>
    call<CheckResult>('/api/ai', { method: 'POST', body: JSON.stringify({ kind: b.kind, text: b.text || undefined, from: b.from || undefined, file: b.file ? { mime: b.file.mime, data: b.file.data } : undefined, pdf: b.file?.mime === 'application/pdf' || undefined, aiMode: b.aiMode, fresh: fresh || undefined, model }) }),
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
  /** 🎬 Video: the check (it keeps going on the server if the app closes; GET it again with its id). */
  videoCheck: (b: { id: string; label: string; file?: { name: string }; inline?: { mime: string; data: string }; url?: string; frames?: { mime: 'image/jpeg'; data: string }[]; model?: ModelChoice }) =>
    call<VideoResult>('/api/video', { method: 'POST', body: JSON.stringify({ action: 'check', ...b }) }),
  video: (id: string) => call<VideoResult>(`/api/video?id=${encodeURIComponent(id)}`),
  /** 🏢 A company's real contact details (live Google search). */
  company: (name: string, fresh = false, model?: ModelChoice) => call<CompanyInfo>('/api/company', { method: 'POST', body: JSON.stringify({ name, fresh: fresh || undefined, model }) }),
  /** ⚡ Quick look-up: just a link, phone number or email address (free checks only). */
  lookup: (value: string) => call<CheckResult>('/api/lookup', { method: 'POST', body: JSON.stringify({ value }) }),
  bills: () => call<Bill[]>('/api/bills'),
  billPaid: (key: string, paid: boolean) => call<Bill>('/api/bills', { method: 'POST', body: JSON.stringify({ action: 'paid', key, paid }) }),
  billDelete: (key: string) => call<{ ok: boolean }>('/api/bills', { method: 'POST', body: JSON.stringify({ action: 'delete', key }) }),
  lists: () => call<ListEntry[]>('/api/lists'),
  listAdd: (value: string, list: ListEntry['list']) => call<ListEntry>('/api/lists', { method: 'POST', body: JSON.stringify({ action: 'add', value, list }) }),
  listRemove: (key: string) => call<{ ok: boolean }>('/api/lists', { method: 'POST', body: JSON.stringify({ action: 'remove', key }) }),
  unsave: (id: string) => call<{ ok: boolean }>('/api/saved', { method: 'POST', body: JSON.stringify({ action: 'delete', id }) }),
};

/**
 * Pictures are made smaller on the phone first (1400 px by default, Settings → Pictures, JPEG): fast to upload and
 * fewer AI credits (a picture's cost grows with its size), while text in screenshots stays readable.
 * PDFs are sent as they are (3 MB max).
 */
export async function readUpload(f: File, maxSize = 1400): Promise<Upload> {
  if (isAudio(f)) return readAudio(f);
  if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) {
    if (f.size > 3 * 1024 * 1024) throw new Error('This PDF is over 3 MB. Take a photo or screenshot of the page instead.');
    return { mime: 'application/pdf', data: await toBase64(f), name: f.name };
  }
  if (/\.eml$/i.test(f.name) || f.type === 'message/rfc822') throw new Error('EML');
  if (!f.type.startsWith('image/') && !/\.(heic|heif|jpe?g|png|webp|gif)$/i.test(f.name)) throw new Error('Choose a picture (photo or screenshot), a PDF or a recording.');
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

/** 🎙️ A voicemail or recorded call. */
export const isAudio = (f: { type?: string; mime?: string; name?: string }) => (f.type ?? f.mime ?? '').startsWith('audio/') || /\.(mp3|m4a|aac|wav|ogg|oga|opus|amr|3gp|flac|webm)$/i.test(f.name ?? '');
const AUDIO_SENT_AS_IS: Record<string, string> = { mp3: 'audio/mpeg', m4a: 'audio/mp4', ogg: 'audio/ogg', opus: 'audio/ogg', webm: 'audio/webm', flac: 'audio/flac', wav: 'audio/wav' };

/**
 * A recording is made small on the phone: one channel, phone quality (16 kHz, or 8 kHz when longer than 1½ minutes),
 * as a WAV file every AI can take. At most 3 minutes (the server takes about 4 MB): longer ones keep their start.
 * Recordings the phone can't open (e.g. some .amr) are sent as they are when small enough.
 */
async function readAudio(f: File): Promise<Upload & { cut?: boolean }> {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  let audio: AudioBuffer;
  const ctx = new Ctx();
  try {
    audio = await ctx.decodeAudioData(await f.arrayBuffer());
  } catch {
    const mime = AUDIO_SENT_AS_IS[f.name.split('.').pop()?.toLowerCase() ?? ''];
    if (mime && f.size <= 3 * 1024 * 1024) return { mime, data: await toBase64(f), name: f.name };
    throw new Error('This recording can’t be opened here. Save it as MP3, M4A or WAV (up to 3 MB) and try again.');
  } finally {
    void ctx.close().catch(() => undefined);
  }
  const rate = audio.duration <= 90 ? 16000 : 8000;
  const secs = Math.min(audio.duration, rate === 16000 ? 90 : 180);
  const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(secs * rate)), rate);
  const src = off.createBufferSource();
  src.buffer = audio;
  src.connect(off.destination);
  src.start();
  const pcm = (await off.startRendering()).getChannelData(0);
  // 16-bit WAV
  const buf = new ArrayBuffer(44 + pcm.length * 2);
  const v = new DataView(buf);
  const str = (o: number, t: string) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + pcm.length * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, pcm[i])) * 0x7fff, true);
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { mime: 'audio/wav', data: btoa(bin), name: f.name.replace(/\.[^.]+$/, '') + '.wav', cut: audio.duration > secs + 1 };
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
  const ext = ({ 'application/pdf': '.pdf', 'image/png': '.png', 'audio/wav': '.wav', 'audio/mpeg': '.mp3', 'audio/mp4': '.m4a', 'audio/ogg': '.ogg', 'audio/webm': '.webm', 'audio/flac': '.flac' } as Record<string, string>)[f.mime] ?? '.jpg';
  const base = f.name.replace(/[\\/:*?"<>|]+/g, ' ').trim();
  const name = /\.(jpe?g|png|pdf|webp|gif|wav|mp3|m4a|ogg|webm|flac)$/i.test(base) ? base : `${base || 'scam-check'}${ext}`;
  const a = Object.assign(document.createElement('a'), { href, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 60_000);
}

/**
 * 🎬 A video from the phone or computer goes straight to Google (Vercel only takes 4.5 MB): the server opens the
 * upload (the key stays on the server), the video is sent to that one-time address, and Google returns its name.
 * Small videos (3 MB or less) can also go through the server if the direct upload fails.
 */
export async function uploadVideo(f: File, onProgress?: (share: number) => void): Promise<{ file?: { name: string }; inline?: { mime: string; data: string } }> {
  const mime = f.type && f.type.startsWith('video/') ? f.type : 'video/mp4';
  try {
    const { uploadUrl } = await call<{ uploadUrl: string }>('/api/video', { method: 'POST', body: JSON.stringify({ action: 'start', mime, size: f.size, name: f.name }) });
    const name = await new Promise<string>((ok, fail) => {
      const x = new XMLHttpRequest();
      x.open('POST', uploadUrl);
      x.setRequestHeader('X-Goog-Upload-Command', 'upload, finalize');
      x.setRequestHeader('X-Goog-Upload-Offset', '0');
      x.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
      x.onload = () => {
        try {
          const n = (JSON.parse(x.responseText) as { file?: { name?: string } }).file?.name;
          return n ? ok(n) : fail(new Error(`Upload failed (HTTP ${x.status})`));
        } catch { fail(new Error(`Upload failed (HTTP ${x.status})`)); }
      };
      x.onerror = () => fail(new Error('Upload failed'));
      x.send(f);
    });
    return { file: { name } };
  } catch (e) {
    if (f.size <= 3_000_000) return { inline: { mime, data: await toBase64(f) } };
    throw new Error(`The video couldn’t be uploaded (${e instanceof Error ? e.message : e}). Try a shorter clip, or a YouTube link.`);
  }
}

/**
 * 🎬 For AIs that can't watch videos (Claude, Groq, OpenRouter): a few pictures taken evenly from the video, on this
 * device (nothing else is sent). JPEG, 768 px max.
 */
export async function videoFrames(f: File, n = 6): Promise<{ mime: 'image/jpeg'; data: string }[]> {
  const url = URL.createObjectURL(f);
  const v = document.createElement('video');
  v.muted = true;
  v.playsInline = true;
  v.preload = 'auto';
  v.src = url;
  const wait = (ev: 'loadeddata' | 'seeked') => new Promise<void>((ok, fail) => {
    const t = setTimeout(() => fail(new Error('This video can’t be opened here: try another format, or pick a Gemini model')), 15000);
    v.addEventListener(ev, () => (clearTimeout(t), ok()), { once: true });
    v.addEventListener('error', () => (clearTimeout(t), fail(new Error('This video can’t be opened here: try another format, or pick a Gemini model'))), { once: true });
  });
  try {
    await wait('loadeddata');
    const d = Number.isFinite(v.duration) ? v.duration : 0;
    const c = document.createElement('canvas');
    const out: { mime: 'image/jpeg'; data: string }[] = [];
    for (let i = 0; i < (d ? n : 1); i++) {
      if (d) { v.currentTime = (d * (i + 0.5)) / n; await wait('seeked'); }
      const k = Math.min(1, 768 / Math.max(v.videoWidth || 768, v.videoHeight || 768));
      c.width = Math.round((v.videoWidth || 768) * k);
      c.height = Math.round((v.videoHeight || 432) * k);
      c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height);
      out.push({ mime: 'image/jpeg', data: c.toDataURL('image/jpeg', 0.7).split(',')[1] });
    }
    return out;
  } finally {
    URL.revokeObjectURL(url);
  }
}
