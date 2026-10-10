import { useEffect, useState } from 'react';
import { GEMINI_MODELS, MODELS, type CheckResult, type ModelChoice } from '../lib/types';
import { useStatus } from '../lib/useStatus';

/**
 * ↻ Re-check: asks an AI again about the same message (1 AI check), on any result, even a good one. Pick the model
 * for this once: every Claude and Gemini model is listed (ones not set up are greyed out); it starts on the model
 * from Settings, which stays as it is. Also says when the answer shown was remembered from an earlier check.
 */
export function RecheckBar({ r, canRecheck, onRecheck, example = false }: { r: CheckResult; canRecheck: boolean; onRecheck?: (m: ModelChoice) => void; example?: boolean }) {
  const st = useStatus();
  const ai = st?.settings.ai;
  const current: ModelChoice = ai ? (ai.provider === 'gemini' ? { provider: 'gemini', id: ai.geminiModel } : { provider: 'claude', id: ai.model }) : { provider: 'claude', id: MODELS[0].id };
  const [pick, setPick] = useState<ModelChoice>(current);
  useEffect(() => setPick(current), [current.provider, current.id]); // eslint-disable-line react-hooks/exhaustive-deps
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
  const use = st ? (pick.provider === 'gemini' ? st.gemini : st.claude) : null;
  const left = use && use.limit !== null ? Math.max(0, use.limit - use.used) : null;
  const key = (m: ModelChoice) => `${m.provider}:${m.id}`;
  const when = new Date(r.checkedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

  return (
    <div className="panel space-y-2 text-sm">
      {r.remembered && <p className="text-stone-700">📌 This answer was remembered from {when}{r.aiBy ? ` (checked by ${r.aiBy})` : ''}, so it was free.</p>}
      {canRecheck ? (
        <>
          <label className="block space-y-1">
            <span className="label">{r.ai === 'done' ? '↻ Re-check with' : '🤖 Ask an AI'}</span>
            <select className="input w-full" value={key(pick)} disabled={example} aria-label="Model for the re-check"
              onChange={(e) => { const [provider, id] = e.target.value.split(/:(.*)/s); setPick({ provider: provider as ModelChoice['provider'], id }); }}>
              {options.map((o) => <option key={key(o)} value={key(o)} disabled={!ready(o.provider)}>{o.name}{!ready(o.provider) ? ' (not set up)' : ''}{key(o) === key(current) ? ' (Settings)' : ''}</option>)}
            </select>
          </label>
          <button className="btn w-full" disabled={example || left === 0 || !ready(pick.provider)} onClick={() => !example && onRecheck?.(pick)}>
            {r.ai === 'done' ? '↻ Re-check' : '🤖 Ask it'} {left !== null ? `(uses 1 of ${left} left today)` : '(uses 1 AI check)'}
          </button>
          {left === 0 && <p className="text-xs text-amber-700">No {pick.provider === 'gemini' ? 'Gemini' : 'Claude'} checks left today. Pick the other kind, or try tomorrow.</p>}
        </>
      ) : <p className="text-xs text-stone-500">To ask again, check the message again on this device (its original isn’t kept here).</p>}
    </div>
  );
}
