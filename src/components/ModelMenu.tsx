import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PROVIDERS, modelFor, modelName, providerOf, type ModelChoice, type Provider } from '../lib/types';
import { useStatus } from '../lib/useStatus';

/**
 * One button that opens the list of every AI model (Claude, Gemini, Groq, OpenRouter) with today's checks left;
 * tapping one uses it right away, just for this once (Settings stay as they are). Models not set up, with no checks
 * left today, or unable to do the job (e.g. search the web) are greyed out with the reason.
 */
export function ModelMenu({ label, onPick, cannot, need, tried, example = false, primary = false }: {
  label: string;
  onPick?: (m: ModelChoice) => void;
  cannot?: (p: Provider) => string | null; // why this AI can't do the job, or null
  need?: 'pictures' | 'pdf'; // what the model must be able to read
  tried?: string; // the model that just failed (its name, as in "Checked by"): marked in the list
  example?: boolean;
  primary?: boolean;
}) {
  const st = useStatus();
  const ai = st?.settings.ai;
  const [open, setOpen] = useState(false);
  // The list is drawn over the whole page (cards below have their own layers and would cover it), under the button,
  // or above it when there is more room there. Scrolling or resizing closes it.
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLUListElement>(null);
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number; max: number }>();
  const place = () => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom - 12, above = r.top - 12;
    setPos(below >= 260 || below >= above ? { left: r.left, width: r.width, top: r.bottom + 6, max: below - 6 } : { left: r.left, width: r.width, bottom: window.innerHeight - r.top + 6, max: above - 6 });
  };
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const key = (e: KeyboardEvent) => e.key === 'Escape' && close();
    const since = Date.now();
    // Scrolling the page closes it (not the list itself, nor a little scroll right as it opens).
    const scroll = (e: Event) => Date.now() - since > 400 && !menu.current?.contains(e.target as Node) && close();
    window.addEventListener('resize', close);
    window.addEventListener('scroll', scroll, true);
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('resize', close); window.removeEventListener('scroll', scroll, true); window.removeEventListener('keydown', key); };
  }, [open]);
  const current = ai ? `${ai.provider}:${modelFor(ai, ai.provider)}` : '';
  const options = PROVIDERS.flatMap((pr) => {
    const list = pr.models.map((m) => ({ provider: pr.id, id: m.id, name: m.name, reads: m }));
    const own = ai ? modelFor(ai, pr.id) : '';
    return own && !list.some((o) => o.id === own) ? [...list, { provider: pr.id, id: own, name: own, reads: { pictures: true, pdf: false } }] : list;
  });
  return (
    <div className="relative">
      <button ref={btn} className={`${primary ? 'btn-primary' : 'btn'} w-full`} disabled={example} aria-expanded={open} aria-haspopup="menu" onClick={() => !example && (place(), setOpen(!open))}>
        {label} <span aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>
      {open && pos && createPortal(
        <>
          <button className="fixed inset-0 z-[60] cursor-default" aria-label="Close" tabIndex={-1} onClick={() => setOpen(false)} />
          <ul ref={menu} role="menu" aria-label="Pick a model" style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: Math.max(160, pos.max) }}
            className="rise fixed z-[61] overflow-auto overscroll-contain rounded-xl border border-white bg-white/95 p-1 shadow-[0_0_0_1px_rgba(31,66,71,0.08),0_16px_40px_-12px_rgba(31,66,71,0.35)] backdrop-blur-xl">
            {options.map((o, i) => {
              const u = st?.providers?.[o.provider];
              const ok = st ? !!u?.ready : true;
              const n = u && u.limit !== null ? Math.max(0, u.limit - u.used) : null;
              const why = cannot?.(o.provider) ?? (need === 'pdf' && !o.reads.pdf ? 'can’t read PDFs' : need === 'pictures' && !o.reads.pictures ? 'can’t read pictures' : null);
              const failed = !!tried && modelName(o.provider, o.id) === tried;
              const can = ok && n !== 0 && !why;
              return (
                <li key={`${o.provider}:${o.id}`} role="none">
                  {(i === 0 || options[i - 1].provider !== o.provider) && <p className="label px-2.5 pb-1 pt-2">{providerOf(o.provider).name} · {providerOf(o.provider).paid ? 'paid' : 'free'}</p>}
                  <button role="menuitem" disabled={!can} onClick={() => (setOpen(false), onPick?.({ provider: o.provider, id: o.id }))}
                    className="flex min-h-[44px] w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left transition hover:bg-teal-50 disabled:opacity-40">
                    <span className="font-semibold text-stone-800">{o.name}{`${o.provider}:${o.id}` === current && <span className="ml-1.5 text-xs font-normal text-teal-700">(Settings)</span>}{failed && <span className="ml-1.5 text-xs font-normal text-amber-700">⚠️ just failed</span>}</span>
                    <span className="shrink-0 text-right font-mono text-[11px] text-stone-500">{!ok ? 'not set up' : why ? why : n === null ? '∞' : `${n} left`}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>,
        document.body,
      )}
    </div>
  );
}

/** Company look-ups need a live web search: OpenRouter's free models can't. */
export const needsSearch = (p: Provider) => (p === 'openrouter' ? 'no web search' : null);
