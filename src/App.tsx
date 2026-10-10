import { useEffect, useState } from 'react';
import { Toasts } from './components/ui';
import { Check } from './pages/Check';
import { History } from './pages/History';
import { Saved } from './pages/Saved';
import { Guide } from './pages/Guide';
import { Settings } from './pages/Settings';
import { getCode, setCode } from './lib/api';

const TABS = ['Check', 'Saved', 'History', 'Guide', 'Settings'] as const;
type Tab = (typeof TABS)[number];
const TAB_ICON: Record<Tab, string> = { Check: '🛡️', Saved: '⭐', History: '🕘', Guide: '📖', Settings: '⚙️' };

function Logo() {
  return (
    <svg viewBox="0 0 512 512" width="34" height="34" aria-hidden="true">
      <rect width="512" height="512" rx="120" fill="#ffffff" />
      <path d="M256 84 400 138v108c0 92-62 156-144 180-82-24-144-88-144-180V138z" fill="#4A726D" />
      <path d="m192 262 44 44 86-94" fill="none" stroke="#FFFFFF" strokeWidth="36" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="392" cy="128" r="34" fill="#C98A7A" />
    </svg>
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
    window.addEventListener('sc-unauthorized', off);
    return () => window.removeEventListener('sc-unauthorized', off);
  }, []);
  const go = (t: Tab) => {
    setTab(t);
    if (!path.startsWith('/share')) window.history.replaceState(null, '', t === 'Check' ? '/' : `/${t.toLowerCase()}`);
  };

  return (
    <div className="min-h-screen">
      <Toasts />
      <header className="sticky top-0 z-40 border-b border-stone-200/80 bg-cream/90 backdrop-blur-md" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-1 px-4 pt-2 md:flex-nowrap md:py-2">
          <div className="flex items-center gap-2.5">
            <Logo />
            <div className="leading-tight">
              <p className="font-display text-lg font-extrabold text-stone-900">Scam Check</p>
              <p className="text-xs font-semibold text-teal-700">Check before you click, call or pay</p>
            </div>
          </div>
          {/* Tabs with icons, at the top. */}
          <nav className="-mx-1 grid w-full grid-cols-5 md:ml-auto md:flex md:w-auto md:gap-1" aria-label="Main">
            {TABS.map((t) => (
              <button key={t} onClick={() => go(t)} aria-current={tab === t ? 'page' : undefined}
                className={`relative flex flex-col items-center gap-0.5 px-1 py-2 text-[11px] font-bold transition md:flex-row md:gap-1.5 md:rounded-2xl md:px-3 md:text-sm ${tab === t ? 'text-teal-800 md:bg-white md:shadow-sm' : 'text-stone-500 hover:text-stone-800'}`}>
                <span className="text-lg md:text-base" aria-hidden="true">{TAB_ICON[t]}</span>
                {t}
                {tab === t && <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-teal-700 md:hidden" />}
              </button>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-5">
        {tab === 'Guide' ? <Guide /> : !hasCode ? <AccessGate onDone={() => setHasCode(true)} /> : tab === 'Check' ? <Check /> : tab === 'Saved' ? <Saved /> : tab === 'History' ? <History /> : <Settings />}
      </main>
    </div>
  );
}
