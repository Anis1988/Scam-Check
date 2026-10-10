import { useState } from 'react';
import { clearHistory, getPrefs, loadHistory } from '../lib/history';
import { KIND_LABEL, VERDICT_LABEL, type CheckResult, type Verdict } from '../lib/types';
import { ResultCard } from '../components/ResultCard';
import { SaveBox } from '../components/SaveBox';
import { Rail, ScoreRing, Shell, VerdictChip } from '../components/ui';

const when = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** Past checks on this device: tap one to see it again, right here. */
export function History() {
  const [list, setList] = useState(loadHistory);
  const [sel, setSel] = useState<CheckResult | null>(null);
  const counts = (['safe', 'suspicious', 'scam'] as Verdict[]).map((v) => [v, list.filter((r) => !r.unchecked && r.verdict === v).length] as const);
  const stats = (
    <Rail title="On this device">
      <p className="font-display text-3xl font-bold text-stone-900">{list.length}<span className="ml-1 text-sm font-medium text-stone-500">checks</span></p>
      <ul className="space-y-1 text-sm">{counts.map(([v, n]) => <li key={v} className="flex justify-between"><span>{VERDICT_LABEL[v].icon} {VERDICT_LABEL[v].text}</span><span className="num text-stone-500">{n}</span></li>)}</ul>
      <p className="text-xs text-stone-500">Keeps your last {getPrefs().historySize} (Settings → This device).</p>
    </Rail>
  );

  // One check, opened right here (Back returns to the list).
  if (sel) return (
    <Shell right={stats}>
      <button className="btn" onClick={() => setSel(null)}>← Back to History</button>
      <ResultCard r={sel} />
      {sel.ai !== 'pending' && <SaveBox key={sel.id} id={sel.id} />}
    </Shell>
  );
  return (
    <Shell right={stats}>
      <div className="flex items-end justify-between gap-2">
        <div>
          <p className="label">Timeline</p>
          <h1 className="text-2xl font-bold">History</h1>
          <p className="text-sm text-stone-500">Your last checks, saved on this device only.</p>
        </div>
        {list.length > 0 && <button className="btn" onClick={() => window.confirm('Delete your check history on this device?') && (clearHistory(), setList([]))}>Clear</button>}
      </div>
      {!list.length && <p className="card text-sm text-stone-600">Nothing checked yet. Your checks will show here.</p>}
      <ul className="space-y-2">
        {list.map((r) => (
          <li key={r.id}>
            <button className="card flex w-full items-center gap-3 text-left transition hover:shadow-[0_0_0_1px_rgba(74,146,155,0.35),0_10px_30px_-12px_rgba(74,146,155,0.45)]" onClick={() => setSel(r)}>
              {r.unchecked ? <span className="flex h-11 w-11 shrink-0 items-center justify-center text-2xl" aria-hidden="true">{KIND_LABEL[r.kind].icon}</span> : <ScoreRing score={r.score} verdict={r.verdict} size={44} />}
              <span className="min-w-0 flex-1">
                <VerdictChip verdict={r.verdict} unchecked={r.unchecked} extra={r.ai === 'pending' ? 'AI…' : undefined} />
                <span className="mt-1 block truncate text-sm text-stone-800">{r.title || r.preview || KIND_LABEL[r.kind].text}</span>
                <span className="hud block !text-[10px]">{KIND_LABEL[r.kind].icon} {KIND_LABEL[r.kind].text} · {when(r.checkedAt)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Shell>
  );
}
