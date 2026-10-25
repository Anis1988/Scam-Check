import { useEffect, useRef, useState, useSyncExternalStore, type DragEvent } from 'react';
import { api, uploadVideo, videoFrames } from '../lib/api';
import { openShared, type SharedFile } from '../lib/share';
import { done, once } from '../lib/history';
import { ModelMenu } from '../components/ModelMenu';
import { FACT_LABEL, modelName, providerOf, type FactVerdict, type ModelChoice, type Provider, type VideoResult } from '../lib/types';
import { refreshStatus, useStatus } from '../lib/useStatus';
import { CheckedBy } from '../components/ResultCard';
import { CameraButton } from '../components/Camera';
import { Rail, Shell, toast } from '../components/ui';

/**
 * 🎬 Video: is it true? Your video checks are kept on this device (the last 20) and outside this screen, so switching
 * tabs doesn't stop them; the server finishes each one even if the app closes, and this list picks it up.
 */
const KEY = 'sc.videos';
let list: VideoResult[] = (() => { try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') as VideoResult[]; } catch { return []; } })();
const subs = new Set<() => void>();
const progress = new Map<string, number>(); // upload progress (0-1) while sending
/** How to check a video again with another model (kept while the app is open). */
const retries = new Map<string, (m: ModelChoice) => void>();
/** Checks this device is still sending (pictures being taken from the video, upload): the server doesn't know them yet. */
const sending = new Set<string>();
function put(r: VideoResult) {
  list = [r, ...list.filter((x) => x.id !== r.id)].slice(0, 20);
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* full */ }
  subs.forEach((f) => f());
}
/**
 * 🔄 The video checks as the server has them (the same on the phone and the computer). Ones still uploading from
 * this device aren't on the server yet: they stay.
 */
async function syncVideos() {
  // Once per device: video checks from before the list was shared join it first.
  if (!once('sc.videosShared')) {
    const ok = !list.length || (await api.shareOldVideos(list.map((v) => v.id)).catch(() => null))?.synced;
    if (!ok) return;
    done('sc.videosShared');
  }
  const r = await api.videos().catch(() => null);
  if (!r?.synced) return;
  const known = new Set(r.videos.map((v) => v.id));
  const next = [...list.filter((v) => !known.has(v.id) && ((v.status === 'pending' && (progress.has(v.id) || sending.has(v.id))) || (v.status === 'failed' && retries.has(v.id)))), ...r.videos].slice(0, 50);
  if (JSON.stringify(next) === JSON.stringify(list)) return;
  list = next;
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* full */ }
  subs.forEach((f) => f());
}

