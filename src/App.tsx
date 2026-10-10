import { useEffect, useRef, useState } from 'react';
import { App as NativeApp } from '@capacitor/app';
import { AppUpdateCheck } from './components/AppUpdate';
import { DEFAULT_SERVER, getServer, isNative, setServer } from './lib/native';
import { Toasts } from './components/ui';
import { Check } from './pages/Check';
import { History } from './pages/History';
import { Saved } from './pages/Saved';
import { Guide } from './pages/Guide';
import { Settings } from './pages/Settings';
import { api, getCode, setCode } from './lib/api';
import { Video } from './pages/Video';
import { Lookup } from './pages/Lookup';
import { aiLeft, refreshStatus, useStatus } from './lib/useStatus';
import { sharedFiles, type SharedFile } from './lib/share';
import { getPrefs, setPrefs } from './lib/history';

const TABS = ['Check', 'Video', 'Lookup', 'Saved', 'History', 'Guide', 'Settings'] as const;
type Tab = (typeof TABS)[number];
const TAB_ICON: Record<Tab, string> = { Check: '🛡️', Video: '🎬', Lookup: '🏢', Saved: '⭐', History: '🕘', Guide: '📖', Settings: '⚙️' };
const TAB_LABEL: Partial<Record<Tab, string>> = { Lookup: 'Look up' };

