import type { Brief, CheckResult, Signal, Source } from '../lib/types';
import { KIND_LABEL, VERDICT_LABEL } from '../lib/types';
import { useState } from 'react';
import { api } from '../lib/api';
import { BillStrip } from './bills';
import { ScoreRing, toast } from './ui';

const VERDICT_STYLE = {
  safe: 'from-emerald-50/90 text-emerald-900 shadow-[0_0_0_1px_rgba(94,140,110,0.25),0_12px_30px_-14px_rgba(94,140,110,0.5)]',
  suspicious: 'from-amber-50/90 text-amber-900 shadow-[0_0_0_1px_rgba(163,132,75,0.25),0_12px_30px_-14px_rgba(163,132,75,0.5)]',
  scam: 'from-red-50/90 text-red-900 shadow-[0_0_0_1px_rgba(163,104,95,0.25),0_12px_30px_-14px_rgba(163,104,95,0.5)]',
} as const;
const SOURCE: Record<Source, { icon: string; name: string }> = {
  pattern: { icon: '🔎', name: 'Known scam patterns' },
  link: { icon: '🌐', name: 'Links & websites' },
  phone: { icon: '📞', name: 'Phone numbers' },
  sender: { icon: '✉️', name: 'Who sent it' },
  list: { icon: '📒', name: 'Your trusted / blocked lists' },
  ai: { icon: '🤖', name: 'AI analysis' },
};
const LEVEL = { bad: { icon: '✗', cls: 'text-red-600' }, warn: { icon: '!', cls: 'text-amber-600' }, good: { icon: '✓', cls: 'text-emerald-600' }, info: { icon: '•', cls: 'text-stone-500' } } as const;

/** One check's answer: the verdict, why, the links and numbers found, and what to do. */
export function ResultCard({ r, example = false, onChanged }: { r: CheckResult; example?: boolean; onChanged?: () => void }) {
  const mark = (value: string) => <MarkButtons value={value} example={example} onChanged={onChanged} />;
  const v = VERDICT_LABEL[r.verdict];
  const groups = (Object.keys(SOURCE) as Source[]).map((s) => [s, r.signals.filter((x) => x.source === s)] as const).filter(([, list]) => list.length);
  return (
    <section className="space-y-3" aria-live="polite">
      {r.unchecked && r.ai !== 'pending' ? (
        <div className="card">
          <p className="label">Result</p>
          <p className="font-display text-2xl font-semibold">❔ Not checked</p>
          <p className="mt-1 text-sm text-stone-600">{r.aiNote ?? r.summary} Paste the words of the message instead, so the free checks can read them.</p>
        </div>
      ) : (
        <div className={`rise rounded-2xl bg-gradient-to-br to-white/70 p-4 backdrop-blur-xl ${VERDICT_STYLE[r.verdict]}`}>
          <div className="flex items-center gap-3.5">
            <ScoreRing score={r.score} verdict={r.verdict} muted={r.ai === 'pending'} />
            <div className="min-w-0">
              <p className="label !text-current opacity-70">{r.ai === 'pending' ? 'Free checks · AI coming' : 'Safety score'}</p>
              <p className="font-display text-2xl font-bold leading-tight"><span aria-hidden="true">{v.icon}</span> {v.text}</p>
              {r.title && <p className="truncate text-xs font-semibold opacity-80">{r.title}</p>}
            </div>
          </div>
          <p className="mt-3 text-sm">{r.summary}</p>
          {r.impersonating && <p className="mt-1 text-xs opacity-90">Claims to be: <b>{r.impersonating}</b></p>}
        </div>
      )}

      {r.ai === 'pending' && <p className="panel scan text-sm text-teal-800"><span className="spinner" /> 🤖 The AI is taking a closer look (10 to 40 seconds)…</p>}
      {r.aiNote && r.ai !== 'pending' && !r.unchecked && <p className="text-xs text-stone-500">{r.aiNote}</p>}

      {r.brief && r.verdict === 'safe' && <BriefCard b={r.brief} />}
      {r.bill && r.verdict === 'safe' && <BillStrip b={r.bill} compare={r.billCompare} />}

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
            <div><p className="break-words"><span aria-hidden="true">✉️</span> {r.sender.name ? `${r.sender.name} ` : ''}<span className="text-stone-500">&lt;{r.sender.address ?? '?'}&gt;</span>{r.sender.replyTo && <span className="block text-xs text-stone-500">Replies go to {r.sender.replyTo}</span>}{r.sender.auth && <span className="block text-xs text-stone-500">Sender checks: {r.sender.auth}</span>}</p>{r.sender.address && mark(r.sender.address)}</div>
          )}
          {r.links.map((l) => (
            <div key={l.url}><p className="break-all"><span className={`font-bold ${LEVEL[l.level].cls}`} aria-hidden="true">{LEVEL[l.level].icon}</span> 🌐 <b className="font-mono text-xs">{l.domain}</b> <span className="text-xs text-stone-500">— {l.note}{l.age ? ` · ${l.age}` : ''}</span></p>{mark(l.domain)}</div>
          ))}
          {r.phones.map((p) => (
            <div key={p.number}><p><span className={`font-bold ${LEVEL[p.level].cls}`} aria-hidden="true">{LEVEL[p.level].icon}</span> 📞 <b className="num">{p.number}</b> <span className="text-xs text-stone-500">— {p.note}</span></p>{mark(p.number)}</div>
          ))}
          <p className="text-xs text-stone-500">Links are only looked up, never opened.</p>
        </div>
      )}
      <p className="text-xs text-stone-500">{KIND_LABEL[r.kind].icon} {KIND_LABEL[r.kind].text}{r.aiBy && r.ai === 'done' ? ` · 🤖 ${r.aiBy}` : ''} · checked {new Date(r.checkedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}. A check can be wrong: when in doubt, contact the company yourself.</p>
    </section>
  );
}

