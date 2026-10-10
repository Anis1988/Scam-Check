import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import type { SavedItem } from '../lib/types';
import { SavedCard } from '../components/SavedCard';
import { toast } from '../components/ui';

/** ⭐ Saved checks, kept on the server until you delete them: on the phone and the computer alike. */
export function Saved() {
  const [list, setList] = useState<SavedItem[] | null>(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => void api.saved().then(setList, (e) => setErr(e instanceof Error ? e.message : String(e))), []);
  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!list || !words.length) return list ?? [];
    return list.filter((s) => {
      const hay = [s.note, s.summary, s.excerpt, s.impersonating, s.sender?.name, s.sender?.address, ...s.phones.map((p) => p.number), ...s.links.map((l) => l.domain), ...s.reasons, s.verdict, s.kind].join(' ').toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [list, q]);

  const remove = async (s: SavedItem) => {
    if (!window.confirm('Delete this saved check?')) return;
    try {
      await api.unsave(s.id);
      setList((l) => (l ?? []).filter((x) => x.id !== s.id));
    } catch (e) {
      toast('error', e instanceof Error ? e.message : String(e));
    }
  };
  const note = async (s: SavedItem, n: string) => {
    try {
      const next = await api.setNote(s.id, n);
      setList((l) => (l ?? []).map((x) => (x.id === s.id ? next : x)));
    } catch (e) {
      toast('error', e instanceof Error ? e.message : String(e));
      throw e;
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-3">
      <div>
        <h1 className="text-2xl font-extrabold">⭐ Saved</h1>
        <p className="text-sm text-stone-500">The checks you saved: only the key facts, kept until you delete them.</p>
      </div>
      {err && <p className="card text-sm text-red-700">{err}</p>}
      {!list && !err && <p className="text-stone-500"><span className="spinner" /> Loading…</p>}
      {list && list.length > 0 && <input className="input w-full" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search: a name, number, website, word in your note…" aria-label="Search saved checks" />}
      {list && !list.length && <p className="card text-sm text-stone-600">Nothing saved yet. After a check, tap <b>⭐ Save this check</b>.</p>}
      {list && list.length > 0 && !shown.length && <p className="text-sm text-stone-500">Nothing matches “{q}”.</p>}
      <div className="space-y-2">{shown.map((s) => <SavedCard key={s.id} s={s} onNote={(n) => note(s, n)} onDelete={() => void remove(s)} />)}</div>
    </div>
  );
}
