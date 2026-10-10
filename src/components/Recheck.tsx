import type { CheckResult } from '../lib/types';
import { aiLeft, useStatus } from '../lib/useStatus';

/**
 * ↻ Re-check: asks the AI picked in Settings again (1 AI check), e.g. after choosing another model. Also says when
 * the answer shown was remembered from an earlier check (that one was free, and may come from another model).
 */
export function RecheckBar({ r, canRecheck, onRecheck, example = false }: { r: CheckResult; canRecheck: boolean; onRecheck?: () => void; example?: boolean }) {
  const st = useStatus();
  if (r.ai === 'pending' || r.kind === 'qr' && !canRecheck) return null;
  const left = aiLeft(st);
  const model = st?.model ?? 'the AI';
  const when = new Date(r.checkedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  if (!canRecheck && !r.remembered) return null;
  return (
    <div className="panel space-y-2 text-sm">
      {r.remembered && <p className="text-stone-700">📌 This answer was remembered from {when}{r.aiBy ? ` (checked by ${r.aiBy})` : ''}, so it was free.</p>}
      {canRecheck ? (
        <button className="btn w-full" disabled={example || left === 0 || !st?.ai} onClick={() => !example && onRecheck?.()}>
          ↻ Re-check with {model} {left !== null ? `(uses 1 of ${left} left today)` : '(uses 1 AI check)'}
        </button>
      ) : <p className="text-xs text-stone-500">To ask again, check the message again on this device (its original isn’t kept here).</p>}
      {canRecheck && !st?.ai && st && <p className="text-xs text-amber-700">The AI picked in Settings isn’t set up yet.</p>}
    </div>
  );
}
