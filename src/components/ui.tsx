import { useEffect, useState, type ReactNode } from 'react';

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
        <p className="text-sm text-slate-200">{label}</p>
        {hint && <p className="text-xs text-slate-500">{hint}</p>}
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
            {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
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
        <div key={t.id} className={`toast-in pointer-events-auto max-w-md rounded-xl border px-3 py-2 text-sm shadow-lg backdrop-blur ${t.kind === 'error' ? 'border-red-300/40 bg-red-950/90 text-red-100' : t.kind === 'success' ? 'border-emerald-300/40 bg-emerald-950/90 text-emerald-100' : 'border-white/15 bg-slate-900/90 text-slate-100'}`}>
          {t.msg}
        </div>
      ))}
    </div>
  );
}

export const when = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
