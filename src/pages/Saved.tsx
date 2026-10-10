import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '../lib/api';
import { VERDICT_LABEL, type SavedItem, type Verdict } from '../lib/types';
import { useStatus } from '../lib/useStatus';
import { SavedCard } from '../components/SavedCard';
import { Rail, Shell, toast } from '../components/ui';
import { Bills } from './Bills';

type Filter = 'all' | Verdict | 'files';

/** ⭐ Saved checks, kept on the server until you delete them: on the phone and the computer alike. */
export function Saved() {
  const [view, setView] = useState<'saved' | 'bills'>(() => (window.location.pathname.startsWith('/bills') ? 'bills' : 'saved'));
  const tabs = (
    <div className="flex gap-1 rounded-xl border border-stone-200/80 bg-white/50 p-1" role="tablist" aria-label="Saved or bills">
      {([['saved', '⭐ Saved checks'], ['bills', '📅 Bills']] as const).map(([id, name]) => (
        <button key={id} role="tab" aria-selected={view === id} onClick={() => setView(id)}
          className={`min-h-[40px] flex-1 rounded-lg px-3 text-sm font-semibold transition ${view === id ? 'bg-white text-teal-800 shadow-[0_0_0_1px_rgba(74,146,155,0.35),0_0_12px_-3px_rgba(74,146,155,0.5)]' : 'text-stone-500 hover:text-stone-800'}`}>{name}</button>
      ))}
    </div>
  );
  if (view === 'bills') return <Bills tabs={tabs} />;
  return <SavedChecks tabs={tabs} />;
}

function SavedChecks({ tabs }: { tabs: ReactNode }) {
  const st = useStatus();
  const [list, setList] = useState<SavedItem[] | null>(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  useEffect(() => void api.saved().then(setList, (e) => setErr(e instanceof Error ? e.message : String(e))), []);
  const count = (f: Filter) => (list ?? []).filter((s) => f === 'all' || (f === 'files' ? !!s.file : !s.unchecked && s.verdict === f)).length;
  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return (list ?? []).filter((s) => {
      if (filter === 'files' ? !s.file : filter !== 'all' && (s.unchecked || s.verdict !== filter)) return false;
      if (!words.length) return true;
      const hay = [s.name, s.note, s.summary, s.excerpt, s.text, s.brief?.whatItIs, ...(s.brief?.keyInfo.map((k) => k.value) ?? []), s.impersonating, s.sender?.name, s.sender?.address, ...s.phones.map((p) => p.number), ...s.links.map((l) => l.domain), ...s.reasons, s.verdict, s.kind].join(' ').toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [list, q, filter]);

  const remove = async (s: SavedItem) => {
    if (!window.confirm(`Delete “${s.name ?? 'this saved check'}”?`)) return;
    try {
      await api.unsave(s.id);
      setList((l) => (l ?? []).filter((x) => x.id !== s.id));
    } catch (e) {
      toast('error', e instanceof Error ? e.message : String(e));
    }
  };
  const note = async (s: SavedItem, n: string, name?: string) => {
    try {
      const next = await api.setNote(s.id, n, name);
      setList((l) => (l ?? []).map((x) => (x.id === s.id ? next : x)));
    } catch (e) {
      toast('error', e instanceof Error ? e.message : String(e));
      throw e;
    }
  };

  const FILTERS: { id: Filter; name: string }[] = [
    { id: 'all', name: 'All' },
    ...(['safe', 'suspicious', 'scam'] as Verdict[]).map((v) => ({ id: v, name: `${VERDICT_LABEL[v].icon} ${VERDICT_LABEL[v].text}` })),
    { id: 'files', name: '🖼️ With picture/PDF' },
  ];
  const chips = (vertical: boolean) => (
    <div className={vertical ? 'flex flex-col gap-1' : '-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1'} role="radiogroup" aria-label="Show">
      {FILTERS.map((f) => (
        <button key={f.id} role="radio" aria-checked={filter === f.id} onClick={() => setFilter(f.id)}
          className={`flex shrink-0 items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-sm font-semibold transition ${filter === f.id ? 'bg-white text-teal-800 shadow-[0_0_0_1px_rgba(74,146,155,0.35)]' : 'text-stone-600 hover:bg-white/70'} ${vertical ? '' : 'border border-stone-200/80 bg-white/50'}`}>
          <span className="whitespace-nowrap">{f.name}</span><span className="num text-xs text-stone-400">{count(f.id)}</span>
        </button>
      ))}
    </div>
  );
  const c = st?.settings.cleanup;

  return (
    <Shell
      left={<Rail title="Show">{chips(true)}</Rail>}
      right={
        <Rail title="Storage">
          <p className="font-display text-3xl font-bold text-stone-900">{list?.length ?? '–'}<span className="ml-1 text-sm font-medium text-stone-500">saved</span></p>
          <p className="text-sm text-stone-600">{count('files')} with a picture or PDF</p>
          <p className="text-xs text-stone-500">🧹 Clean-up: {c?.enabled ? `${c.what === 'all' ? 'whole checks' : 'pictures and messages'} after ${c.days} days` : 'off'} (Settings)</p>
        </Rail>
      }>
      {tabs}
      <div>
        <p className="label">Your library</p>
        <h1 className="text-2xl font-bold">⭐ Saved</h1>
        <p className="text-sm text-stone-500">Each one is named with a number and what it is, like “1-Duke Energy”. Kept until you delete it.</p>
      </div>
      {err && <p className="card text-sm text-red-700">{err}</p>}
      {!list && !err && <p className="text-stone-500"><span className="spinner" /> Loading…</p>}
      {list && list.length > 0 && (
        <>
          <input className="input w-full" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search: a name, number, website, word in your note…" aria-label="Search saved checks" />
          <div className="xl:hidden">{chips(false)}</div>
        </>
      )}
      {list && !list.length && <p className="card text-sm text-stone-600">Nothing saved yet. After a check, tap <b>⭐ Save this check</b>.</p>}
      {list && list.length > 0 && !shown.length && <p className="text-sm text-stone-500">Nothing matches.</p>}
      <div className="grid items-start gap-3 2xl:grid-cols-2">{shown.map((s) => <SavedCard key={`${s.id}${s.name ?? ''}`} s={s} onNote={(n, name) => note(s, n, name)} onDelete={() => void remove(s)} onChange={(next) => setList((l) => (l ?? []).map((x) => (x.id === next.id ? next : x)))} />)}</div>
    </Shell>
  );
}
