import { useState } from 'react';
import { clearHistory, loadHistory } from '../lib/history';
import { KIND_LABEL, VERDICT_LABEL, type CheckResult } from '../lib/types';

const CHIP = { safe: 'border-emerald-300/50 bg-emerald-400/15 text-emerald-100', suspicious: 'border-amber-300/50 bg-amber-400/15 text-amber-100', scam: 'border-red-300/50 bg-red-400/20 text-red-100' } as const;

/** Past checks on this device: tap one to see it again. */
export function History({ onOpen }: { onOpen: (r: CheckResult) => void }) {
  const [list, setList] = useState(loadHistory);
  return (
    <div className="mx-auto max-w-2xl space-y-3">
      <div className="flex items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">History</h1>
          <p className="text-sm text-slate-400">Your last 50 checks, saved on this device only.</p>
        </div>
        {list.length > 0 && <button className="btn" onClick={() => window.confirm('Delete your check history on this device?') && (clearHistory(), setList([]))}>Clear</button>}
      </div>
      {!list.length && <p className="card text-sm text-slate-300">Nothing checked yet. Your checks will show here.</p>}
      <ul className="space-y-2">
        {list.map((r) => (
          <li key={r.id}>
            <button className="card flex w-full items-start gap-3 text-left transition hover:border-emerald-300/30" onClick={() => onOpen(r)}>
              <span className="text-2xl" aria-hidden="true">{KIND_LABEL[r.kind].icon}</span>
              <span className="min-w-0 flex-1">
                <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold ${r.unchecked ? 'border-white/15 bg-white/5 text-slate-300' : CHIP[r.verdict]}`}>
                  {r.unchecked ? '❔ Not checked' : `${VERDICT_LABEL[r.verdict].icon} ${VERDICT_LABEL[r.verdict].text}`}{r.ai === 'pending' ? ' · AI…' : ''}
                </span>
                <span className="mt-1 block truncate text-sm text-slate-200">{r.preview || KIND_LABEL[r.kind].text}</span>
                <span className="block text-xs text-slate-500">{new Date(r.checkedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
