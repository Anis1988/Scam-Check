import { useState } from 'react';
import { api, type Upload } from '../lib/api';
import { toast } from './ui';

/** ⭐ Save a check: its key facts, your note and (if you keep them) the original message and picture. */
export function SaveBox({ id, text, file, example = false }: { id: string; text?: string; file?: Upload; example?: boolean }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [keep, setKeep] = useState(true);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const hasOriginal = !!(text?.trim() || file);
  const save = async () => {
    if (example) return;
    setBusy(true);
    try {
      await api.save(id, note, keep ? { text, file } : undefined);
      setSaved(true);
      toast('success', 'Saved. Find it in the ⭐ Saved tab.');
    } catch (e) {
      toast('error', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  if (saved) return <p className="panel text-sm font-semibold text-emerald-800">⭐ Saved{note ? ` with your note: “${note}”` : ''}.</p>;
  if (!open) return <button className="btn w-full" onClick={() => setOpen(true)}>⭐ Save this check</button>;
  return (
    <div className="card space-y-3">
      <input className="input w-full" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Note (optional), e.g. Called my bank, all fine" aria-label="Note" />
      {hasOriginal && (
        <label className="flex cursor-pointer items-start gap-2 text-sm text-stone-700">
          <input type="checkbox" className="mt-1 h-4 w-4 accent-teal-700" checked={keep} onChange={(e) => setKeep(e.target.checked)} />
          <span>Keep the original {file ? (file.mime === 'application/pdf' ? '(the PDF' : '(the picture') + (text?.trim() ? ' and the message)' : ')') : '(the message)'}, to see or download it later.</span>
        </label>
      )}
      <div className="flex gap-2">
        <button className="btn-primary flex-1" disabled={busy} onClick={() => void save()}>{busy ? <><span className="spinner" /> Saving…</> : '⭐ Save'}</button>
        <button className="btn" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}
