import { useEffect, useRef, useState } from 'react';
import { Slide, Toasts } from './components/ui';
import { Check } from './pages/Check';
import { History } from './pages/History';
import { Saved } from './pages/Saved';
import { Guide } from './pages/Guide';
import { Settings } from './pages/Settings';
import { Video } from './pages/Video';
import { Docs } from './pages/Docs';
import { Lookup } from './pages/Lookup';
import { getCode, setCode } from './lib/api';
import { aiLeft, refreshStatus, useStatus } from './lib/useStatus';
import { syncHistory } from './lib/batch';
import { getPrefs, setPrefs } from './lib/history';

const TABS = ['Check', 'Docs', 'Video', 'Lookup', 'Saved', 'History', 'Guide', 'Settings'] as const;
type Tab = (typeof TABS)[number];
const TAB_ICON: Record<Tab, string> = { Check: '🛡️', Docs: '📄', Video: '🎬', Lookup: '🏢', Saved: '⭐', History: '🕘', Guide: '📖', Settings: '⚙️' };
const TAB_LABEL: Partial<Record<Tab, string>> = { Lookup: 'Look up' };

/** A YouTube or TikTok link shared to the app (Share → Scam Check) opens the Video tab with it. */
function sharedVideoLink(): string {
  if (!window.location.pathname.startsWith('/share')) return '';
  const q = new URLSearchParams(window.location.search);
  const link = [q.get('url'), ...(q.get('text') ?? '').split(/\s+/)].find((x) => x && /^https?:\/\/([a-z0-9-]+\.)*(youtube\.com|youtu\.be|tiktok\.com)\//i.test(x)) ?? '';
  if (link) window.history.replaceState(null, '', '/video');
  return link;
}

function Logo() {
  return (
    <svg viewBox="0 0 512 512" width="36" height="36" aria-hidden="true" className="drop-shadow-[0_0_10px_rgb(var(--c-glow)/0.35)]">
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
    <button type="button" className="tap flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-stone-200/80 bg-white/60 text-lg shadow-[inset_0_1px_0_rgb(var(--c-shine)/var(--shine))]"
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
    <span className="hidden items-center gap-1.5 rounded-full border border-white/80 bg-white/60 px-2.5 py-1.5 font-mono text-[11px] text-stone-600 shadow-[inset_0_1px_0_rgb(var(--c-shine)/var(--shine))] sm:inline-flex" title="AI checks left today">
      <span className={`pulse-glow h-1.5 w-1.5 rounded-full ${left === 0 ? 'bg-amber-400' : 'bg-teal-500 shadow-[0_0_6px_rgb(var(--c-glow))]'}`} />
      AI {left === null ? '∞' : `${left}/${st.limit}`}
    </span>
  );
}

function AccessGate({ onDone }: { onDone: () => void }) {
  const [v, setV] = useState('');
  return (
    <div className="card mx-auto max-w-sm space-y-3">
      <h1 className="text-xl font-semibold">Enter your access code</h1>
      <p className="text-sm text-stone-500">The code you set as <code>APP_ACCESS_TOKEN</code> in Vercel. It keeps strangers from using your AI checks.</p>
      <input className="input w-full" type="password" value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && v && (setCode(v.trim()), onDone())} placeholder="Access code" autoFocus />
      <button className="btn-primary w-full" disabled={!v} onClick={() => (setCode(v.trim()), onDone())}>Continue</button>
    </div>
  );
}