/** 🗑 A video check: gone from every device and the server. */
async function removeVideo(r: VideoResult) {
  if (!window.confirm(`Delete this video check (${r.title || r.label})?`)) return;
  list = list.filter((x) => x.id !== r.id);
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* ignore */ }
  retries.delete(r.id);
  subs.forEach((f) => f());
  await api.deleteVideo(r.id).then(() => toast('success', 'Deleted.'), () => toast('success', 'Deleted from this device.'));
}
async function removeAllVideos() {
  if (!window.confirm(`Delete all ${list.length} video checks?`)) return;
  const ids = list.map((x) => x.id);
  list = [];
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  retries.clear();
  subs.forEach((f) => f());
  await Promise.all(ids.map((id) => api.deleteVideo(id).catch(() => undefined)));
  toast('success', 'All deleted.');
}
const useVideos = () => useSyncExternalStore((f) => (subs.add(f), () => void subs.delete(f)), () => list);
const newId = () => `v${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const isVideoLink = (s: string) => /^https?:\/\/([a-z0-9-]+\.)*(youtube\.com|youtu\.be|tiktok\.com)\//i.test(s.trim());

async function checkVideo(label: string, from: VideoResult['from'], send: (id: string) => Promise<Omit<Parameters<typeof api.videoCheck>[0], 'id' | 'label'>>) {
  const id = newId();
  const start: VideoResult = { id, status: 'pending', from, label, checkedAt: new Date().toISOString() };
  put(start);
  sending.add(id);
  try {
    const b = await send(id);
    put(await api.videoCheck({ ...b, id, label }));
  } catch (e) {
    // The connection dropped while the server works: it is picked up later (see the polling below).
    const msg = e instanceof Error ? e.message : String(e);
    const r = await api.video(id).catch(() => null);
    put(r ?? { ...(list.find((x) => x.id === id) ?? start), status: 'failed', error: msg });
  } finally {
    sending.delete(id);
    progress.delete(id);
    void refreshStatus();
  }
}

const TONE = { good: 'border-emerald-200 bg-emerald-50 text-emerald-800', warn: 'border-amber-200 bg-amber-50 text-amber-800', bad: 'border-red-200 bg-red-50 text-red-800', info: 'border-stone-200 bg-stone-100 text-stone-700' } as const;
export function FactChip({ v }: { v: FactVerdict }) {
  const f = FACT_LABEL[v];
  return <span className={`chip ${TONE[f.tone]}`}>{f.icon} {f.text}</span>;
}

/** One video's answer: true or false, a short summary, each claim, and the sources. */
export function VideoCard({ r, example = false }: { r: VideoResult; example?: boolean }) {
  const [open, setOpen] = useState(example || r.status !== 'done');
  const when = new Date(r.checkedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const p = progress.get(r.id);
  return (
    <article className="card space-y-2.5">
      <button className="flex w-full items-start gap-3 text-left" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white bg-white/70 text-2xl ${r.status === 'pending' ? 'scan' : ''}`} aria-hidden="true">{r.from === 'upload' ? '🎬' : r.from === 'youtube' ? '▶️' : '🎵'}</span>
        <span className="min-w-0 flex-1">
          {r.status === 'pending' ? <span className="chip border-teal-200 bg-teal-50 text-teal-800"><span className="spinner" /> {p !== undefined && p < 1 ? `Uploading ${Math.round(p * 100)}%` : 'Watching and checking…'}</span>
            : r.status === 'failed' ? <span className="chip border-amber-200 bg-amber-50 text-amber-800">⚠️ Couldn’t check it</span>
            : r.verdict && <FactChip v={r.verdict} />}
          <span className="mt-1 block truncate text-sm font-semibold text-stone-900">{r.title || r.label}</span>
          <span className="hud block truncate !text-[10px]">{r.from === 'upload' ? 'Uploaded' : r.from === 'youtube' ? 'YouTube' : 'TikTok'} · {when}</span>
        </span>
        <span className="text-stone-400" aria-hidden="true">{open ? '−' : '+'}</span>
      </button>
      {open && r.status === 'failed' && <p className="break-words text-sm text-amber-800">{r.error}</p>}
      {open && r.status === 'failed' && retries.has(r.id) && <ModelMenu label="⚠️ It failed: try another model" primary need="pictures" tried={r.tried} onPick={(m) => retries.get(r.id)?.(m)} />}
      {open && r.status === 'pending' && <p className="text-xs text-stone-500">This can take up to a few minutes for long videos. You can switch tabs or close the app: the answer will be here.</p>}
      {open && r.status === 'done' && (
        <div className="space-y-2.5 border-t border-stone-200/70 pt-2.5 text-sm">
          <CheckedBy ai="done" aiBy={r.aiBy} />
          {r.summary && <p className="text-stone-800">{r.summary}</p>}
          {r.claims && r.claims.length > 0 && (
            <div className="space-y-1.5">
              <p className="label">The claims</p>
              <ul className="space-y-2">
                {r.claims.map((c, i) => (
                  <li key={i} className="rounded-xl border border-stone-200/80 bg-white/60 p-2.5">
                    <FactChip v={c.verdict} />
                    <p className="mt-1 font-semibold text-stone-900">{c.claim}</p>
                    <p className="text-stone-600">{c.why}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {r.aiSigns && <p className="panel text-stone-700">🤖 {r.aiSigns}</p>}
          {r.note && <p className="break-words text-xs text-stone-500">{r.note}</p>}
          {r.sources && r.sources.length > 0 && (
            <div className="space-y-1">
              <p className="label">Sources (web search)</p>
              <ul className="space-y-0.5">{r.sources.map((s) => <li key={s.url} className="truncate text-xs"><a className="text-teal-700 underline" href={s.url} target="_blank" rel="noopener noreferrer" tabIndex={example ? -1 : 0}>{s.title || s.url}</a></li>)}</ul>
            </div>
          )}
          <p className="text-xs text-stone-500">An AI fact-check can be wrong. For anything important, look at the sources.</p>
          {retries.has(r.id) && !example && <ModelMenu label="↻ Re-check with another model" need="pictures" onPick={(m) => retries.get(r.id)?.(m)} />}
        </div>
      )}
      {open && !example && r.status !== 'pending' && <button className="btn w-full" onClick={() => void removeVideo(r)}>🗑 Delete this video check</button>}
    </article>
  );
}

export function Video({ sharedLink = '', sharedFile = null }: { sharedLink?: string; sharedFile?: SharedFile | null }) {
  const st = useStatus();
  const videos = useVideos();
  const [link, setLink] = useState(sharedLink);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  // The AI picked in Settings does the video checks, unless another one is picked here (e.g. it isn't set up).
  const [pick, setPick] = useState<ModelChoice | undefined>();
  const p = pick?.provider ?? st?.settings.ai.provider ?? 'gemini';
  const ready = st?.providers?.[p]?.ready;
  const g = st?.providers?.[p];
  const left = g && g.limit !== null ? Math.max(0, g.limit - g.used) : null;

  useEffect(() => {
    void syncVideos();
    const back = () => document.visibilityState === 'visible' && void syncVideos();
    document.addEventListener('visibilitychange', back);
    window.addEventListener('focus', back);
    return () => { document.removeEventListener('visibilitychange', back); window.removeEventListener('focus', back); };
  }, []);
  // Checks still running on the server (you switched tabs or closed the app): their answers are picked up here.
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const waiting = list.filter((r) => r.status === 'pending' && !progress.has(r.id));
      for (const r of waiting) {
        const x = await api.video(r.id).catch(() => null);
        if (x && x.status !== 'pending') put(x);
        else if (!x && Date.now() - Date.parse(r.checkedAt) > 10 * 60_000) put({ ...r, status: 'failed', error: 'The check didn’t finish. Try again.' });
      }
      return waiting.length > 0;
    };
    void (async () => { while (alive && (await tick())) await new Promise((ok) => setTimeout(ok, 6000)); })();
    return () => { alive = false; };
  }, []);

  /** The AI for this video: the one picked just now, else the one in Settings. */
  const providerFor = (m?: ModelChoice): Provider => m?.provider ?? st?.settings.ai.provider ?? 'gemini';
  const addFile = (f: File | undefined, m: ModelChoice | undefined = pick) => {
    if (!f) return;
    if (!f.type.startsWith('video/') && !/\.(mp4|mov|m4v|webm|3gp|mkv|avi)$/i.test(f.name)) return toast('error', 'Choose a video file.');
    if (f.size > 500_000_000) return toast('error', 'This video is too big (500 MB max). Trim it, or use a YouTube link.');
    // Gemini watches the whole video (sent straight to Google); the others look at pictures taken from it here.
    const p = providerFor(m);
    void checkVideo(f.name, 'upload', async (id) => {
      retries.set(id, (next) => addFile(f, next));
      if (p !== 'gemini') return { frames: await videoFrames(f), model: m };
      progress.set(id, 0);
      return { ...(await uploadVideo(f, (s) => { progress.set(id, s); list = [...list]; subs.forEach((x) => x()); })), model: m };
    });
  };
  const addLink = (again?: string, m: ModelChoice | undefined = pick) => {
    const v = (again ?? link).trim();
    if (!isVideoLink(v)) return toast('error', 'Paste a YouTube or TikTok link (or upload the video).');
    setLink('');
    void checkVideo(v, /tiktok\.com/i.test(v) ? 'tiktok' : 'youtube', async (id) => (retries.set(id, (next) => addLink(v, next)), { url: v, model: m }));
  };
  useEffect(() => { if (sharedLink && isVideoLink(sharedLink) && ready) addLink(); }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps
  // A video shared from the gallery or another app (Android app): checked as soon as the AI is known.
  const tookFile = useRef(false);
  useEffect(() => {
    if (!sharedFile || !ready || tookFile.current) return;
    tookFile.current = true;
    void openShared(sharedFile).then((f) => addFile(f), () => toast('error', 'The shared video could not be opened. Upload it with the button instead.'));
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps
  const onDrop = (e: DragEvent) => { e.preventDefault(); setOver(false); addFile(e.dataTransfer.files[0]); };

  return (
    <Shell right={
      <Rail title="How it works">
        <ol className="space-y-1.5 text-sm text-stone-600">
          <li><span className="num text-teal-700">01</span> Upload a video, or paste a YouTube or TikTok link</li>
          <li><span className="num text-teal-700">02</span> The AI from Settings watches it (Gemini), or looks at pictures from it (the others)</li>
          <li><span className="num text-teal-700">03</span> Its claims are checked with a web search</li>
        </ol>
      </Rail>
    }>
      <section className="card space-y-3" onDragOver={(e) => (e.preventDefault(), setOver(true))} onDragLeave={() => setOver(false)} onDrop={onDrop}>
        <div>
          <p className="label">Fact-check</p>
          <h1 className="text-2xl font-bold">Is this video true?</h1>
          <p className="text-sm text-stone-500">Upload a video or paste a link. You get true or false, a short summary in simple words, each claim checked, and the sources.</p>
        </div>
        {st && <p className="hud">🤖 {pick ? modelName(pick.provider, pick.id) : st.model}{p !== 'gemini' ? ' · looks at pictures from the video (no sound): pick a Gemini model in Settings to watch it whole' : ' · watches the whole video'}</p>}
        {st && (!ready || left === 0) && (
          <div className="panel space-y-2 text-sm text-amber-800">
            <p>{!ready ? <>{providerOf(p).name} isn’t set up (<code>{providerOf(p).env}</code> in Vercel).</> : `Today’s ${providerOf(p).name} checks are used up.`} Pick another model to continue:</p>
            <ModelMenu label="🤖 Use another model" primary need="pictures" onPick={setPick} />
          </div>
        )}
        {pick && <button type="button" className="btn-ghost text-xs" onClick={() => setPick(undefined)}>✕ Back to the Settings model</button>}
        <input ref={input} type="file" accept="video/*" className="hidden" onChange={(e) => { addFile(e.target.files?.[0]); e.target.value = ''; }} />
        <button type="button" className="dropzone" data-over={over} disabled={!ready || left === 0} onClick={() => input.current?.click()}>
          <span className="text-3xl" aria-hidden="true">🎬</span>
          <span className="font-display font-semibold text-teal-900">Upload a video</span>
          <span className="text-xs text-stone-500">Tap to choose, or drag & drop here · up to 500 MB (about 20 minutes with Gemini)</span>
        </button>
        <CameraButton mode="video" label="🎥 Record a video" disabled={!ready || left === 0} onFiles={(f) => addFile(f[0])} className="btn w-full" />
        <form className="flex gap-2" onSubmit={(e) => (e.preventDefault(), addLink())}>
          <input className="input min-w-0 flex-1" value={link} onChange={(e) => setLink(e.target.value)} placeholder="Or paste a YouTube / TikTok link" inputMode="url" autoCapitalize="off" spellCheck={false} aria-label="Video link" />
          <button className="btn" disabled={!ready || left === 0 || !link.trim()}>Check</button>
        </form>
        <p className="text-xs text-stone-500">TikTok links: no AI can watch them, so only the caption and cover are checked. For the whole video, save it (Share → Save video) and upload it. {left !== null && ready ? `Uses 1 of ${left} ${providerOf(p).name} checks left today.` : ''}</p>
      </section>
      {videos.length > 0 && (
        <div className="flex items-center justify-between gap-2">
          <p className="label">Your video checks</p>
          <button className="btn-ghost text-xs" onClick={() => void removeAllVideos()}>🗑 Delete all</button>
        </div>
      )}
      <div className="space-y-2">{videos.map((r) => <VideoCard key={`${r.id}${r.status}`} r={r} />)}</div>
    </Shell>
  );
}
