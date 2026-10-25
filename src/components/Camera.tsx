import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import jsQR from 'jsqr';

export type CameraMode = 'photo' | 'video' | 'qr';

/** The back camera when there is one; sound only for videos. */
const CONSTRAINTS = (mode: CameraMode): MediaStreamConstraints => ({
  video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
  audio: mode === 'video',
});
const MAX_VIDEO_S = 120;

/** A frame of the camera as a JPEG file. */
function snap(v: HTMLVideoElement, name: string): Promise<File | null> {
  const c = document.createElement('canvas');
  c.width = v.videoWidth;
  c.height = v.videoHeight;
  c.getContext('2d')!.drawImage(v, 0, 0);
  return new Promise((ok) => c.toBlob((b) => ok(b ? new File([b], name, { type: 'image/jpeg' }) : null), 'image/jpeg', 0.9));
}

/** What the QR code in the camera says, or '' (read on the device, nothing is sent). */
type Detector = { detect: (s: CanvasImageSource) => Promise<{ rawValue: string }[]> };
async function qrIn(v: HTMLVideoElement, detector: Detector | null, c: HTMLCanvasElement): Promise<string> {
  if (detector) {
    try { return (await detector.detect(v))[0]?.rawValue ?? ''; } catch { /* fall back to jsQR */ }
  }
  const w = Math.min(v.videoWidth, 800);
  const h = Math.round((v.videoHeight / v.videoWidth) * w) || 0;
  if (!w || !h) return '';
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(v, 0, 0, w, h);
  return jsQR(ctx.getImageData(0, 0, w, h).data, w, h)?.data ?? '';
}

/**
 * 📷 The camera, inside the app: take photos (several in a row), record a video, or point at a QR code (read live,
 * on the device). Gives back the files when you tap Done (a QR code: the picture it was read in, at once).
 * If the camera can't be opened, onFallback lets the page open the phone's own camera or a file picker instead.
 */