export default function App() {
  const [videoLink] = useState(sharedVideoLink);
  const [tab, setTab] = useState<Tab>(() => (TABS.find((t) => t !== 'Check' && window.location.pathname.toLowerCase().startsWith(`/${t.toLowerCase()}`)) ?? 'Check'));
  const [hasCode, setHasCode] = useState(!!getCode());
  // 🔄 History is the same on every device: fetched at start and each time you come back to the app.
  useEffect(() => {
    if (!hasCode) return;
    void syncHistory();
    const back = () => document.visibilityState === 'visible' && (void syncHistory(), void refreshStatus());
    document.addEventListener('visibilitychange', back);
    window.addEventListener('focus', back);
    return () => { document.removeEventListener('visibilitychange', back); window.removeEventListener('focus', back); };
  }, [hasCode]);
  useEffect(() => {
    const off = () => setHasCode(false);
    if (hasCode) void refreshStatus();
    window.addEventListener('sc-unauthorized', off);
    return () => window.removeEventListener('sc-unauthorized', off);
  }, [hasCode]);
  // The open tab scrolls into the middle of the tab row on phones.
  const nav = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const row = nav.current?.querySelector<HTMLElement>('.slide');
    const on = row?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!row || !on || row.scrollWidth <= row.clientWidth) return;
    row.scrollTo({ left: on.offsetLeft - (row.clientWidth - on.offsetWidth) / 2, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [tab]);
  const go = (t: Tab) => {
    setTab(t);
    if (!window.location.pathname.startsWith('/share')) window.history.replaceState(null, '', t === 'Check' ? '/' : `/${t.toLowerCase()}`);
  };

  return (
    <div className="min-h-screen">
      {/* Soft light beams drifting under a misty grid. */}
      <div className="backdrop" aria-hidden="true"><span className="beam beam-a" /><span className="beam beam-b" /><span className="beam beam-c" /><span className="beam-ray" /><span className="grid-lines" /></div>
      <Toasts />
      <header className="sticky top-0 z-40 border-b border-white/70 bg-mist/85 shadow-[0_8px_24px_-18px_rgb(var(--c-ink)/0.4)] backdrop-blur-2xl backdrop-saturate-150" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div ref={nav} className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-1 pt-2 md:flex-nowrap md:py-2.5" style={{ paddingLeft: 'max(1rem, env(safe-area-inset-left))', paddingRight: 'max(1rem, env(safe-area-inset-right))' }}>
          <div className="flex min-w-0 flex-1 items-center gap-2.5 md:flex-none">
            <Logo />
            <div className="min-w-0 leading-tight">
              <p className="font-display text-lg font-bold tracking-tight text-stone-900">Scam<span className="bg-gradient-to-r from-teal-600 to-iris-500 bg-clip-text text-transparent">Check</span></p>
              <p className="hud truncate !text-[10px]">Check before you click, call or pay</p>
            </div>
          </div>
          <span className="flex items-center gap-2 md:order-last"><AiMeter /><ThemeButton /></span>
          {/* Tabs with icons, at the top: a row that scrolls sideways on phones, with a glowing bar sliding under the open tab. */}
          <nav className="-mx-4 w-[calc(100%+2rem)] md:mx-auto md:w-auto" aria-label="Main">
            <Slide thumb="tab-thumb" className="no-scrollbar edge-fade flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain px-2 md:snap-none md:gap-1 md:overflow-visible md:rounded-2xl md:border md:border-white/80 md:bg-white/50 md:p-1 md:shadow-[0_0_0_1px_rgb(var(--c-ink)/0.05),inset_0_1px_0_rgb(var(--c-shine)/var(--shine))]">
              {TABS.map((t) => (
                <button key={t} onClick={() => go(t)} aria-current={tab === t ? 'page' : undefined}
                  className={`tap flex min-h-[54px] min-w-[66px] flex-1 shrink-0 snap-center flex-col items-center justify-center gap-0.5 rounded-xl px-2 pb-2 pt-1.5 text-[11px] font-semibold tracking-tight md:min-h-[38px] md:min-w-0 md:flex-none md:flex-row md:gap-1.5 md:px-3.5 md:py-1.5 md:text-sm ${tab === t ? 'text-teal-800' : 'text-stone-500 hover:text-stone-800'}`}>
                  <span className={`text-[1.2rem] leading-none transition-transform duration-500 md:text-base ${tab === t ? '-translate-y-px scale-110 drop-shadow-[0_0_6px_rgb(var(--c-glow)/0.6)] md:translate-y-0 md:scale-100' : 'opacity-75 grayscale-[35%]'}`} aria-hidden="true">{TAB_ICON[t]}</span>
                  <span className="whitespace-nowrap">{TAB_LABEL[t] ?? t}</span>
                </button>
              ))}
            </Slide>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 pb-16 pt-5" style={{ paddingBottom: 'max(4rem, calc(env(safe-area-inset-bottom) + 2rem))', paddingLeft: 'max(1rem, env(safe-area-inset-left))', paddingRight: 'max(1rem, env(safe-area-inset-right))' }}>
        <div key={tab} className="page-in">
          {tab === 'Guide' ? <Guide /> : !hasCode ? <AccessGate onDone={() => setHasCode(true)} /> : tab === 'Check' ? <Check /> : tab === 'Docs' ? <Docs /> : tab === 'Video' ? <Video sharedLink={videoLink} /> : tab === 'Lookup' ? <Lookup /> : tab === 'Saved' ? <Saved /> : tab === 'History' ? <History /> : <Settings />}
        </div>
      </main>
    </div>
  );
}
