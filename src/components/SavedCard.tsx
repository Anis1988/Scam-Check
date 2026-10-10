import { useEffect, useState } from 'react';
import { api, downloadFile, fileLink } from '../lib/api';
import { isNative } from '../lib/native';
import { ScoreRing, VerdictChip, toast } from './ui';
import { KIND_LABEL, type SavedItem } from '../lib/types';
import { BriefCard, CheckedBy } from './ResultCard';

const DOT = { bad: 'text-red-600', warn: 'text-amber-600', good: 'text-emerald-600', info: 'text-stone-500' } as const;
const when = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

/** One saved check: the headline at a glance, the key facts when opened, your note (editable), delete. */
export function SavedCard({ s, onNote, onDelete, onChange, example = false }: { s: SavedItem; onNote?: (note: string, name?: string) => Promise<void>; onDelete?: () => void; onChange?: (s: SavedItem) => void; example?: boolean }) {
  const [open, setOpen] = useState(example);
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(s.note);
  const [name, setName] = useState(s.name ?? '');
  const [busy, setBusy] = useState(false);
  return (
    <article className="card space-y-2">
      <button className="flex w-full items-start gap-3 text-left" onClick={() => setOpen(!open)} aria-expanded={open}>
        {s.unchecked ? <span className="flex h-12 w-12 shrink-0 items-center justify-center text-2xl" aria-hidden="true">{KIND_LABEL[s.kind].icon}</span> : <ScoreRing score={s.score} verdict={s.verdict} size={48} />}
        <span className="min-w-0 flex-1">
          {s.name && <span className="block truncate font-display text-base font-semibold text-stone-900">{s.name}</span>}
          {s.aiBy && <span className="mt-0.5 block"><CheckedBy ai="done" aiBy={s.aiBy} /></span>}
          <span className="mt-0.5 flex flex-wrap items-center gap-1.5"><VerdictChip verdict={s.verdict} unchecked={s.unchecked} />{s.file && <span className="chip border-stone-200 bg-white/70 text-stone-600">{s.file.mime === 'application/pdf' ? '📄 PDF' : s.file.mime.startsWith('audio/') ? '🎙️ Recording' : '🖼️ Picture'}</span>}</span>
          <span className="mt-1 block text-sm text-stone-700">{s.impersonating ? `Pretended to be ${s.impersonating}` : s.brief?.whatItIs || s.excerpt || KIND_LABEL[s.kind].text}</span>
          {s.note && <span className="block text-sm text-teal-800">📝 {s.note}</span>}
          <span className="block text-xs text-stone-500">Checked {when(s.checkedAt)}</span>
        </span>
        <span className="text-stone-500" aria-hidden="true">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-stone-200/70 pt-2 text-sm">
          <p className="text-stone-800">{s.summary}</p>
          {s.brief && s.verdict === 'safe' && <BriefCard b={s.brief} />}
          {s.file && <Original s={s} example={example} onRemoved={onChange} />}
          {s.text ? (
            <details className="panel">
              <summary className="cursor-pointer text-sm font-semibold text-stone-700">📄 The original message</summary>
              <p className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words text-sm text-stone-700">{s.text}</p>
            </details>
          ) : s.excerpt && <p className="text-xs italic text-stone-500">“{s.excerpt}”</p>}
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
            <div className="space-y-2">
              {s.name && <label className="block space-y-1"><span className="label">Name</span><input className="input w-full font-mono" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} aria-label="Name" /></label>}
              <label className="block space-y-1"><span className="label">Note</span><input className="input w-full" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Your note" aria-label="Note" /></label>
              <div className="flex gap-2">
                <button className="btn-primary flex-1" disabled={busy || (!!s.name && !name.trim())} onClick={() => { if (!onNote) return; setBusy(true); void onNote(note.trim(), s.name ? name.trim() : undefined).then(() => setEditing(false)).finally(() => setBusy(false)); }}>Save</button>
                <button className="btn" disabled={busy} onClick={() => (setEditing(false), setName(s.name ?? ''), setNote(s.note))}>Cancel</button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button className="btn" onClick={() => !example && setEditing(true)}>✏️ {s.name ? 'Rename / note' : s.note ? 'Edit note' : 'Add a note'}</button>
              <button className="btn" onClick={() => !example && onDelete?.()}>🗑 Delete this check</button>
            </div>
          )}
          <p className="text-xs text-stone-500">Saved {when(s.savedAt)}</p>
        </div>
      )}
    </article>
  );
}

/** The kept picture or PDF: shown on request (it can be big), downloadable, removable. */
function Original({ s, example, onRemoved }: { s: SavedItem; example: boolean; onRemoved?: (s: SavedItem) => void }) {
  const [file, setFile] = useState<{ mime: string; name: string; data: string } | null>(null);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState('');
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  const isPdf = s.file!.mime === 'application/pdf';
  const isRec = s.file!.mime.startsWith('audio/');
  const what = isPdf ? 'PDF' : isRec ? 'recording' : 'picture';
  const load = async () => {
    if (file) return file;
    const f = await api.file(s.id);
    setFile(f);
    return f;
  };
  const run = async (what: string, f: () => Promise<void>) => {
    if (example) return;
    setBusy(what);
    try { await f(); } catch (e) { toast('error', e instanceof Error ? e.message : String(e)); } finally { setBusy(''); }
  };
  const kb = Math.max(1, Math.round(s.file!.size / 1024));
  return (
    <div className="panel space-y-2">
      <p className="break-all text-sm font-semibold text-stone-700">{isPdf ? '📄' : isRec ? '🎙️' : '🖼️'} {s.file!.name} <span className="font-normal text-stone-500">· {kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`}</span></p>
      {url && (isRec ? <audio controls src={url} className="w-full" /> : isPdf
        ? (isNative() ? <button className="btn-ghost" onClick={() => void run('dl', async () => { const f = await load(); await downloadFile(s.name ? { ...f, name: s.name } : f); })}>Open the PDF ↗</button>
          : <a className="btn-ghost" href={url} target="_blank" rel="noopener noreferrer">Open the PDF ↗</a>)
        : <img src={url} alt="The saved picture" className="rise max-h-[70vh] w-full rounded-xl border border-white bg-white object-contain shadow-[0_0_0_1px_rgba(31,66,71,0.08)]" />)}
      <div className="flex flex-wrap gap-2">
        {!url && <button className="btn" disabled={!!busy} onClick={() => void run('show', async () => setUrl(fileLink(await load())))}>{busy === 'show' ? <><span className="spinner" /> Loading…</> : isPdf ? '👁 View the PDF' : isRec ? '▶ Play the recording' : '👁 View the picture'}</button>}
        <button className="btn" disabled={!!busy} onClick={() => void run('dl', async () => { const f = await load(); await downloadFile(s.name ? { ...f, name: s.name } : f); })}>{busy === 'dl' ? <><span className="spinner" /> …</> : isNative() ? '⬇ Save / share' : '⬇ Download'}</button>
        <button className="btn" disabled={!!busy} onClick={() => !example && window.confirm(`Delete the ${what}? The key facts and your note stay.`) && void run('rm', async () => { onRemoved?.(await api.removeFile(s.id)); toast('success', 'Deleted.'); })}>🗑 Delete {what}</button>
      </div>
    </div>
  );
}
