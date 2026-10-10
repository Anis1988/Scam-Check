import { useState } from 'react';
import { api } from '../lib/api';
import { saveToHistory } from '../lib/history';
import type { CheckResult, CompanyInfo } from '../lib/types';
import { refreshStatus, useStatus } from '../lib/useStatus';
import { CheckedBy, ResultCard } from '../components/ResultCard';
import { Rail, Shell, toast } from '../components/ui';

const DOT = { bad: 'text-red-600', warn: 'text-amber-600', good: 'text-emerald-600', info: 'text-stone-400' } as const;
const RECENT = 'sc.companies';
const loadRecent = (): string[] => { try { return JSON.parse(localStorage.getItem(RECENT) ?? '[]') as string[]; } catch { return []; } };

/** A company's real contact details: what they do, website, customer service phone and email, with sources. */
export function CompanyCard({ c, example = false, onRefresh }: { c: CompanyInfo; example?: boolean; onRefresh?: () => void }) {
  const when = new Date(c.checkedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const t = example ? -1 : 0;
  return (
    <article className="card rise space-y-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CheckedBy ai="done" aiBy={c.aiBy ? `${c.aiBy} + Google Search` : undefined} />
        {c.remembered && <span className="hud !text-[10px]">📌 From {when} (free)</span>}
      </div>
      <div>
        <h2 className="text-xl font-bold">{c.name}</h2>
        <p className="text-stone-700">{c.whatTheyDo}</p>
      </div>
      <dl className="divide-y divide-stone-200/70 rounded-xl border border-stone-200/80 bg-white/60">
        {c.website && (
          <div className="px-3 py-2">
            <dt className="label">🌐 Website</dt>
            <dd><a className="break-all font-semibold text-teal-700 underline" href={c.website.url} target="_blank" rel="noopener noreferrer" tabIndex={t}>{c.website.domain}</a>
              <span className="block text-xs text-stone-500"><span className={DOT[c.website.level]} aria-hidden="true">●</span> {c.website.note}</span></dd>
          </div>
        )}
        {c.phones.map((p) => (
          <div key={p.number} className="px-3 py-2">
            <dt className="label">📞 {p.label}</dt>
            <dd><a className="num font-semibold text-stone-900" href={`tel:${p.number.replace(/[^\d+]/g, '')}`} tabIndex={t}>{p.number}</a>
              {p.note && <span className="block text-xs text-stone-500"><span className={DOT[p.level ?? 'info']} aria-hidden="true">●</span> {p.note}</span>}</dd>
          </div>
        ))}
        {c.emails.map((e) => (
          <div key={e.email} className="px-3 py-2">
            <dt className="label">✉️ {e.label}</dt>
            <dd><a className="break-all font-semibold text-stone-900" href={`mailto:${e.email}`} tabIndex={t}>{e.email}</a></dd>
          </div>
        ))}
        {c.contactPage && (
          <div className="px-3 py-2">
            <dt className="label">💬 Contact page</dt>
            <dd><a className="break-all text-teal-700 underline" href={c.contactPage} target="_blank" rel="noopener noreferrer" tabIndex={t}>{c.contactPage.replace(/^https?:\/\/(www\.)?/, '')}</a></dd>
          </div>
        )}
        {c.hours && <div className="px-3 py-2"><dt className="label">🕘 Hours</dt><dd>{c.hours}</dd></div>}
        {c.address && <div className="px-3 py-2"><dt className="label">📮 Address</dt><dd>{c.address}</dd></div>}
      </dl>
      {!c.phones.length && !c.emails.length && <p className="text-stone-600">No phone number or email was found on reliable pages. Use the contact page on their website.</p>}
      {c.scamWarning && <p className="panel text-stone-700">🛡️ {c.scamWarning}</p>}
      {c.note && <p className="break-words text-xs text-stone-500">{c.note}</p>}
      {c.sources.length > 0 && (
        <div className="space-y-1">
          <p className="label">Sources (Google Search)</p>
          <ul className="space-y-0.5">{c.sources.map((s) => <li key={s.url} className="truncate text-xs"><a className="text-teal-700 underline" href={s.url} target="_blank" rel="noopener noreferrer" tabIndex={t}>{s.title || s.url}</a></li>)}</ul>
        </div>
      )}
      <p className="text-xs text-stone-500">Found by a live search: best is to also check the number on your card, bill or the company’s app.</p>
      {onRefresh && c.remembered && <button className="btn w-full" onClick={onRefresh}>↻ Search again (uses 1 Gemini check)</button>}
    </article>
  );
}

/** 🏢 Look up: a company's contact details, or just a link, phone number or email address. */
export function Lookup() {
  const st = useStatus();
  const ready = st?.providers?.gemini?.ready;
  const [name, setName] = useState('');
  const [company, setCompany] = useState<CompanyInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState(loadRecent);
  const findCompany = async (n: string, fresh = false) => {
    if (n.trim().length < 2) return;
    setBusy(true);
    try {
      const c = await api.company(n.trim(), fresh);
      setCompany(c);
      const next = [c.name, ...recent.filter((x) => x.toLowerCase() !== c.name.toLowerCase())].slice(0, 8);
      setRecent(next);
      try { localStorage.setItem(RECENT, JSON.stringify(next)); } catch { /* full */ }
    } catch (e) {
      toast('error', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      void refreshStatus();
    }
  };

  // ⚡ Quick look-up (moved here from Check): free checks only, never the AI.
  const [look, setLook] = useState('');
  const [looking, setLooking] = useState(false);
  const [found, setFound] = useState<CheckResult | null>(null);
  const lookup = async () => {
    if (look.trim().length < 3) return;
    setLooking(true);
    try {
      const r = await api.lookup(look.trim());
      setFound(r);
      saveToHistory(r);
    } catch (e) {
      toast('error', e instanceof Error ? e.message : String(e));
    } finally {
      setLooking(false);
    }
  };

  return (
    <Shell right={
      <Rail title="Recent companies">
        {!recent.length ? <p className="text-sm text-stone-500">None yet.</p> : (
          <ul className="space-y-1">{recent.map((n) => <li key={n}><button className="w-full rounded-lg px-1.5 py-1.5 text-left text-sm font-semibold text-stone-700 hover:bg-white/80" onClick={() => (setName(n), void findCompany(n))}>{n}</button></li>)}</ul>
        )}
      </Rail>
    }>
      <form className="card space-y-3" onSubmit={(e) => (e.preventDefault(), void findCompany(name))}>
        <div>
          <p className="label">Company</p>
          <h1 className="text-2xl font-bold">How do I reach them?</h1>
          <p className="text-sm text-stone-500">Type a company name: what they do, their real website, customer service phone and email, from a live Google search with sources.</p>
        </div>
        {st && !ready && <p className="panel text-sm text-amber-800">This needs Gemini (free): add <code>GEMINI_API_KEY</code> in Vercel, then redeploy.</p>}
        <div className="flex gap-2">
          <input className="input min-w-0 flex-1" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="e.g. Duke Energy, Chase, Amazon" aria-label="Company name" />
          <button className="btn-primary" disabled={busy || !ready || name.trim().length < 2}>{busy ? <span className="spinner" /> : 'Find'}</button>
        </div>
        {recent.length > 0 && <div className="-mx-1 flex flex-wrap gap-1.5 lg:hidden">{recent.slice(0, 5).map((n) => <button type="button" key={n} className="chip border-stone-200 bg-white/70 text-stone-700" onClick={() => (setName(n), void findCompany(n))}>{n}</button>)}</div>}
      </form>
      {busy && <p className="card scan text-sm text-teal-800"><span className="spinner" /> Searching the web…</p>}
      {company && !busy && <CompanyCard key={company.checkedAt} c={company} onRefresh={() => void findCompany(company.name, true)} />}

      <form className="card space-y-2" onSubmit={(e) => (e.preventDefault(), void lookup())}>
        <div>
          <p className="label">⚡ Quick look-up</p>
          <p className="text-sm text-stone-500">Just a link, phone number or email address: is it real, how new, what kind of number? Free, never opened.</p>
        </div>
        <div className="flex gap-2">
          <input className="input min-w-0 flex-1" value={look} onChange={(e) => setLook(e.target.value)} maxLength={500} placeholder="usps-help.top · +1 876… · a@b.com" autoComplete="off" autoCapitalize="off" spellCheck={false} aria-label="Link, phone number or email" />
          <button className="btn" disabled={looking || look.trim().length < 3}>{looking ? <span className="spinner" /> : 'Look up'}</button>
        </div>
      </form>
      {found && <ResultCard r={found} onChanged={() => void api.result(found.id).then(setFound, () => undefined)} />}
    </Shell>
  );
}
