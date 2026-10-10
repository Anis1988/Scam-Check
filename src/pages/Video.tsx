import { useEffect, useRef, useState, useSyncExternalStore, type DragEvent } from 'react';
import { api, uploadVideo } from '../lib/api';
import { FACT_LABEL, type FactVerdict, type VideoResult } from '../lib/types';
import { refreshStatus, useStatus } from '../lib/useStatus';
import { CheckedBy } from '../components/ResultCard';
import { Rail, Shell, toast } from '../components/ui';

/**
 * 🎬 Video: is it true? Your video checks are kept on this device (the last 20) and outside this screen, so switching
 * tabs doesn't stop them; the server finishes each one even if the app closes, and this list picks it up.
 */
const KEY = 'sc.videos';
let list: VideoResult[] = (() => { try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') as VideoResult[]; } catch { return []; } })();
const subs = new Set<() => void>();
const progress = new Map<string, number>(); // upload progress (0-1) while sending
function put(r: VideoResult) {
  list = [r, ...list.filter((x) => x.id !== r.id)].slice(0, 20);
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* full */ }
  subs.forEach((f) => f());
}
const useVideos = () => useSyncExternalStore((f) => (subs.add(f), () => void subs.delete(f)), () => list);
const newId = () => `v${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const isVideoLink = (s: string) => /^https?:\/\/([a-z0-9-]+\.)*(youtube\.com|youtu\.be|tiktok\.com)\//i.test(s.trim());

async function checkVideo(label: string, from: VideoResult['from'], send: (id: string) => Promise<Omit<Parameters<typeof api.videoCheck>[0], 'id' | 'label'>>) {
  const id = newId();
  put({ id, status: 'pending', from, label, checkedAt: new Date().toISOString() });
  try {
    const b = await send(id);
    put(await api.videoCheck({ ...b, id, label }));
  } catch (e) {
    // The connection dropped while the server works: it is picked up later (see the polling below).
    const msg = e instanceof Error ? e.message : String(e);
    const r = await api.video(id).catch(() => null);
    put(r ?? { ...list.find((x) => x.id === id)!, status: 'failed', error: msg });
  } finally {
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
              <p className="label">Sources (Google Search)</p>
              <ul className="space-y-0.5">{r.sources.map((s) => <li key={s.url} className="truncate text-xs"><a className="text-teal-700 underline" href={s.url} target="_blank" rel="noopener noreferrer" tabIndex={example ? -1 : 0}>{s.title || s.url}</a></li>)}</ul>
            </div>
          )}
          <p className="text-xs text-stone-500">An AI fact-check can be wrong. For anything important, look at the sources.</p>
        </div>
      )}
    </article>
  );
}

export function Video({ sharedLink = '' }: { sharedLink?: string }) {
  const st = useStatus();
  const videos = useVideos();
  const [link, setLink] = useState(sharedLink);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const ready = st?.providers?.gemini?.ready;
  const g = st?.providers?.gemini;
  const left = g && g.limit !== null ? Math.max(0, g.limit - g.used) : null;

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

  const addFile = (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith('video/') && !/\.(mp4|mov|m4v|webm|3gp|mkv|avi)$/i.test(f.name)) return toast('error', 'Choose a video file.');
    if (f.size > 500_000_000) return toast('error', 'This video is too big (500 MB max). Trim it, or use a YouTube link.');
    void checkVideo(f.name, 'upload', (id) => (progress.set(id, 0), uploadVideo(f, (s) => { progress.set(id, s); list = [...list]; subs.forEach((x) => x()); })));
  };
  const addLink = () => {
    const v = link.trim();
    if (!isVideoLink(v)) return toast('error', 'Paste a YouTube or TikTok link (or upload the video).');
    setLink('');
    void checkVideo(v, /tiktok\.com/i.test(v) ? 'tiktok' : 'youtube', async () => ({ url: v }));
  };
  useEffect(() => { if (sharedLink && isVideoLink(sharedLink) && ready) addLink(); }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps
  const onDrop = (e: DragEvent) => { e.preventDefault(); setOver(false); addFile(e.dataTransfer.files[0]); };

  return (
    <Shell right={
      <Rail title="How it works">
        <ol className="space-y-1.5 text-sm text-stone-600">
          <li><span className="num text-teal-700">01</span> Upload a video, or paste a YouTube or TikTok link</li>
          <li><span className="num text-teal-700">02</span> Gemini watches it (free)</li>
          <li><span className="num text-teal-700">03</span> Its claims are checked with Google Search</li>
        </ol>
      </Rail>
    }>
      <section className="card space-y-3" onDragOver={(e) => (e.preventDefault(), setOver(true))} onDragLeave={() => setOver(false)} onDrop={onDrop}>
        <div>
          <p className="label">Fact-check</p>
          <h1 className="text-2xl font-bold">Is this video true?</h1>
          <p className="text-sm text-stone-500">Upload a video or paste a link. You get true or false, a short summary in simple words, each claim checked, and the sources.</p>
        </div>
        {st && !ready && <p className="panel text-sm text-amber-800">This needs Gemini (free): get a key at <b>aistudio.google.com</b> → Get API key, add it in Vercel as <code>GEMINI_API_KEY</code>, then redeploy.</p>}
        <input ref={input} type="file" accept="video/*" className="hidden" onChange={(e) => { addFile(e.target.files?.[0]); e.target.value = ''; }} />
        <button type="button" className="dropzone" data-over={over} disabled={!ready} onClick={() => input.current?.click()}>
          <span className="text-3xl" aria-hidden="true">🎬</span>
          <span className="font-display font-semibold text-teal-900">Upload a video</span>
          <span className="text-xs text-stone-500">Tap to choose, or drag & drop here · up to 500 MB (about 20 minutes)</span>
        </button>
        <form className="flex gap-2" onSubmit={(e) => (e.preventDefault(), addLink())}>
          <input className="input min-w-0 flex-1" value={link} onChange={(e) => setLink(e.target.value)} placeholder="Or paste a YouTube / TikTok link" inputMode="url" autoCapitalize="off" spellCheck={false} aria-label="Video link" />
          <button className="btn" disabled={!ready || !link.trim()}>Check</button>
        </form>
        <p className="text-xs text-stone-500">TikTok links: no AI can watch them, so only the caption is checked. For the whole video, save it (Share → Save video) and upload it. {left !== null && ready ? `Uses 1 of ${left} Gemini checks left today.` : ''}</p>
      </section>
      {videos.length > 0 && <p className="label">Your video checks (on this device)</p>}
      <div className="space-y-2">{videos.map((r) => <VideoCard key={`${r.id}${r.status}`} r={r} />)}</div>
    </Shell>
  );
}
