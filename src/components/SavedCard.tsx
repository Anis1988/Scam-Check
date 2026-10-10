import { useState } from 'react';
import { KIND_LABEL, VERDICT_LABEL, type SavedItem } from '../lib/types';

const CHIP = { safe: 'border-emerald-300/50 bg-emerald-400/15 text-emerald-100', suspicious: 'border-amber-300/50 bg-amber-400/15 text-amber-100', scam: 'border-red-300/50 bg-red-400/20 text-red-100' } as const;
const DOT = { bad: 'text-red-300', warn: 'text-amber-300', good: 'text-emerald-300', info: 'text-slate-400' } as const;
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
          <span className={`inline-flex rounded-md border px-1.5 py-0.5 text-[11px] font-semibold ${s.unchecked ? 'border-white/15 bg-white/5 text-slate-300' : CHIP[s.verdict]}`}>
            {s.unchecked ? '❔ Not checked' : `${VERDICT_LABEL[s.verdict].icon} ${VERDICT_LABEL[s.verdict].text} · ${s.score}/100`}
          </span>
          <span className="mt-1 block text-sm font-medium text-slate-100">{s.impersonating ? `Pretended to be ${s.impersonating}` : s.excerpt || KIND_LABEL[s.kind].text}</span>
          {s.note && <span className="block text-sm text-emerald-100/90">📝 {s.note}</span>}
          <span className="block text-xs text-slate-500">Checked {when(s.checkedAt)}</span>
        </span>
        <span className="text-slate-400" aria-hidden="true">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-white/10 pt-2 text-sm">
          <p className="text-slate-200">{s.summary}</p>
          {s.excerpt && <p className="text-xs italic text-slate-400">“{s.excerpt}”</p>}
          {s.sender?.address && <p className="break-words">✉️ {s.sender.name ? `${s.sender.name} ` : ''}<span className="text-slate-400">&lt;{s.sender.address}&gt;</span></p>}
          {s.phones.map((p) => <p key={p.number}><span className={DOT[p.level]} aria-hidden="true">●</span> 📞 <b className="num">{p.number}</b> <span className="text-xs text-slate-400">— {p.note}</span></p>)}
          {s.links.map((l) => <p key={l.domain} className="break-all"><span className={DOT[l.level]} aria-hidden="true">●</span> 🌐 <b className="font-mono text-xs">{l.domain}</b> <span className="text-xs text-slate-400">— {l.note}</span></p>)}
          {s.reasons.length > 0 && (
            <div><p className="label">Why</p><ul className="list-disc space-y-0.5 pl-5 text-slate-300">{s.reasons.map((r) => <li key={r}>{r}</li>)}</ul></div>
          )}
          {s.whatToDo.length > 0 && (
            <div><p className="label">What to do</p><ol className="list-decimal space-y-0.5 pl-5 text-slate-300">{s.whatToDo.map((r) => <li key={r}>{r}</li>)}</ol></div>
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
          <p className="text-xs text-slate-500">Saved {when(s.savedAt)}</p>
        </div>
      )}
    </article>
  );
}
