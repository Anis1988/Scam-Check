import { useState } from 'react';
import { PROVIDERS, modelFor, providerOf, type ModelChoice, type Provider } from '../lib/types';
import { useStatus } from '../lib/useStatus';

/**
 * One button that opens the list of every AI model (Claude, Gemini, Groq, OpenRouter) with today's checks left;
 * tapping one uses it right away, just for this once (Settings stay as they are). Models not set up, with no checks
 * left today, or unable to do the job (e.g. search the web) are greyed out with the reason.
 */
export function ModelMenu({ label, onPick, cannot, example = false, primary = false }: {
  label: string;
  onPick?: (m: ModelChoice) => void;
  cannot?: (p: Provider) => string | null; // why this AI can't do the job, or null
  example?: boolean;
  primary?: boolean;
}) {
  const st = useStatus();
  const ai = st?.settings.ai;
  const [open, setOpen] = useState(false);
  const current = ai ? `${ai.provider}:${modelFor(ai, ai.provider)}` : '';
  const options = PROVIDERS.flatMap((pr) => {
    const list = pr.models.map((m) => ({ provider: pr.id, id: m.id, name: m.name }));
    const own = ai ? modelFor(ai, pr.id) : '';
    return own && !list.some((o) => o.id === own) ? [...list, { provider: pr.id, id: own, name: own }] : list;
  });
  return (
    <div className="relative">
      <button className={`${primary ? 'btn-primary' : 'btn'} w-full`} disabled={example} aria-expanded={open} aria-haspopup="menu" onClick={() => !example && setOpen(!open)}>
        {label} <span aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <>
          <button className="fixed inset-0 z-40 cursor-default" aria-label="Close" tabIndex={-1} onClick={() => setOpen(false)} />
          <ul role="menu" ref={(el) => el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })} className="rise absolute inset-x-0 top-full z-50 mt-1.5 max-h-[60vh] overflow-auto rounded-xl border border-white bg-white/95 p-1 shadow-[0_0_0_1px_rgba(31,66,71,0.08),0_16px_40px_-12px_rgba(31,66,71,0.35)] backdrop-blur-xl">
            {options.map((o, i) => {
              const u = st?.providers?.[o.provider];
              const ok = st ? !!u?.ready : true;
              const n = u && u.limit !== null ? Math.max(0, u.limit - u.used) : null;
              const why = cannot?.(o.provider) ?? null;
              const can = ok && n !== 0 && !why;
              return (
                <li key={`${o.provider}:${o.id}`} role="none">
                  {(i === 0 || options[i - 1].provider !== o.provider) && <p className="label px-2.5 pb-1 pt-2">{providerOf(o.provider).name} · {providerOf(o.provider).paid ? 'paid' : 'free'}</p>}
                  <button role="menuitem" disabled={!can} onClick={() => (setOpen(false), onPick?.({ provider: o.provider, id: o.id }))}
                    className="flex min-h-[44px] w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left transition hover:bg-teal-50 disabled:opacity-40">
                    <span className="font-semibold text-stone-800">{o.name}{`${o.provider}:${o.id}` === current && <span className="ml-1.5 text-xs font-normal text-teal-700">(Settings)</span>}</span>
                    <span className="shrink-0 text-right font-mono text-[11px] text-stone-500">{!ok ? 'not set up' : why ? why : n === null ? '∞' : `${n} left`}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

/** Company look-ups need a live web search: OpenRouter's free models can't. */
export const needsSearch = (p: Provider) => (p === 'openrouter' ? 'no web search' : null);
