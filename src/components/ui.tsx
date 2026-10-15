import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
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

/**
 * A card that folds: tap its title to open or close it (closed unless `defaultOpen`). Opened from elsewhere with the
 * `sc-fold` event: detail {id} opens that one, {all: true|false} opens or closes every fold.
 */
export function Fold({ id, title, label, subtitle, right, defaultOpen = false, className = '', children }: {
  id?: string; title?: ReactNode; label?: ReactNode; subtitle?: ReactNode; right?: ReactNode; defaultOpen?: boolean; className?: string; children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ id?: string; all?: boolean }>).detail ?? {};
      if (typeof d.all === 'boolean') setOpen(d.all);
      else if (id && d.id === id) setOpen(true);
    };
    window.addEventListener('sc-fold', on);
    return () => window.removeEventListener('sc-fold', on);
  }, [id]);
  return (
    <section id={id} className={`card scroll-mt-28 ${className}`}>
      <div className="flex items-start gap-2">
        <button type="button" className="flex min-h-[40px] min-w-0 flex-1 items-start justify-between gap-2 text-left" onClick={() => setOpen(!open)} aria-expanded={open}>
          <span className="min-w-0">
            {label && <span className="label block">{label}</span>}
            {title && <span className="block font-display text-lg font-semibold tracking-tight text-stone-900">{title}</span>}
            {subtitle && <span className="block text-xs text-stone-500">{subtitle}</span>}
          </span>
          <span className={`chev mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-stone-200/80 bg-white/60 text-xs text-stone-500 ${open ? 'rotate-180' : ''}`} aria-hidden="true">▾</span>
        </button>
        {right}
      </div>
      <FoldBody open={open} className="mt-3 space-y-3">{children}</FoldBody>
    </section>
  );
}
const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** The inside of a fold: fades/slides in when opened and out when closed (then it's removed, as before). */
export function FoldBody({ open, className = '', children }: { open: boolean; className?: string; children: ReactNode }) {
  const [shown, setShown] = useState(open);
  useEffect(() => {
    if (open) { setShown(true); return; }
    const t = setTimeout(() => setShown(false), reducedMotion() ? 0 : 180);
    return () => clearTimeout(t);
  }, [open]);
  if (!open && !shown) return null;
  return <div className={`${className} ${open ? 'fold-in' : 'fold-out pointer-events-none'}`}>{children}</div>;
}

/**
 * A row of choices with one glass "thumb" that slides under the picked one. The picked child is the one with
 * aria-selected / aria-checked / aria-pressed = true or aria-current = page; nothing else changes about the buttons.
 */
export function Slide({ className = '', thumb = 'slide-thumb', children, ...rest }: { className?: string; thumb?: string; children: ReactNode; role?: string; 'aria-label'?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const th = useRef<HTMLSpanElement>(null);
  const placed = useRef(false);
  useLayoutEffect(() => {
    const el = box.current;
    const t = th.current;
    if (!el || !t) return;
    const place = () => {
      const on = el.querySelector<HTMLElement>(':scope > [aria-selected="true"], :scope > [aria-checked="true"], :scope > [aria-pressed="true"], :scope > [aria-current="page"]');
      if (!on) { t.style.setProperty('--o', '0'); return; }
      if (!placed.current) t.setAttribute('data-still', '');
      t.style.setProperty('--x', `${on.offsetLeft}px`);
      t.style.setProperty('--y', `${on.offsetTop}px`);
      t.style.setProperty('--w', `${on.offsetWidth}px`);
      t.style.setProperty('--h', `${on.offsetHeight}px`);
      t.style.setProperty('--o', '1');
      if (!placed.current) { placed.current = true; requestAnimationFrame(() => requestAnimationFrame(() => t.removeAttribute('data-still'))); }
    };
    place();
    const mo = new MutationObserver(place);
    mo.observe(el, { attributes: true, subtree: true, attributeFilter: ['aria-selected', 'aria-checked', 'aria-pressed', 'aria-current'] });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(place) : null;
    ro?.observe(el);
    return () => { mo.disconnect(); ro?.disconnect(); };
  }, []);
  return (
    <div ref={box} className={`slide ${className}`} {...rest}>
      <span ref={th} className={thumb} aria-hidden="true" />
      {children}
    </div>
  );
}

/** Shimmering placeholder lines while something is being checked. */
export function Skeleton({ lines = 3, ring = false }: { lines?: number; ring?: boolean }) {
  return (
    <div className="flex items-center gap-3.5 pt-1" aria-hidden="true">
      {ring && <span className="skel !h-14 !w-14 shrink-0" />}
      <span className="min-w-0 flex-1 space-y-2">
        {Array.from({ length: lines }, (_, i) => <span key={i} className="skel block" style={{ width: `${[72, 94, 58, 84][i % 4]}%` }} />)}
      </span>
    </div>
  );
}

/** A friendly "nothing here yet" panel: a glowing orb with an icon, then the words. */
export function Empty({ icon, title, children, className = '' }: { icon: string; title?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={`card rise space-y-3 py-7 text-center ${className}`}>
      <span className="orb" aria-hidden="true">{icon}</span>
      {title && <p className="font-display text-base font-semibold text-stone-800">{title}</p>}
      {children && <div className="mx-auto max-w-sm text-sm text-stone-600">{children}</div>}
    </div>
  );
}
/** Opens one fold by its id (or all of them with all: true / false). */
export const openFold = (d: { id?: string; all?: boolean }) => window.dispatchEvent(new CustomEvent('sc-fold', { detail: d }));

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
    <div style={{ top: 'calc(env(safe-area-inset-top) + 0.5rem)' }} className="pointer-events-none fixed inset-x-0 z-50 flex flex-col items-center gap-2 px-3" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast-in pointer-events-auto max-w-md rounded-2xl border px-4 py-2.5 text-sm font-semibold shadow-[0_12px_30px_-10px_rgb(var(--c-ink)/0.35)] backdrop-blur-xl ${t.kind === 'error' ? 'border-red-200 bg-red-50/90 text-red-800' : t.kind === 'success' ? 'border-emerald-200 bg-emerald-50/90 text-emerald-800' : 'border-stone-200 bg-white/90 text-stone-800'}`}>
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

const RING = { safe: '--c-emerald-600', suspicious: '--c-amber-600', scam: '--c-red-600' } as const;
/**
 * The safety score as a glowing ring, 1 (extremely bad) to 10 (pretty safe): the fuller the ring, the safer.
 * score = the risk (0-100). A faint tick dial around it, a gradient stroke and a glass centre.
 */
export function ScoreRing({ score, verdict, size = 64, muted = false }: { score: number; verdict: Verdict; size?: number; muted?: boolean }) {
  const safe = safetyOf(score);
  const r = 25;
  const full = 2 * Math.PI * r;
  const c = `rgb(var(${muted ? '--c-stone-400' : RING[verdict]}))`;
  const id = `ring${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={`Safety ${safe} out of 10`} className="shrink-0 overflow-visible">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: c, stopOpacity: 0.55 }} />
          <stop offset="1" style={{ stopColor: c }} />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="30.5" fill="none" strokeWidth="1.5" strokeDasharray="1 3.79" className="stroke-stone-400/50" />
      <circle cx="32" cy="32" r={r} className="fill-white/80 stroke-stone-900/10" strokeWidth="6" />
      <circle cx="32" cy="32" r={r - 6} fill="none" strokeWidth="0.75" className="stroke-stone-900/5" />
      <circle cx="32" cy="32" r={r} fill="none" stroke={`url(#${id})`} strokeWidth="6" strokeLinecap="round" className="ring-fill"
        strokeDasharray={full} strokeDashoffset={full * (1 - safe / 10)} transform="rotate(-90 32 32)"
        style={{ ['--full' as string]: full, filter: `drop-shadow(0 0 3px rgb(var(${muted ? '--c-stone-400' : RING[verdict]}) / 0.55))` }} />
      <text x="32" y="36.5" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontWeight="600" className="fill-stone-800"><tspan fontSize="17">{safe}</tspan><tspan fontSize="9" className="fill-stone-500">/10</tspan></text>
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
