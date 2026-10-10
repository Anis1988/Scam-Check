import { useEffect, useState, type ReactNode } from 'react';
import { VERDICT_LABEL, safetyOf, type Verdict } from '../lib/types';

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className="toggle" onClick={() => onChange(!on)}>
      <span />
    </button>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 py-1.5">
      <div className="min-w-0 flex-1 basis-48">
        <p className="text-sm font-semibold text-stone-800">{label}</p>
        {hint && <p className="text-xs text-stone-500">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

export function Card({ title, subtitle, children, right }: { title?: string; subtitle?: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="card space-y-3">
      {(title || right) && (
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            {title && <h2 className="text-lg font-semibold">{title}</h2>}
            {subtitle && <p className="text-xs text-stone-500">{subtitle}</p>}
          </div>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export type ToastKind = 'success' | 'error' | 'info';
let push: (kind: ToastKind, msg: string) => void = () => undefined;
export const toast = (kind: ToastKind, msg: string) => push(kind, msg);

export function Toasts() {
  const [items, setItems] = useState<{ id: number; kind: ToastKind; msg: string }[]>([]);
  useEffect(() => {
    push = (kind, msg) => {
      const id = Date.now() + Math.random();
      setItems((x) => [...x, { id, kind, msg }]);
      setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), kind === 'error' ? 7000 : 4000);
    };
  }, []);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-2 z-50 flex flex-col items-center gap-2 px-3" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast-in pointer-events-auto max-w-md rounded-2xl border px-4 py-2.5 text-sm font-semibold shadow-lg ${t.kind === 'error' ? 'border-red-200 bg-red-50 text-red-800' : t.kind === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-stone-200 bg-white text-stone-800'}`}>
          {t.msg}
        </div>
      ))}
    </div>
  );
}

export const when = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/**
 * Page layout: the main column in the centre, side panels on big screens (left from 1280px, right from 1024px).
 * On phones only the centre shows, so anything important must also be in the centre.
 */
export function Shell({ left, right, children }: { left?: ReactNode; right?: ReactNode; children: ReactNode }) {
  const cols = left && right ? 'lg:grid-cols-[minmax(0,1fr)_260px] xl:grid-cols-[230px_minmax(0,1fr)_260px]' : right ? 'lg:grid-cols-[minmax(0,1fr)_280px]' : left ? 'xl:grid-cols-[230px_minmax(0,1fr)]' : '';
  return (
    <div className={`grid items-start gap-5 ${cols}`}>
      {left && <aside className="hidden xl:block"><div className="sticky top-24 space-y-3">{left}</div></aside>}
      <div className="min-w-0 space-y-4">{children}</div>
      {right && <aside className="hidden lg:block"><div className="sticky top-24 space-y-3">{right}</div></aside>}
    </div>
  );
}

const RING = { safe: '#5E8C6E', suspicious: '#A3844B', scam: '#A3685F' } as const;
/** The safety score as a glowing ring, 1 (extremely bad) to 10 (pretty safe): the fuller the ring, the safer. score = the risk (0-100). */
export function ScoreRing({ score, verdict, size = 64, muted = false }: { score: number; verdict: Verdict; size?: number; muted?: boolean }) {
  const safe = safetyOf(score);
  const r = 26;
  const full = 2 * Math.PI * r;
  const c = muted ? '#97A3AB' : RING[verdict];
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={`Safety ${safe} out of 10`} className="shrink-0">
      <circle cx="32" cy="32" r={r} fill="rgba(255,255,255,0.7)" stroke="rgba(31,66,71,0.08)" strokeWidth="6" />
      <circle cx="32" cy="32" r={r} fill="none" stroke={c} strokeWidth="6" strokeLinecap="round" className="ring-fill"
        strokeDasharray={full} strokeDashoffset={full * (1 - safe / 10)} transform="rotate(-90 32 32)"
        style={{ ['--full' as string]: full, filter: `drop-shadow(0 0 3px ${c}88)` }} />
      <text x="32" y="36.5" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontWeight="600" fill="#2B333A"><tspan fontSize="17">{safe}</tspan><tspan fontSize="9" fill="#6B7882">/10</tspan></text>
    </svg>
  );
}

export const VERDICT_CHIP = { safe: 'border-emerald-200 bg-emerald-50 text-emerald-800', suspicious: 'border-amber-200 bg-amber-50 text-amber-800', scam: 'border-red-200 bg-red-50 text-red-800' } as const;
/** ✅ Looks safe · ⚠️ Suspicious · 🚨 Likely scam, small. */
export function VerdictChip({ verdict, unchecked, extra }: { verdict: Verdict; unchecked?: boolean; extra?: string }) {
  return (
    <span className={`chip ${unchecked ? 'border-stone-200 bg-stone-100 text-stone-600' : VERDICT_CHIP[verdict]}`}>
      {unchecked ? '❔ Not checked' : `${VERDICT_LABEL[verdict].icon} ${VERDICT_LABEL[verdict].text}`}{extra ? ` · ${extra}` : ''}
    </span>
  );
}

/** A small side-panel box with a HUD-style title. */
export function Rail({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card space-y-2 p-3.5">
      <p className="label">{title}</p>
      {children}
    </section>
  );
}
