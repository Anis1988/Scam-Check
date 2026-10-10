import { useState } from 'react';
import { clearHistory, loadHistory } from '../lib/history';
import { KIND_LABEL, VERDICT_LABEL, type CheckResult } from '../lib/types';
import { ResultCard } from '../components/ResultCard';
import { SaveBox } from '../components/SaveBox';

const CHIP = { safe: 'border-emerald-200 bg-emerald-50 text-emerald-800', suspicious: 'border-amber-200 bg-amber-50 text-amber-800', scam: 'border-red-200 bg-red-50 text-red-800' } as const;

/** Past checks on this device: tap one to see it again. */
export function History() {
  const [list, setList] = useState(loadHistory);
  const [sel, setSel] = useState<CheckResult | null>(null);
  // One check, opened right here (Back returns to the list).
  if (sel) return (
    <div className="mx-auto max-w-2xl space-y-3">
      <button className="btn" onClick={() => setSel(null)}>← Back to History</button>
      <ResultCard r={sel} />
      {sel.ai !== 'pending' && <SaveBox key={sel.id} id={sel.id} />}
    </div>
  );
  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-extrabold">History</h1>
          <p className="text-sm text-stone-500">Your last 50 checks, saved on this device only.</p>
        </div>
        {list.length > 0 && <button className="btn" onClick={() => window.confirm('Delete your check history on this device?') && (clearHistory(), setList([]))}>Clear</button>}
      </div>
      {!list.length && <p className="card text-sm text-stone-600">Nothing checked yet. Your checks will show here.</p>}
      <ul className="grid gap-2 lg:grid-cols-2">
        {list.map((r) => (
          <li key={r.id}>
            <button className="card flex w-full items-start gap-3 text-left transition hover:border-teal-600/40" onClick={() => setSel(r)}>
              <span className="text-2xl" aria-hidden="true">{KIND_LABEL[r.kind].icon}</span>
              <span className="min-w-0 flex-1">
                <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold ${r.unchecked ? 'border-stone-200 bg-stone-100 text-stone-600' : CHIP[r.verdict]}`}>
                  {r.unchecked ? '❔ Not checked' : `${VERDICT_LABEL[r.verdict].icon} ${VERDICT_LABEL[r.verdict].text}`}{r.ai === 'pending' ? ' · AI…' : ''}
                </span>
                <span className="mt-1 block truncate text-sm text-stone-800">{r.preview || KIND_LABEL[r.kind].text}</span>
                <span className="block text-xs text-stone-500">{new Date(r.checkedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