/** A YouTube or TikTok link shared to the app (Share → Scam Check) opens the Video tab with it. */
function sharedVideoLink(): string {
  if (!window.location.pathname.startsWith('/share')) return '';
  const q = new URLSearchParams(window.location.search);
  const link = [q.get('url'), ...(q.get('text') ?? '').split(/\s+/)].find((x) => x && /^https?:\/\/([a-z0-9-]+\.)*(youtube\.com|youtu\.be|tiktok\.com)\//i.test(x)) ?? '';
  if (link) window.history.replaceState(null, '', '/video');
  return link;
}
/** A video file shared to the Android app (from the gallery, WhatsApp…) opens the Video tab and is checked. */
function sharedVideoFile(): SharedFile | null {
  if (!window.location.pathname.startsWith('/share')) return null;
  const f = sharedFiles(new URLSearchParams(window.location.search)).find((x) => x.mime.startsWith('video/')) ?? null;
  if (f) window.history.replaceState(null, '', '/video');
  return f;
}

function Logo() {
  return (
    <svg viewBox="0 0 512 512" width="36" height="36" aria-hidden="true" className="drop-shadow-[0_0_10px_rgba(74,146,155,0.35)]">
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#4A929B" /><stop offset="1" stopColor="#6C65A9" /></linearGradient>
      </defs>
      <rect width="512" height="512" rx="120" fill="#F6F9FB" />
      <circle cx="256" cy="256" r="196" fill="none" stroke="url(#lg)" strokeWidth="8" strokeDasharray="18 14" opacity=".45" />
      <path d="M256 92 394 144v100c0 88-58 150-138 174-80-24-138-86-138-174V144z" fill="url(#lg)" />
      <path d="m196 262 42 42 82-90" fill="none" stroke="#fff" strokeWidth="34" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** ☀️/🌙: light or dark, remembered on this device (also in Settings → This device). */
function ThemeButton() {
  const [dark, setDark] = useState(() => getPrefs().theme === 'dark');
  useEffect(() => { const upd = () => setDark(getPrefs().theme === 'dark'); window.addEventListener('sc-prefs', upd); return () => window.removeEventListener('sc-prefs', upd); }, []);
  return (
    <button type="button" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-stone-200/80 bg-white/60 text-lg transition hover:shadow-[0_0_0_3px_rgba(74,146,155,0.15)] active:scale-95"
      onClick={() => setPrefs({ ...getPrefs(), theme: dark ? 'light' : 'dark' })} aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'} title={dark ? 'Light mode' : 'Dark mode'}>
      <span aria-hidden="true">{dark ? '☀️' : '🌙'}</span>
    </button>
  );
}

/** Today's AI checks, as a small HUD readout in the header. */
function AiMeter() {
  const st = useStatus();
  if (!st?.ai || !st.store) return null;
  const left = aiLeft(st);
  return (
    <span className="hidden items-center gap-1.5 rounded-full border border-white/80 bg-white/60 px-2.5 py-1 font-mono text-[11px] text-stone-600 sm:inline-flex" title="AI checks left today">
      <span className={`pulse-glow h-1.5 w-1.5 rounded-full ${left === 0 ? 'bg-amber-400' : 'bg-teal-500 shadow-[0_0_6px_#4A929B]'}`} />
      AI {left === null ? '∞' : `${left}/${st.limit}`}
    </span>
  );
}

function AccessGate({ onDone }: { onDone: () => void }) {
  const [v, setV] = useState('');
  const [server, setSrv] = useState(getServer);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  // In the app: the address and code are tested first, so a wrong address is said at once, not later.
  const done = async () => {
    if (!isNative()) return (setCode(v.trim()), onDone());
    setServer(server);
    setCode(v.trim());
    setBusy(true);
    setErr('');
    try {
      await api.status();
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="card mx-auto max-w-sm space-y-3">
      <h1 className="text-xl font-semibold">Enter your access code</h1>
      <p className="text-sm text-stone-500">The code you set as <code>APP_ACCESS_TOKEN</code> in Vercel. It keeps strangers from using your AI checks.</p>
      <input className="input w-full" type="password" value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && v && void done()} placeholder="Access code" autoFocus />
      {isNative() && (
        <label className="block space-y-1">
          <span className="label">Your site’s address</span>
          <input className="input w-full font-mono text-sm" value={server} onChange={(e) => setSrv(e.target.value)} inputMode="url" autoCapitalize="off" spellCheck={false} placeholder={DEFAULT_SERVER} />
          <span className="block text-xs text-stone-500">The address you open Scam Check at (Vercel → your project → Domains). Leave it if it already works.</span>
        </label>
      )}
      {err && <p className="panel text-sm text-red-700">{err}</p>}
      <button className="btn-primary w-full" disabled={!v || busy} onClick={() => void done()}>{busy ? <><span className="spinner" /> Checking…</> : 'Continue'}</button>
    </div>
  );
}

export default function App() {
  const [videoLink] = useState(sharedVideoLink);
  const [videoFile] = useState(sharedVideoFile);
  const [tab, setTab] = useState<Tab>(() => (TABS.find((t) => t !== 'Check' && window.location.pathname.toLowerCase().startsWith(`/${t.toLowerCase()}`)) ?? 'Check'));
  const [hasCode, setHasCode] = useState(!!getCode());
  useEffect(() => {
    const off = () => setHasCode(false);
    if (hasCode) void refreshStatus();
    window.addEventListener('sc-unauthorized', off);
    return () => window.removeEventListener('sc-unauthorized', off);
  }, [hasCode]);
  const go = (t: Tab) => {
    setTab(t);
    if (!window.location.pathname.startsWith('/share')) window.history.replaceState(null, '', t === 'Check' ? '/' : `/${t.toLowerCase()}`);
  };

  // Android app: the phone's back button goes back to Check, then puts the app in the background.
  const tabNow = useRef(tab);
  tabNow.current = tab;
  useEffect(() => {
    if (!isNative()) return;
    const h = NativeApp.addListener('backButton', () => {
      if (tabNow.current !== 'Check') go('Check');
      else void NativeApp.minimizeApp();
    });
    return () => void h.then((x) => x.remove());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen">
      <Toasts />
      <header className="sticky top-0 z-40 border-b border-white/70 bg-mist/75 backdrop-blur-xl" style={{ paddingTop: 'var(--safe-area-inset-top, env(safe-area-inset-top))' }}>
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-1 px-4 pt-2 md:flex-nowrap md:py-2.5">
          <div className="flex min-w-0 flex-1 items-center gap-2.5 md:flex-none">
            <Logo />
            <div className="min-w-0 leading-tight">
              <p className="font-display text-lg font-bold tracking-tight text-stone-900">Scam<span className="bg-gradient-to-r from-teal-600 to-iris-500 bg-clip-text text-transparent">Check</span></p>
              <p className="hud truncate !text-[10px]">Check before you click, call or pay</p>
            </div>
          </div>
          <span className="flex items-center gap-2 md:order-last"><AiMeter /><ThemeButton /></span>
          {/* Tabs with icons, at the top. */}
          <nav className="-mx-2 grid w-[calc(100%+1rem)] grid-cols-7 md:mx-auto md:flex md:w-auto md:gap-1 md:rounded-2xl md:border md:border-white/80 md:bg-white/50 md:p-1 md:shadow-[0_0_0_1px_rgba(31,66,71,0.05)]" aria-label="Main">
            {TABS.map((t) => (
              <button key={t} onClick={() => go(t)} aria-current={tab === t ? 'page' : undefined}
                className={`relative flex min-h-[48px] min-w-0 flex-col items-center justify-center gap-0.5 px-0 py-1.5 text-[10px] font-semibold tracking-tight transition md:min-h-0 md:flex-row md:gap-1.5 md:rounded-xl md:px-3.5 md:py-1.5 md:text-sm ${tab === t ? 'text-teal-800 md:bg-white md:shadow-[0_0_0_1px_rgba(74,146,155,0.25),0_4px_14px_-4px_rgba(74,146,155,0.45)]' : 'text-stone-500 hover:text-stone-800'}`}>
                <span className={`text-lg transition md:text-base ${tab === t ? 'drop-shadow-[0_0_6px_rgba(74,146,155,0.6)]' : 'opacity-80 grayscale-[35%]'}`} aria-hidden="true">{TAB_ICON[t]}</span>
                {TAB_LABEL[t] ?? t}
                {tab === t && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-gradient-to-r from-teal-500 to-iris-500 shadow-[0_0_8px_rgba(74,146,155,0.8)] md:hidden" />}
              </button>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 pb-16 pt-5" style={{ paddingBottom: 'calc(4rem + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)))' }}>
        <AppUpdateCheck />
        {tab === 'Guide' ? <Guide /> : !hasCode ? <AccessGate onDone={() => setHasCode(true)} /> : tab === 'Check' ? <Check /> : tab === 'Video' ? <Video sharedLink={videoLink} sharedFile={videoFile} /> : tab === 'Lookup' ? <Lookup /> : tab === 'Saved' ? <Saved /> : tab === 'History' ? <History /> : <Settings />}
      </main>
    </div>
  );
}
