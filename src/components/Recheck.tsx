import type { CheckResult, ModelChoice } from '../lib/types';
import { ModelMenu } from './ModelMenu';

/**
 * ↻ Re-check: one button on any result, even a good one, that lists every AI model (ModelMenu); tapping one asks it at
 * once (1 AI check of that kind), Settings stay as they are. When today's limit was reached it says so and offers the
 * other models to continue. Also says when the answer shown was remembered from an earlier check.
 */
export function RecheckBar({ r, canRecheck, onRecheck, example = false }: { r: CheckResult; canRecheck: boolean; onRecheck?: (m: ModelChoice) => void; example?: boolean }) {
  if (r.ai === 'pending') return null;
  if (!canRecheck && !r.remembered) return null;

  const when = new Date(r.checkedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

  return (
    <div className="panel space-y-2 text-sm">
      {r.remembered && <p className="text-stone-700">📌 This answer was remembered from {when}{r.aiBy ? ` (checked by ${r.aiBy})` : ''}, so it was free.</p>}
      {canRecheck ? (
        <ModelMenu label={r.ai === 'limit' ? '⏸ Limit reached: continue with another model' : r.ai === 'failed' ? '↻ Try with another model' : r.ai === 'done' ? '↻ Re-check' : '🤖 Ask an AI'} onPick={(m) => onRecheck?.(m)} example={example} primary={r.ai === 'limit'} />
      ) : <p className="text-xs text-stone-500">To ask again, check the message again on this device (its original isn’t kept here).</p>}
    </div>
  );
}
