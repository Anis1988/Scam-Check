import { useEffect, useState } from 'react';
import { Toasts } from './components/ui';
import { Check } from './pages/Check';
import { History } from './pages/History';
import { Saved } from './pages/Saved';
import { Guide } from './pages/Guide';
import { Settings } from './pages/Settings';
import { getCode, setCode } from './lib/api';
import type { CheckResult } from './lib/types';

const TABS = ['Check', 'Saved', 'History', 'Guide', 'Settings'] as const;
type Tab = (typeof TABS)[number];
const TAB_ICON: Record<Tab, string> = { Check: '🛡️', Saved: '⭐', History: '🕘', Guide: '📖', Settings: '⚙️' };

function Logo() {
  return (
    <svg viewBox="0 0 512 512" width="34" height="34" aria-hidden="true">
      <rect width="512" height="512" rx="120" fill="#ffffff" />
      <path d="M256 84 400 138v108c0 92-62 156-144 180-82-24-144-88-144-180V138z" fill="#0F766E" />
      <path d="m192 262 44 44 86-94" fill="none" stroke="#FFFFFF" strokeWidth="36" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="392" cy="128" r="34" fill="#F26B5B" />
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
  const [open, setOpen] = useState<CheckResult | null>(null);
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
      <header className="sticky top-0 z-40 border-b border-stone-200/70 bg-cream/85 backdrop-blur-md" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="mx-auto flex h-16 max-w-2xl items-center gap-2.5 px-4">
          <Logo />
          <div className="leading-tight">
            <p className="font-display text-lg font-extrabold text-stone-900">Scam Check</p>
            <p className="text-xs font-semibold text-teal-700">Check before you click, call or pay</p>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 pt-4" style={{ paddingBottom: 'calc(6.5rem + env(safe-area-inset-bottom))' }}>
        {tab === 'Guide' ? <Guide /> : !hasCode ? <AccessGate onDone={() => setHasCode(true)} /> : tab === 'Check' ? <Check open={open} /> : tab === 'Saved' ? <Saved /> : tab === 'History' ? <History onOpen={(r) => (setOpen(r), go('Check'))} /> : <Settings />}
      </main>
      {/* Bottom tab bar, like a phone app. */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-stone-200 bg-white/95 backdrop-blur-md" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }} aria-label="Main">
        <div className="mx-auto grid max-w-2xl grid-cols-5">
          {TABS.map((t) => (
            <button key={t} onClick={() => go(t)} aria-current={tab === t ? 'page' : undefined}
              className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-bold transition ${tab === t ? 'text-teal-700' : 'text-stone-500 hover:text-stone-800'}`}>
              <span className={`flex h-8 w-12 items-center justify-center rounded-full text-lg transition ${tab === t ? 'bg-teal-50' : ''}`} aria-hidden="true">{TAB_ICON[t]}</span>
              {t}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
