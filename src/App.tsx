import { useEffect, useState } from 'react';
import { Toasts } from './components/ui';
import { Check } from './pages/Check';
import { History } from './pages/History';
import { Saved } from './pages/Saved';
import { Guide } from './pages/Guide';
import { Settings } from './pages/Settings';
import { getCode, setCode } from './lib/api';
import { aiLeft, refreshStatus, useStatus } from './lib/useStatus';

const TABS = ['Check', 'Saved', 'History', 'Guide', 'Settings'] as const;
type Tab = (typeof TABS)[number];
const TAB_ICON: Record<Tab, string> = { Check: '🛡️', Saved: '⭐', History: '🕘', Guide: '📖', Settings: '⚙️' };

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
  const path = window.location.pathname;
  const [tab, setTab] = useState<Tab>(path.startsWith('/history') ? 'History' : path.startsWith('/saved') ? 'Saved' : path.startsWith('/guide') ? 'Guide' : path.startsWith('/settings') ? 'Settings' : 'Check');
  const [hasCode, setHasCode] = useState(!!getCode());
  useEffect(() => {
    const off = () => setHasCode(false);
    if (hasCode) void refreshStatus();
    window.addEventListener('sc-unauthorized', off);
    return () => window.removeEventListener('sc-unauthorized', off);
  }, [hasCode]);
  const go = (t: Tab) => {
    setTab(t);
    if (!path.startsWith('/share')) window.history.replaceState(null, '', t === 'Check' ? '/' : `/${t.toLowerCase()}`);
  };

  return (
    <div className="min-h-screen">
      <Toasts />
      <header className="sticky top-0 z-40 border-b border-white/70 bg-mist/75 backdrop-blur-xl" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-1 px-4 pt-2 md:flex-nowrap md:py-2.5">
          <div className="flex min-w-0 flex-1 items-center gap-2.5 md:flex-none">
            <Logo />
            <div className="min-w-0 leading-tight">
              <p className="font-display text-lg font-bold tracking-tight text-stone-900">Scam<span className="bg-gradient-to-r from-teal-600 to-iris-500 bg-clip-text text-transparent">Check</span></p>
              <p className="hud truncate !text-[10px]">Check before you click, call or pay</p>
            </div>
          </div>
          <span className="md:order-last"><AiMeter /></span>
          {/* Tabs with icons, at the top. */}
          <nav className="-mx-1 grid w-full grid-cols-5 md:mx-auto md:flex md:w-auto md:gap-1 md:rounded-2xl md:border md:border-white/80 md:bg-white/50 md:p-1 md:shadow-[0_0_0_1px_rgba(31,66,71,0.05)]" aria-label="Main">
            {TABS.map((t) => (
              <button key={t} onClick={() => go(t)} aria-current={tab === t ? 'page' : undefined}
                className={`relative flex min-h-[48px] flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[11px] font-semibold transition md:min-h-0 md:flex-row md:gap-1.5 md:rounded-xl md:px-3.5 md:py-1.5 md:text-sm ${tab === t ? 'text-teal-800 md:bg-white md:shadow-[0_0_0_1px_rgba(74,146,155,0.25),0_4px_14px_-4px_rgba(74,146,155,0.45)]' : 'text-stone-500 hover:text-stone-800'}`}>
                <span className={`text-lg transition md:text-base ${tab === t ? 'drop-shadow-[0_0_6px_rgba(74,146,155,0.6)]' : 'opacity-80 grayscale-[35%]'}`} aria-hidden="true">{TAB_ICON[t]}</span>
                {t}
                {tab === t && <span className="absolute inset-x-4 bottom-0 h-0.5 rounded-full bg-gradient-to-r from-teal-500 to-iris-500 shadow-[0_0_8px_rgba(74,146,155,0.8)] md:hidden" />}
              </button>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 pb-16 pt-5" style={{ paddingBottom: 'max(4rem, env(safe-area-inset-bottom))' }}>
        {tab === 'Guide' ? <Guide /> : !hasCode ? <AccessGate onDone={() => setHasCode(true)} /> : tab === 'Check' ? <Check /> : tab === 'Saved' ? <Saved /> : tab === 'History' ? <History /> : <Settings />}
      </main>
    </div>
  );
}