/** ✓ Trust / 🚫 Block a number, email address or website: your next checks will know it. */
function MarkButtons({ value, example, onChanged }: { value: string; example: boolean; onChanged?: () => void }) {
  const [done, setDone] = useState<'' | 'trusted' | 'blocked'>('');
  const [busy, setBusy] = useState(false);
  const add = async (list: 'trusted' | 'blocked') => {
    if (example) return;
    setBusy(true);
    try {
      const e = await api.listAdd(value, list);
      setDone(list);
      toast('success', list === 'trusted' ? `✓ ${e.value} is now trusted.` : `🚫 ${e.value} is now blocked: it will always show as a likely scam.`);
      onChanged?.();
    } catch (e) {
      toast('error', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  if (done) return <p className="mt-0.5 pl-5 text-xs font-semibold text-stone-500">{done === 'trusted' ? '✓ On your trusted list' : '🚫 On your blocked list'}</p>;
  return (
    <div className="mt-1 flex gap-1.5 pl-5">
      <button className="chip min-h-[32px] border-emerald-200 bg-white/70 px-2.5 text-emerald-800" disabled={busy} onClick={() => void add('trusted')} tabIndex={example ? -1 : 0}>✓ Trust</button>
      <button className="chip min-h-[32px] border-red-200 bg-white/70 px-2.5 text-red-800" disabled={busy} onClick={() => void add('blocked')} tabIndex={example ? -1 : 0}>🚫 Block</button>
    </div>
  );
}

const dedupe = (list: Signal[]) => list.filter((s, i) => list.findIndex((x) => x.title === s.title) === i);

/** Safe messages and documents: what it is, the key facts and what to do, in very simple words. */
export function BriefCard({ b }: { b: Brief }) {
  return (
    <div className="card rise space-y-3">
      <div>
        <p className="label">📋 What it is</p>
        <p className="mt-0.5 text-base font-semibold text-stone-900">{b.whatItIs}</p>
      </div>
      {b.keyInfo.length > 0 && (
        <div>
          <p className="label">🔑 Key info</p>
          <dl className="mt-1 divide-y divide-stone-200/70 rounded-xl border border-stone-200/80 bg-white/60">
            {b.keyInfo.map((k) => (
              <div key={k.label} className="flex items-baseline justify-between gap-3 px-3 py-2 text-sm">
                <dt className="text-stone-500">{k.label}</dt>
                <dd className="text-right font-mono font-semibold text-stone-900">{k.value}</dd>
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
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal-600 to-iris-600 font-mono text-xs font-semibold text-white shadow-[0_0_8px_rgba(74,146,155,0.5)]">{i + 1}</span>
                <span className="pt-0.5">{s}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
