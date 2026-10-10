import { useState } from 'react';
import { api } from '../lib/api';
import { toast } from './ui';

/** ⭐ Save a check: its key facts (not the whole message) are kept on the server, with your note. */
export function SaveBox({ id, example = false }: { id: string; example?: boolean }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const save = async () => {
    if (example) return;
    setBusy(true);
    try {
      await api.save(id, note);
      setSaved(true);
      toast('success', 'Saved. Find it in the ⭐ Saved tab.');
    } catch (e) {
      toast('error', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  if (saved) return <p className="panel text-sm text-emerald-200">⭐ Saved{note ? ` with your note: “${note}”` : ''}.</p>;
  if (!open) return <button className="btn w-full" onClick={() => setOpen(true)}>⭐ Save this check</button>;
  return (
    <div className="card space-y-2">
      <p className="text-sm text-slate-300">Saves the key facts (verdict, sender, numbers, websites, reasons), not the whole message or picture.</p>
      <input className="input w-full" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Note (optional), e.g. Called my bank, all fine" aria-label="Note" />
      <div className="flex gap-2">
        <button className="btn-primary flex-1" disabled={busy} onClick={() => void save()}>{busy ? <><span className="spinner" /> Saving…</> : '⭐ Save'}</button>
        <button className="btn" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}
