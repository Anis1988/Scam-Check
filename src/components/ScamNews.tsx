import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { ModelChoice, ScamNews } from '../lib/types';
import { refreshStatus } from '../lib/useStatus';
import { ModelMenu, needsSearch } from './ModelMenu';
import { Fold } from './ui';

const days = (iso: string) => Math.floor((Date.now() - Date.parse(iso)) / 86400_000);

/** The list itself (also the Guide's example). */
export function NewsList({ n }: { n: ScamNews }) {
  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {n.items.map((x, i) => (
          <li key={i} className="rounded-xl border border-stone-200/80 bg-white/60 p-2.5 text-sm">
            <p className="font-semibold text-stone-900">{x.name}{x.who && <span className="ml-1.5 text-xs font-normal text-stone-500">· {x.who}</span>}</p>
            <p className="text-stone-700">{x.how}</p>
            <p className="mt-0.5 text-teal-800">👉 {x.tell}</p>
          </li>
        ))}
      </ul>
      <p className="hud !text-[10px]">Updated {new Date(n.checkedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}{n.aiBy ? ` · ${n.aiBy} + web search` : ''}</p>
      {n.sources.length > 0 && <ul className="space-y-0.5">{n.sources.slice(0, 5).map((s) => <li key={s.url} className="truncate text-xs"><a className="text-teal-700 underline" href={s.url} target="_blank" rel="noopener noreferrer">{s.title || s.url}</a></li>)}</ul>}
    </div>
  );
}

/** 📰 On Check, folded: scams going around now. Made only when you ask (1 AI check), then shared by your devices. */
export function ScamNewsFold() {
  return (
    <Fold id="news" title="📰 Scams going around now" subtitle="From the latest news · tap to see">
      <NewsBody />
    </Fold>
  );
}

function NewsBody() {
  const [news, setNews] = useState<ScamNews | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { void api.news().then((r) => setNews(r.news), () => setNews(null)); }, []);
  const make = async (m?: ModelChoice) => {
    setBusy(true);
    setError('');
    try {
      setNews(await api.makeNews(m));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      void refreshStatus();
    }
  };
  if (news === undefined) return <p className="text-sm text-stone-500"><span className="spinner" /> Loading…</p>;
  const old = news ? days(news.checkedAt) : 99;
  return (
    <div className="space-y-2.5">
      {news && <NewsList n={news} />}
      {busy ? <p className="panel scan text-sm text-teal-800"><span className="spinner" /> Searching this week’s news…</p> : (
        <>
          {error && <p className="break-words text-sm text-amber-800">{error}</p>}
          {(!news || old >= 7) && <button className="btn-primary w-full" onClick={() => void make()}>📰 {news ? `This list is ${old} days old: get this week’s` : 'Get this week’s list'} (1 AI check)</button>}
          <ModelMenu label={error ? 'Continue with another model' : news ? '↻ Update now with a model' : 'Pick the model'} primary={!!error} cannot={needsSearch} onPick={(m) => void make(m)} />
        </>
      )}
    </div>
  );
}
