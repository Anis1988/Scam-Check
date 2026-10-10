import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { clearHistory, getPrefs, loadHistory, saveToHistory } from '../lib/history';
import { KIND_LABEL, VERDICT_LABEL, type CheckResult, type ModelChoice, type Verdict } from '../lib/types';
import { ResultCard } from '../components/ResultCard';
import { SaveBox } from '../components/SaveBox';
import { RecheckBar, needOf, stuck } from '../components/Recheck';
import { getInput } from '../lib/inputs';
import { refreshStatus } from '../lib/useStatus';
import { toast } from '../components/ui';
import type { CheckInput } from '../lib/api';
import { Rail, ScoreRing, Shell, VerdictChip } from '../components/ui';

const when = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** Past checks on this device: tap one to see it again, right here. */
export function History() {
  const [list, setList] = useState(loadHistory);
  const [sel, setSel] = useState<CheckResult | null>(null);
  const [selInput, setSelInput] = useState<CheckInput | null>(null);
  const open = (r: CheckResult) => { setSel(r); setSelInput(null); void getInput(r.id).then(setSelInput); };

  // Checks still running on the server (e.g. you switched tabs or closed the app): their answers are picked up here.
  useEffect(() => {
    const tick = async () => {
      const waiting = loadHistory().filter((r) => r.ai === 'pending');
      for (const r of waiting) {
        const x = await api.result(r.id).catch(() => null);
        if (x && x.ai !== 'pending') setList(saveToHistory(x));
        else if (!x && Date.now() - Date.parse(r.checkedAt) > 3 * 60_000) {
          setList(saveToHistory({ ...r, ai: 'failed', aiNote: 'The AI check didn’t finish. Open it and tap ↻ Re-check.' }));
        }
      }
      return waiting.length > 0;
    };
    let alive = true;
    const loop = async () => { while (alive && (await tick())) await new Promise((ok) => setTimeout(ok, 5000)); };
    void loop();
    const upd = () => setList(loadHistory());
    window.addEventListener('sc-history', upd);
    return () => { alive = false; window.removeEventListener('sc-history', upd); };
  }, []);
  // The opened one follows its History entry (when its answer arrives).
  useEffect(() => { if (sel) { const x = list.find((r) => r.id === sel.id); if (x && x !== sel && x.ai !== sel.ai) setSel(x); } }, [list]); // eslint-disable-line react-hooks/exhaustive-deps

  /** ↻ Re-check with the AI picked in Settings (1 AI check). */
  const [rechecking, setRechecking] = useState(false);
  const recheck = async (model: ModelChoice) => {
    if (!sel || !selInput) return;
    const before = sel;
    setRechecking(true);
    setSel({ ...before, ai: 'pending' });
    try {
      const done = await api.ai({ ...selInput, aiMode: 'always' }, true, model);
      setSel(done);
      setList(saveToHistory(done));
      if (done.remembered && done.aiNote) toast('info', done.aiNote);
    } catch (e) {
      setSel(before);
      toast('error', e instanceof Error ? e.message : String(e));
    } finally {
      setRechecking(false);
      void refreshStatus();
    }
  };
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
      {/* It failed or hit today's limit: the other models come first. */}
      {!rechecking && stuck(sel) && <RecheckBar r={sel} canRecheck={!!selInput} need={needOf(selInput?.file)} onRecheck={(m) => void recheck(m)} />}
      <ResultCard r={sel} onChanged={() => void api.result(sel.id).then((x) => (setSel(x), setList(saveToHistory(x))), () => undefined)} />
      {!rechecking && !stuck(sel) && <RecheckBar r={sel} canRecheck={!!selInput} need={needOf(selInput?.file)} onRecheck={(m) => void recheck(m)} />}
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
            <button className="card flex w-full items-center gap-3 text-left transition hover:shadow-[0_0_0_1px_rgba(74,146,155,0.35),0_10px_30px_-12px_rgba(74,146,155,0.45)]" onClick={() => open(r)}>
              {r.unchecked ? <span className="flex h-11 w-11 shrink-0 items-center justify-center text-2xl" aria-hidden="true">{KIND_LABEL[r.kind].icon}</span> : <ScoreRing score={r.score} verdict={r.verdict} size={44} muted={r.ai === "pending"} />}
              <span className="min-w-0 flex-1">
                {r.ai === 'pending' ? <span className="chip border-teal-200 bg-teal-50 text-teal-800"><span className="spinner" /> AI checking…</span> : <VerdictChip verdict={r.verdict} unchecked={r.unchecked} />}
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
