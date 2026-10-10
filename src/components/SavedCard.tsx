import { useState } from 'react';
import { KIND_LABEL, VERDICT_LABEL, type SavedItem } from '../lib/types';
import { BriefCard } from './ResultCard';

const CHIP = { safe: 'border-emerald-200 bg-emerald-50 text-emerald-800', suspicious: 'border-amber-200 bg-amber-50 text-amber-800', scam: 'border-red-200 bg-red-50 text-red-800' } as const;
const DOT = { bad: 'text-red-600', warn: 'text-amber-600', good: 'text-emerald-600', info: 'text-stone-500' } as const;
const when = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

/** One saved check: the headline at a glance, the key facts when opened, your note (editable), delete. */
export function SavedCard({ s, onNote, onDelete, example = false }: { s: SavedItem; onNote?: (note: string) => Promise<void>; onDelete?: () => void; example?: boolean }) {
  const [open, setOpen] = useState(example);
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(s.note);
  const [busy, setBusy] = useState(false);
  return (
    <article className="card space-y-2">
      <button className="flex w-full items-start gap-3 text-left" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="text-2xl" aria-hidden="true">{KIND_LABEL[s.kind].icon}</span>
        <span className="min-w-0 flex-1">
          <span className={`inline-flex rounded-md border px-1.5 py-0.5 text-[11px] font-semibold ${s.unchecked ? 'border-stone-200 bg-stone-100 text-stone-600' : CHIP[s.verdict]}`}>
            {s.unchecked ? '❔ Not checked' : `${VERDICT_LABEL[s.verdict].icon} ${VERDICT_LABEL[s.verdict].text} · ${s.score}/100`}
          </span>
          <span className="mt-1 block text-sm font-medium text-stone-900">{s.impersonating ? `Pretended to be ${s.impersonating}` : s.excerpt || KIND_LABEL[s.kind].text}</span>
          {s.note && <span className="block text-sm text-teal-800">📝 {s.note}</span>}
          <span className="block text-xs text-stone-500">Checked {when(s.checkedAt)}</span>
        </span>
        <span className="text-stone-500" aria-hidden="true">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-stone-200 pt-2 text-sm">
          <p className="text-stone-800">{s.summary}</p>
          {s.brief && s.verdict === 'safe' && <BriefCard b={s.brief} />}
          {s.excerpt && <p className="text-xs italic text-stone-500">“{s.excerpt}”</p>}
          {s.sender?.address && <p className="break-words">✉️ {s.sender.name ? `${s.sender.name} ` : ''}<span className="text-stone-500">&lt;{s.sender.address}&gt;</span></p>}
          {s.phones.map((p) => <p key={p.number}><span className={DOT[p.level]} aria-hidden="true">●</span> 📞 <b className="num">{p.number}</b> <span className="text-xs text-stone-500">— {p.note}</span></p>)}
          {s.links.map((l) => <p key={l.domain} className="break-all"><span className={DOT[l.level]} aria-hidden="true">●</span> 🌐 <b className="font-mono text-xs">{l.domain}</b> <span className="text-xs text-stone-500">— {l.note}</span></p>)}
          {s.reasons.length > 0 && (
            <div><p className="label">Why</p><ul className="list-disc space-y-0.5 pl-5 text-stone-600">{s.reasons.map((r) => <li key={r}>{r}</li>)}</ul></div>
          )}
          {s.whatToDo.length > 0 && !(s.brief && s.verdict === 'safe') && (
            <div><p className="label">What to do</p><ol className="list-decimal space-y-0.5 pl-5 text-stone-600">{s.whatToDo.map((r) => <li key={r}>{r}</li>)}</ol></div>
          )}
          {editing ? (
            <div className="flex flex-wrap gap-2">
              <input className="input min-w-0 flex-1" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Your note" aria-label="Note" />
              <button className="btn-primary" disabled={busy} onClick={() => { if (!onNote) return; setBusy(true); void onNote(note.trim()).then(() => setEditing(false)).finally(() => setBusy(false)); }}>Save note</button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button className="btn" onClick={() => !example && setEditing(true)}>📝 {s.note ? 'Edit note' : 'Add a note'}</button>
              <button className="btn" onClick={() => !example && onDelete?.()}>🗑 Delete</button>
            </div>
          )}
          <p className="text-xs text-stone-500">Saved {when(s.savedAt)}</p>
        </div>
      )}
    </article>
  );
}
