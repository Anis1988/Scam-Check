import { useState } from 'react';
import { GEMINI_MODELS, MODELS, type CheckResult, type ModelChoice } from '../lib/types';
import { useStatus } from '../lib/useStatus';

/**
 * ↻ Re-check: one button on any result, even a good one. Tapping it lists every Claude and Gemini model (ones not
 * set up, or with no checks left today, are greyed out); tapping a model asks it at once (1 AI check of that kind).
 * Settings stay as they are. Also says when the answer shown was remembered from an earlier check.
 */
export function RecheckBar({ r, canRecheck, onRecheck, example = false }: { r: CheckResult; canRecheck: boolean; onRecheck?: (m: ModelChoice) => void; example?: boolean }) {
  const st = useStatus();
  const ai = st?.settings.ai;
  const current: ModelChoice = ai ? (ai.provider === 'gemini' ? { provider: 'gemini', id: ai.geminiModel } : { provider: 'claude', id: ai.model }) : { provider: 'claude', id: MODELS[0].id };
  const [open, setOpen] = useState(false);
  if (r.ai === 'pending') return null;
  if (!canRecheck && !r.remembered) return null;

  const options = [
    ...MODELS.map((m) => ({ provider: 'claude' as const, id: m.id, name: `${m.name} · paid` })),
    ...GEMINI_MODELS.map((m) => ({ provider: 'gemini' as const, id: m.id, name: `${m.name} · free` })),
  ];
  // The models from Settings, if typed by hand, are listed too.
  if (ai && !options.some((o) => o.provider === 'claude' && o.id === ai.model)) options.push({ provider: 'claude', id: ai.model, name: `${ai.model} · paid` });
  if (ai && !options.some((o) => o.provider === 'gemini' && o.id === ai.geminiModel)) options.push({ provider: 'gemini', id: ai.geminiModel, name: `${ai.geminiModel} · free` });
  const ready = (p: ModelChoice['provider']) => (st ? (p === 'gemini' ? st.gemini?.ready : st.claude?.ready) ?? false : true);
  const key = (m: ModelChoice) => `${m.provider}:${m.id}`;
  const when = new Date(r.checkedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

  return (
    <div className="panel space-y-2 text-sm">
      {r.remembered && <p className="text-stone-700">📌 This answer was remembered from {when}{r.aiBy ? ` (checked by ${r.aiBy})` : ''}, so it was free.</p>}
      {canRecheck ? (
        <div className="relative">
          <button className="btn w-full" disabled={example} aria-expanded={open} aria-haspopup="menu" onClick={() => !example && setOpen(!open)}>
            {r.ai === 'done' ? '↻ Re-check' : '🤖 Ask an AI'} <span aria-hidden="true">{open ? '▴' : '▾'}</span>
          </button>
          {open && (
            <>
              <button className="fixed inset-0 z-40 cursor-default" aria-label="Close" tabIndex={-1} onClick={() => setOpen(false)} />
              <ul role="menu" ref={(el) => el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })} className="rise absolute inset-x-0 top-full z-50 mt-1.5 max-h-[60vh] overflow-auto rounded-xl border border-white bg-white/95 p-1 shadow-[0_0_0_1px_rgba(31,66,71,0.08),0_16px_40px_-12px_rgba(31,66,71,0.35)] backdrop-blur-xl">
                {options.map((o, i) => {
                  const ok = ready(o.provider);
                  const u = st ? (o.provider === 'gemini' ? st.gemini : st.claude) : null;
                  const n = u && u.limit !== null ? Math.max(0, u.limit - u.used) : null;
                  const can = ok && n !== 0;
                  return (
                    <li key={key(o)} role="none">
                      {(i === 0 || options[i - 1].provider !== o.provider) && <p className="label px-2.5 pb-1 pt-2">{o.provider === 'claude' ? 'Claude · paid' : 'Gemini · free'}</p>}
                      <button role="menuitem" disabled={!can} onClick={() => (setOpen(false), onRecheck?.({ provider: o.provider, id: o.id }))}
                        className="flex min-h-[44px] w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left transition hover:bg-teal-50 disabled:opacity-40">
                        <span className="font-semibold text-stone-800">{o.name.replace(/ · (paid|free)$/, '')}{key(o) === key(current) && <span className="ml-1.5 text-xs font-normal text-teal-700">(Settings)</span>}</span>
                        <span className="shrink-0 font-mono text-[11px] text-stone-500">{!ok ? 'not set up' : n === null ? '∞' : `${n} left`}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      ) : <p className="text-xs text-stone-500">To ask again, check the message again on this device (its original isn’t kept here).</p>}
    </div>
  );
}
