import { useEffect, useState } from 'react';
import { Toasts } from './components/ui';
import { Check } from './pages/Check';
import { History } from './pages/History';
import { Guide } from './pages/Guide';
import { Settings } from './pages/Settings';
import { getCode, setCode } from './lib/api';
import type { CheckResult } from './lib/types';

const TABS = ['Check', 'History', 'Guide', 'Settings'] as const;
type Tab = (typeof TABS)[number];

function Logo() {
  return (
    <svg viewBox="0 0 512 512" width="28" height="28" aria-hidden="true">
      <defs><linearGradient id="lg" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="#34d399" /><stop offset="1" stopColor="#38bdf8" /></linearGradient></defs>
      <rect width="512" height="512" rx="112" fill="#0b1220" stroke="rgba(255,255,255,0.12)" strokeWidth="12" />
      <path d="M256 92 392 144v104c0 88-58 150-136 172-78-22-136-84-136-172V144z" fill="none" stroke="url(#lg)" strokeWidth="34" strokeLinejoin="round" />
      <path d="m196 262 42 42 82-90" fill="none" stroke="url(#lg)" strokeWidth="34" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AccessGate({ onDone }: { onDone: () => void }) {
  const [v, setV] = useState('');
  return (
    <div className="card mx-auto max-w-sm space-y-3">
      <h1 className="text-xl font-semibold">Enter your access code</h1>
      <p className="text-sm text-slate-400">The code you set as <code>APP_ACCESS_TOKEN</code> in Netlify. It keeps strangers from using your AI checks.</p>
      <input className="input w-full" type="password" value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && v && (setCode(v.trim()), onDone())} placeholder="Access code" autoFocus />
      <button className="btn-primary w-full" disabled={!v} onClick={() => (setCode(v.trim()), onDone())}>Continue</button>
    </div>
  );
}

export default function App() {
  const path = window.location.pathname;
  const [tab, setTab] = useState<Tab>(path.startsWith('/history') ? 'History' : path.startsWith('/guide') ? 'Guide' : path.startsWith('/settings') ? 'Settings' : 'Check');
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
      <header className="sticky top-0 z-40 border-b border-white/10 bg-ink-950/75 backdrop-blur-xl" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-2 px-3 sm:px-4">
          <Logo />
          <span className="hidden font-display text-lg font-semibold tracking-tight min-[420px]:inline">Scam Check</span>
          <nav className="ml-auto flex gap-0.5" aria-label="Main">
            {TABS.map((t) => (
              <button key={t} onClick={() => go(t)} aria-current={tab === t ? 'page' : undefined} className={`rounded-lg px-2.5 py-1.5 text-sm transition ${tab === t ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-slate-100'}`}>{t}</button>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-3 pb-12 pt-4 sm:px-4">
        {tab === 'Guide' ? <Guide /> : !hasCode ? <AccessGate onDone={() => setHasCode(true)} /> : tab === 'Check' ? <Check open={open} /> : tab === 'History' ? <History onOpen={(r) => (setOpen(r), go('Check'))} /> : <Settings />}
      </main>
    </div>
  );
}
