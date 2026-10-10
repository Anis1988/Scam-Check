import { useState } from 'react';
import type { DocResult, SeoLevel } from '../lib/types';
import { CheckedBy } from './ResultCard';
import { Fold, toast } from './ui';

const LEVEL: Record<SeoLevel, { icon: string; text: string; cls: string }> = {
  high: { icon: '🔴', text: 'Important', cls: 'border-red-200 bg-red-50 text-red-800' },
  medium: { icon: '🟠', text: 'Worth fixing', cls: 'border-amber-200 bg-amber-50 text-amber-800' },
  low: { icon: '⚪', text: 'Small', cls: 'border-stone-200 bg-stone-100 text-stone-700' },
};
/** Overall: the free checks (60%) and, when the AI ran, the content (40%). */
export const seoOverall = (r: DocResult) => {
  const s = r.seo!;
  return s.content?.summary ? Math.round(0.6 * s.score + 0.4 * s.content.score) : s.score;
};
const tone = (n: number) => (n >= 80 ? 'from-emerald-500 to-teal-500' : n >= 50 ? 'from-amber-400 to-amber-600' : 'from-red-500 to-red-600');

/** 🌐 A website's SEO report: score, fix-first, issues, meta tags, headings, content, keywords, competitor gaps; PDF. */
export function SeoView({ r, example = false }: { r: DocResult; example?: boolean }) {
  const s = r.seo!;
  const [busy, setBusy] = useState(false);
  const overall = seoOverall(r);
  const pdf = async () => {
    if (example) return;
    setBusy(true);
    try {
      await (await import('../lib/seoReport')).downloadSeoPdf(r);
    } catch (e) {
      toast('error', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const row = (k: string, v?: string | boolean, ok?: boolean) => (
    <div className="flex gap-2 py-1">
      <span className={`w-3 shrink-0 text-center font-bold ${ok === false ? 'text-amber-600' : 'text-emerald-600'}`} aria-hidden="true">{ok === false ? '!' : '✓'}</span>
      <span className="min-w-0"><span className="text-stone-500">{k}</span> <span className="break-words text-stone-900">{v === true ? 'yes' : v === false || !v ? 'missing' : v}</span></span>
    </div>
  );
  return (
    <div className="space-y-3 text-sm">
      {r.aiBy && <CheckedBy ai="done" aiBy={`${r.aiBy} + web search`} />}
      <div className="flex items-center gap-3">
        <p className="font-display text-4xl font-bold text-stone-900">{overall}<span className="text-base font-medium text-stone-500">/100</span></p>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="h-2 overflow-hidden rounded-full bg-stone-200"><div className={`h-full rounded-full bg-gradient-to-r ${tone(overall)}`} style={{ width: `${overall}%` }} /></div>
          <p className="hud !text-[10px]">Technical {s.score}{s.content?.summary ? ` · content ${s.content.score}` : ''} · {s.stats.words} words · {(s.fetchedMs / 1000).toFixed(1)} s</p>
        </div>
      </div>
      {r.summary && <p className="text-stone-800">{r.summary}</p>}
      <button className="btn-primary w-full" disabled={busy} onClick={() => void pdf()}>{busy ? <><span className="spinner" /> Making the PDF…</> : '⬇ Download the PDF report'}</button>

      {s.topFixes && s.topFixes.length > 0 && (
        <div className="space-y-1">
          <p className="label">Fix these first</p>
          <ol className="list-decimal space-y-1 pl-5 text-stone-800">{s.topFixes.map((f, i) => <li key={i}>{f}</li>)}</ol>
        </div>
      )}

      <Fold label="Issues found (free checks)" subtitle={`${s.issues.length} · ${s.issues.filter((i) => i.level === 'high').length} important`} defaultOpen={example || !s.topFixes?.length}>
        {!s.issues.length ? <p>✅ No technical issues found.</p> : (
          <ul className="space-y-2">{s.issues.map((i, n) => (
            <li key={n}>
              <span className={`chip ${LEVEL[i.level].cls}`}>{LEVEL[i.level].icon} {LEVEL[i.level].text}</span>
              <p className="mt-0.5 font-semibold text-stone-900">{i.what}</p>
              <p className="text-stone-600">👉 {i.fix}</p>
            </li>
          ))}</ul>
        )}
      </Fold>

      <Fold label="Meta tags" subtitle={s.meta.title ? `“${s.meta.title.slice(0, 50)}${s.meta.title.length > 50 ? '…' : ''}”` : 'No title'}>
        <div className="divide-y divide-stone-200/70">
          {row(`Title (${s.meta.title.length})`, s.meta.title, s.meta.title.length >= 30 && s.meta.title.length <= 60)}
          {row(`Description (${s.meta.description.length})`, s.meta.description, s.meta.description.length >= 70 && s.meta.description.length <= 160)}
          {row('Canonical', s.meta.canonical, !!s.meta.canonical)}
          {row('Robots', s.meta.robots ?? 'index (default)', !/noindex/i.test(s.meta.robots ?? ''))}
          {row('Phone-ready', s.meta.viewport, s.meta.viewport)}
          {row('Language', s.meta.lang, !!s.meta.lang)}
          {row('Social title / image', s.meta.ogTitle && s.meta.ogImage ? 'yes' : undefined, !!(s.meta.ogTitle && s.meta.ogImage))}
          {row('Structured data', s.meta.schema.join(', '), s.meta.schema.length > 0)}
          {row('https', s.stats.https, s.stats.https)}
          {row('robots.txt / sitemap', `${s.stats.robotsTxt ? 'yes' : 'no'} / ${s.stats.sitemap ? 'yes' : 'no'}`, s.stats.robotsTxt && s.stats.sitemap)}
          {row('Images without alt text', `${s.stats.imagesNoAlt} of ${s.stats.images}`, !s.stats.imagesNoAlt)}
        </div>
      </Fold>

      <Fold label="Headings" subtitle={`${s.headings.filter((h) => h.level === 1).length} H1 · ${s.headings.filter((h) => h.level === 2).length} H2 · ${s.headings.filter((h) => h.level === 3).length} H3`}>
        {!s.headings.length ? <p>No headings found.</p> : (
          <ul className="space-y-0.5">{s.headings.slice(0, 40).map((h, i) => (
            <li key={i} className="flex gap-2" style={{ paddingLeft: (h.level - 1) * 14 }}><span className="num shrink-0 text-xs text-teal-700">H{h.level}</span><span className="min-w-0 break-words text-stone-800">{h.text}</span></li>
          ))}</ul>
        )}
      </Fold>

      {s.content?.summary && (
        <Fold label="Content quality" subtitle={`${s.content.score}/100`}>
          <p className="text-stone-800">{s.content.summary}</p>
          <ul className="space-y-1">
            {s.content.strengths.map((x, i) => <li key={`s${i}`} className="flex gap-2"><span className="text-emerald-600" aria-hidden="true">+</span>{x}</li>)}
            {s.content.weaknesses.map((x, i) => <li key={`w${i}`} className="flex gap-2"><span className="text-amber-600" aria-hidden="true">−</span>{x}</li>)}
          </ul>
        </Fold>
      )}
      {s.keywords && s.keywords.length > 0 && (
        <Fold label="Keyword opportunities" subtitle={s.keywords.slice(0, 3).map((k) => k.keyword).join(' · ')}>
          <ul className="space-y-2">{s.keywords.map((k, i) => (
            <li key={i}><p className="font-semibold text-stone-900">🔑 {k.keyword}</p><p className="text-stone-600">{k.why} <span className="text-teal-800">→ {k.where}</span></p></li>
          ))}</ul>
        </Fold>
      )}
      {((s.gaps && s.gaps.length > 0) || (s.competitors && s.competitors.length > 0)) && (
        <Fold label="Competitor gaps" subtitle={(s.competitors ?? []).map((c) => c.site).join(' · ')}>
          {s.competitors && s.competitors.length > 0 && <ul className="space-y-1">{s.competitors.map((c, i) => <li key={i}><b className="text-stone-900">{c.site}</b> <span className="text-stone-600">{c.note}</span></li>)}</ul>}
          {s.gaps && s.gaps.length > 0 && <ul className="space-y-2">{s.gaps.map((g, i) => <li key={i}><p className="font-semibold text-stone-900">{g.gap}</p><p className="text-teal-800">👉 {g.action}</p></li>)}</ul>}
        </Fold>
      )}
      {r.note && <p className="break-words text-xs text-stone-500">{r.note}</p>}
      <p className="text-xs text-stone-500">Only the page you typed was read (as text, by the server). Rankings change: check again after your fixes.</p>
    </div>
  );
}
