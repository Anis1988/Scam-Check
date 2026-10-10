import type { CheckResult, Signal, Source } from '../lib/types';
import { KIND_LABEL, VERDICT_LABEL } from '../lib/types';

const VERDICT_STYLE = {
  safe: 'border-emerald-300/50 bg-emerald-500/15 text-emerald-50',
  suspicious: 'border-amber-300/50 bg-amber-500/15 text-amber-50',
  scam: 'border-red-300/60 bg-red-500/20 text-red-50',
} as const;
const BAR = { safe: 'bg-emerald-400', suspicious: 'bg-amber-400', scam: 'bg-red-500' } as const;
const SOURCE: Record<Source, { icon: string; name: string }> = {
  pattern: { icon: '🔎', name: 'Known scam patterns' },
  link: { icon: '🌐', name: 'Links & websites' },
  phone: { icon: '📞', name: 'Phone numbers' },
  sender: { icon: '✉️', name: 'Who sent it' },
  ai: { icon: '🤖', name: 'AI analysis' },
};
const LEVEL = { bad: { icon: '✗', cls: 'text-red-300' }, warn: { icon: '!', cls: 'text-amber-300' }, good: { icon: '✓', cls: 'text-emerald-300' }, info: { icon: '•', cls: 'text-slate-400' } } as const;

/** One check's answer: the verdict, why, the links and numbers found, and what to do. */
export function ResultCard({ r }: { r: CheckResult }) {
  const v = VERDICT_LABEL[r.verdict];
  const groups = (Object.keys(SOURCE) as Source[]).map((s) => [s, r.signals.filter((x) => x.source === s)] as const).filter(([, list]) => list.length);
  return (
    <section className="space-y-3" aria-live="polite">
      {r.unchecked && r.ai !== 'pending' ? (
        <div className="rounded-2xl border border-white/15 bg-white/5 p-4">
          <p className="font-display text-2xl font-semibold">❔ Not checked</p>
          <p className="mt-1 text-sm text-slate-300">{r.aiNote ?? r.summary} Paste the words of the message instead, so the free checks can read them.</p>
        </div>
      ) : (
        <div className={`rounded-2xl border p-4 ${VERDICT_STYLE[r.verdict]}`}>
          <div className="flex items-center justify-between gap-2">
            <p className="font-display text-2xl font-semibold"><span aria-hidden="true">{v.icon}</span> {v.text}</p>
            <span className="num rounded-lg bg-black/25 px-2 py-0.5 text-sm" title="Risk score, 0 to 100">{r.score}/100</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/30" role="img" aria-label={`Risk ${r.score} out of 100`}>
            <div className={`h-full rounded-full ${BAR[r.verdict]}`} style={{ width: `${Math.max(4, r.score)}%` }} />
          </div>
          <p className="mt-2 text-sm">{r.summary}</p>
          {r.impersonating && <p className="mt-1 text-xs opacity-90">Claims to be: <b>{r.impersonating}</b></p>}
        </div>
      )}

      {r.ai === 'pending' && <p className="panel text-sm text-sky-100"><span className="spinner" /> 🤖 The AI is taking a closer look (10 to 40 seconds)…</p>}
      {r.aiNote && r.ai !== 'pending' && !r.unchecked && <p className="text-xs text-slate-400">{r.aiNote}</p>}

      {r.whatToDo.length > 0 && !r.unchecked && (
        <div className="card space-y-1.5">
          <p className="label">What to do</p>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-200">{r.whatToDo.map((s, i) => <li key={i}>{s}</li>)}</ol>
        </div>
      )}

      {groups.length > 0 && (
        <div className="card space-y-3">
          <p className="label">Why</p>
          {groups.map(([s, list]) => (
            <div key={s} className="space-y-1">
              <p className="text-sm font-medium"><span aria-hidden="true">{SOURCE[s].icon}</span> {SOURCE[s].name}</p>
              <ul className="space-y-1 pl-1">{dedupe(list).map((x, i) => (
                <li key={i} className="flex gap-2 text-sm">
                  <span className={`w-3 shrink-0 text-center font-bold ${LEVEL[x.level].cls}`} aria-hidden="true">{LEVEL[x.level].icon}</span>
                  <span className="min-w-0"><span className="text-slate-100">{x.title}</span>{x.detail && <span className="block text-xs text-slate-400">{x.detail}</span>}</span>
                </li>
              ))}</ul>
            </div>
          ))}
        </div>
      )}

      {(r.links.length > 0 || r.phones.length > 0 || r.sender) && (
        <div className="card space-y-2 text-sm">
          <p className="label">Found in the message</p>
          {r.sender && (
            <p className="break-words"><span aria-hidden="true">✉️</span> {r.sender.name ? `${r.sender.name} ` : ''}<span className="text-slate-400">&lt;{r.sender.address ?? '?'}&gt;</span>{r.sender.replyTo && <span className="block text-xs text-slate-400">Replies go to {r.sender.replyTo}</span>}{r.sender.auth && <span className="block text-xs text-slate-400">Sender checks: {r.sender.auth}</span>}</p>
          )}
          {r.links.map((l) => (
            <p key={l.url} className="break-all"><span className={`font-bold ${LEVEL[l.level].cls}`} aria-hidden="true">{LEVEL[l.level].icon}</span> 🌐 <b className="font-mono text-xs">{l.domain}</b> <span className="text-xs text-slate-400">— {l.note}{l.age ? ` · ${l.age}` : ''}</span></p>
          ))}
          {r.phones.map((p) => (
            <p key={p.number}><span className={`font-bold ${LEVEL[p.level].cls}`} aria-hidden="true">{LEVEL[p.level].icon}</span> 📞 <b className="num">{p.number}</b> <span className="text-xs text-slate-400">— {p.note}</span></p>
          ))}
          <p className="text-xs text-slate-500">Links are only looked up, never opened.</p>
        </div>
      )}
      <p className="text-xs text-slate-500">{KIND_LABEL[r.kind].icon} {KIND_LABEL[r.kind].text} · checked {new Date(r.checkedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}. A check can be wrong: when in doubt, contact the company yourself.</p>
    </section>
  );
}

const dedupe = (list: Signal[]) => list.filter((s, i) => list.findIndex((x) => x.title === s.title) === i);
