import type { CheckResult, ModelChoice } from '../lib/types';
import { ModelMenu, type Need } from './ModelMenu';

/** The AI couldn't answer (it failed, hit today's limit, or isn't set up): another model is offered first. */
export const stuck = (r: CheckResult) => r.ai === 'failed' || r.ai === 'limit' || r.ai === 'off';

/** What a model must be able to read to check this original: a PDF, a picture, or nothing special (text). */
export const needOf = (file?: { mime: string }): Need | undefined => (!file ? undefined : file.mime === 'application/pdf' ? 'pdf' : file.mime.startsWith('audio/') ? 'audio' : 'pictures');

/**
 * ↻ Re-check: one button on any result, even a good one, that lists every AI model (ModelMenu); tapping one asks it at
 * once (1 AI check of that kind), Settings stay as they are. When today's limit was reached it says so and offers the
 * other models to continue. Also says when the answer shown was remembered from an earlier check.
 */
export function RecheckBar({ r, canRecheck, onRecheck, need, example = false }: { r: CheckResult; canRecheck: boolean; onRecheck?: (m: ModelChoice) => void; need?: Need; example?: boolean }) {
  if (r.ai === 'pending') return null;
  if (!canRecheck && !r.remembered) return null;

  const when = new Date(r.checkedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

  return (
    <div className="panel space-y-2 text-sm">
      {r.remembered && <p className="text-stone-700">📌 This answer was remembered from {when}{r.aiBy ? ` (checked by ${r.aiBy})` : ''}, so it was free.</p>}
      {canRecheck ? (
        <ModelMenu label={r.ai === 'limit' ? '⏸ Limit reached: continue with another model' : r.ai === 'failed' ? '⚠️ It failed: try another model' : r.ai === 'off' ? '🤖 Pick a model that’s set up' : r.ai === 'done' ? '↻ Re-check' : '🤖 Ask an AI'}
          onPick={(m) => onRecheck?.(m)} need={need} tried={r.aiTried} example={example} primary={r.ai === 'limit' || r.ai === 'failed' || r.ai === 'off'} />
      ) : <p className="text-xs text-stone-500">To ask again, check the message again on this device (its original isn’t kept here).</p>}
    </div>
  );
}