export function Camera({ mode, max = 10, onDone, onClose, onFallback }: { mode: CameraMode; max?: number; onDone: (files: File[]) => void; onClose: () => void; onFallback?: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [shots, setShots] = useState<{ file: File; url: string }[]>([]);
  const [secs, setSecs] = useState<number | null>(null);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    let off = false;
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('This browser can’t open the camera here.');
      return;
    }
    navigator.mediaDevices.getUserMedia(CONSTRAINTS(mode)).then((s) => {
      if (off) return s.getTracks().forEach((t) => t.stop());
      stream.current = s;
      if (video.current) {
        video.current.srcObject = s;
        void video.current.play().catch(() => undefined);
      }
    }, (e: unknown) => setError(e instanceof DOMException && e.name === 'NotAllowedError' ? 'The camera is blocked: allow it for this website in your browser settings.' : 'The camera couldn’t be opened.'));
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    document.body.style.overflow = 'hidden';
    return () => {
      off = true;
      rec.current?.state === 'recording' && rec.current.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
      window.removeEventListener('keydown', esc);
      document.body.style.overflow = '';
    };
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => shots.forEach((s) => URL.revokeObjectURL(s.url)), []); // eslint-disable-line react-hooks/exhaustive-deps

  // 🔳 Live QR scan: look a few times a second; the first code found is used.
  useEffect(() => {
    if (mode !== 'qr' || !ready) return;
    const D = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
    let detector: Detector | null = null;
    try { detector = D ? new D({ formats: ['qr_code'] }) : null; } catch { detector = null; }
    const c = document.createElement('canvas');
    let stop = false;
    let busy = false;
    const t = window.setInterval(async () => {
      const v = video.current;
      if (stop || busy || !v || v.readyState < 2) return;
      busy = true;
      const found = await qrIn(v, detector, c).catch(() => '');
      if (found && !stop) {
        stop = true;
        navigator.vibrate?.(60);
        const f = await snap(v, `qr-${Date.now()}.jpg`);
        if (f) onDone([f]);
      }
      busy = false;
    }, 300);
    return () => { stop = true; window.clearInterval(t); };
  }, [mode, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  const takePhoto = async () => {
    const v = video.current;
    if (!v || shots.length >= max) return;
    const f = await snap(v, `photo-${shots.length + 1}-${Date.now()}.jpg`);
    if (!f) return;
    setFlash(true);
    window.setTimeout(() => setFlash(false), 150);
    setShots((s) => [...s, { file: f, url: URL.createObjectURL(f) }]);
  };

  const startVideo = () => {
    const s = stream.current;
    if (!s || typeof MediaRecorder === 'undefined') return setError('This browser can’t record video here.');
    const type = ['video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'].find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
    const r = new MediaRecorder(s, type ? { mimeType: type, videoBitsPerSecond: 2_500_000 } : undefined);
    const parts: Blob[] = [];
    r.ondataavailable = (e) => e.data.size && parts.push(e.data);
    r.onstop = () => {
      const mime = (r.mimeType || 'video/webm').split(';')[0];
      onDone([new File(parts, `video-${Date.now()}.${mime.includes('mp4') ? 'mp4' : 'webm'}`, { type: mime })]);
    };
    r.start(1000);
    rec.current = r;
    setSecs(0);
  };
  useEffect(() => {
    if (secs === null) return;
    if (secs >= MAX_VIDEO_S) return void rec.current?.stop();
    const t = window.setTimeout(() => setSecs((x) => (x === null ? x : x + 1)), 1000);
    return () => window.clearTimeout(t);
  }, [secs]);

  const title = mode === 'qr' ? '🔳 Point at the QR code' : mode === 'video' ? '🎥 Record a video' : '📷 Take photos';
  return createPortal(
    <div className="fixed inset-0 z-[60] flex flex-col bg-black text-white" role="dialog" aria-modal="true" aria-label={title}
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <p className="font-semibold">{title}</p>
        <button type="button" className="tap flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-lg" onClick={onClose} aria-label="Close the camera">✕</button>
      </div>
      <div className="relative min-h-0 flex-1">
        <video ref={video} playsInline muted autoPlay onLoadedData={() => setReady(true)} className="h-full w-full object-contain" />
        {flash && <div className="pointer-events-none absolute inset-0 bg-white/70" />}
        {mode === 'qr' && ready && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-56 w-56 rounded-3xl border-4 border-white/80 shadow-[0_0_0_9999px_rgb(0_0_0/0.35)]" />
          </div>
        )}
        {secs !== null && <p className="absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-red-600 px-3 py-1 font-mono text-sm">⏺ {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')} / 2:00</p>}
        {!ready && !error && <p className="absolute inset-0 flex items-center justify-center text-sm text-white/80"><span className="spinner" />&nbsp;Opening the camera…</p>}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
            <p>{error}</p>
            {onFallback && <button type="button" className="btn-primary" onClick={onFallback}>{mode === 'qr' ? '📷 Take a photo of it instead' : 'Use the phone’s camera or a file'}</button>}
          </div>
        )}
      </div>
      {mode === 'photo' && shots.length > 0 && (
        <ul className="flex gap-2 overflow-x-auto px-4 pt-3">
          {shots.map((s, i) => (
            <li key={s.url} className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-white/40">
              <img src={s.url} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" />
              <button type="button" className="absolute right-0.5 top-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-xs" onClick={() => setShots((x) => x.filter((y) => y !== s))} aria-label={`Remove photo ${i + 1}`}>✕</button>
            </li>
          ))}
        </ul>
      )}
      <div className="grid grid-cols-3 items-center gap-2 px-4 py-4">
        <span className="text-xs text-white/70">{mode === 'photo' ? `${shots.length} of ${max}` : mode === 'qr' ? 'Read on your phone, free' : 'Up to 2 minutes'}</span>
        {mode === 'photo' && <button type="button" disabled={!ready || shots.length >= max} onClick={() => void takePhoto()} aria-label="Take a photo" className="tap mx-auto h-[72px] w-[72px] rounded-full border-4 border-white bg-white/90 disabled:opacity-40" />}
        {mode === 'video' && (secs === null
          ? <button type="button" disabled={!ready} onClick={startVideo} aria-label="Start recording" className="tap mx-auto flex h-[72px] w-[72px] items-center justify-center rounded-full border-4 border-white"><span className="h-12 w-12 rounded-full bg-red-600" /></button>
          : <button type="button" onClick={() => rec.current?.stop()} aria-label="Stop recording" className="tap mx-auto flex h-[72px] w-[72px] items-center justify-center rounded-full border-4 border-white"><span className="h-7 w-7 rounded-md bg-red-600" /></button>)}
        {mode === 'qr' && <span />}
        {mode === 'photo' && shots.length > 0
          ? <button type="button" className="tap justify-self-end rounded-full bg-white px-5 py-2.5 font-semibold text-black" onClick={() => onDone(shots.map((s) => s.file))}>Done ({shots.length})</button>
          : <span />}
      </div>
    </div>,
    document.body,
  );
}

/** A button that opens the camera; if the camera can't open here, the phone's own camera (or a file picker) instead. */
export function CameraButton({ mode, label, max, onFiles, disabled, className = 'btn flex-1' }: { mode: CameraMode; label: string; max?: number; onFiles: (f: File[]) => void; disabled?: boolean; className?: string }) {
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" className={className} disabled={disabled} onClick={() => setOpen(true)}>{label}</button>
      <input ref={input} type="file" className="hidden" accept={mode === 'video' ? 'video/*' : 'image/*'} capture="environment" multiple={mode === 'photo'}
        onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ''; if (f.length) onFiles(f); }} />
      {open && <Camera mode={mode} max={max} onClose={() => setOpen(false)} onDone={(f) => { setOpen(false); onFiles(f); }} onFallback={() => { setOpen(false); input.current?.click(); }} />}
    </>
  );
}
