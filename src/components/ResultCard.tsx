import type { Brief, CheckResult, Signal, Source } from '../lib/types';
import { KIND_LABEL, VERDICT_LABEL } from '../lib/types';

const VERDICT_STYLE = {
  safe: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  suspicious: 'border-amber-200 bg-amber-50 text-amber-900',
  scam: 'border-red-200 bg-red-50 text-red-900',
} as const;
const BAR = { safe: 'bg-emerald-500', suspicious: 'bg-amber-400', scam: 'bg-red-500' } as const;
const SOURCE: Record<Source, { icon: string; name: string }> = {
  pattern: { icon: '🔎', name: 'Known scam patterns' },
  link: { icon: '🌐', name: 'Links & websites' },
  phone: { icon: '📞', name: 'Phone numbers' },
  sender: { icon: '✉️', name: 'Who sent it' },
  ai: { icon: '🤖', name: 'AI analysis' },
};
const LEVEL = { bad: { icon: '✗', cls: 'text-red-600' }, warn: { icon: '!', cls: 'text-amber-600' }, good: { icon: '✓', cls: 'text-emerald-600' }, info: { icon: '•', cls: 'text-stone-500' } } as const;

/** One check's answer: the verdict, why, the links and numbers found, and what to do. */
export function ResultCard({ r }: { r: CheckResult }) {
  const v = VERDICT_LABEL[r.verdict];
  const groups = (Object.keys(SOURCE) as Source[]).map((s) => [s, r.signals.filter((x) => x.source === s)] as const).filter(([, list]) => list.length);
  return (
    <section className="space-y-3" aria-live="polite">
      {r.unchecked && r.ai !== 'pending' ? (
        <div className="rounded-3xl border border-stone-200 bg-stone-100 p-4">
          <p className="font-display text-2xl font-semibold">❔ Not checked</p>
          <p className="mt-1 text-sm text-stone-600">{r.aiNote ?? r.summary} Paste the words of the message instead, so the free checks can read them.</p>
        </div>
      ) : (
        <div className={`rise rounded-3xl border p-4 ${VERDICT_STYLE[r.verdict]}`}>
          <div className="flex items-center justify-between gap-2">
            <p className="font-display text-2xl font-extrabold"><span aria-hidden="true">{v.icon}</span> {v.text}</p>
            <span className="num rounded-xl bg-white/80 px-2 py-0.5 text-sm font-semibold" title="Risk score, 0 to 100">{r.score}/100</span>
          </div>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/80" role="img" aria-label={`Risk ${r.score} out of 100`}>
            <div className={`h-full rounded-full ${BAR[r.verdict]}`} style={{ width: `${Math.max(4, r.score)}%` }} />
          </div>
          <p className="mt-2 text-sm">{r.summary}</p>
          {r.impersonating && <p className="mt-1 text-xs opacity-90">Claims to be: <b>{r.impersonating}</b></p>}
        </div>
      )}

      {r.ai === 'pending' && <p className="panel text-sm text-teal-800"><span className="spinner" /> 🤖 The AI is taking a closer look (10 to 40 seconds)…</p>}
      {r.aiNote && r.ai !== 'pending' && !r.unchecked && <p className="text-xs text-stone-500">{r.aiNote}</p>}

      {r.brief && r.verdict === 'safe' && <BriefCard b={r.brief} />}

      {r.whatToDo.length > 0 && !r.unchecked && !(r.brief && r.verdict === 'safe') && (
        <div className="card space-y-1.5">
          <p className="label">What to do</p>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-stone-800">{r.whatToDo.map((s, i) => <li key={i}>{s}</li>)}</ol>
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
                  <span className="min-w-0"><span className="text-stone-900">{x.title}</span>{x.detail && <span className="block text-xs text-stone-500">{x.detail}</span>}</span>
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
            <p className="break-words"><span aria-hidden="true">✉️</span> {r.sender.name ? `${r.sender.name} ` : ''}<span className="text-stone-500">&lt;{r.sender.address ?? '?'}&gt;</span>{r.sender.replyTo && <span className="block text-xs text-stone-500">Replies go to {r.sender.replyTo}</span>}{r.sender.auth && <span className="block text-xs text-stone-500">Sender checks: {r.sender.auth}</span>}</p>
          )}
          {r.links.map((l) => (
            <p key={l.url} className="break-all"><span className={`font-bold ${LEVEL[l.level].cls}`} aria-hidden="true">{LEVEL[l.level].icon}</span> 🌐 <b className="font-mono text-xs">{l.domain}</b> <span className="text-xs text-stone-500">— {l.note}{l.age ? ` · ${l.age}` : ''}</span></p>
          ))}
          {r.phones.map((p) => (
            <p key={p.number}><span className={`font-bold ${LEVEL[p.level].cls}`} aria-hidden="true">{LEVEL[p.level].icon}</span> 📞 <b className="num">{p.number}</b> <span className="text-xs text-stone-500">— {p.note}</span></p>
          ))}
          <p className="text-xs text-stone-500">Links are only looked up, never opened.</p>
        </div>
      )}
      <p className="text-xs text-stone-500">{KIND_LABEL[r.kind].icon} {KIND_LABEL[r.kind].text} · checked {new Date(r.checkedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}. A check can be wrong: when in doubt, contact the company yourself.</p>
    </section>
  );
}

const dedupe = (list: Signal[]) => list.filter((s, i) => list.findIndex((x) => x.title === s.title) === i);

/** Safe messages and documents: what it is, the key facts and what to do, in very simple words. */
export function BriefCard({ b }: { b: Brief }) {
  return (
    <div className="card rise space-y-3 border-teal-200">
      <div>
        <p className="label">📋 What it is</p>
        <p className="mt-0.5 text-base font-semibold text-stone-900">{b.whatItIs}</p>
      </div>
      {b.keyInfo.length > 0 && (
        <div>
          <p className="label">🔑 Key info</p>
          <dl className="mt-1 divide-y divide-stone-100 rounded-2xl border border-stone-200">
            {b.keyInfo.map((k) => (
              <div key={k.label} className="flex items-baseline justify-between gap-3 px-3 py-2 text-sm">
                <dt className="text-stone-500">{k.label}</dt>
                <dd className="text-right font-bold text-stone-900">{k.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      {b.steps.length > 0 && (
        <div>
          <p className="label">✅ What to do</p>
          <ol className="mt-1 space-y-1.5">
            {b.steps.map((s, i) => (
              <li key={i} className="flex gap-2.5 text-sm text-stone-800">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-700 text-xs font-bold text-white">{i + 1}</span>
                <span className="pt-0.5">{s}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
