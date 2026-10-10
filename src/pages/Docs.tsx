import { useEffect, useRef, useState, useSyncExternalStore, type DragEvent } from 'react';
import { api } from '../lib/api';
import { DOC_ACCEPT, docId, readDoc, type DocInput } from '../lib/docs';
import { ModelMenu, type Need } from '../components/ModelMenu';
import { modelName, providerOf, type DocLevel, type DocResult, type ModelChoice } from '../lib/types';
import { refreshStatus, useStatus } from '../lib/useStatus';
import { CheckedBy } from '../components/ResultCard';
import { Fold, Rail, Shell, toast } from '../components/ui';

/**
 * 📄 Docs: understand any document (summary, key points, red flags, to-dos, dates), or compare two versions.
 * The list is the same on every device (server); running ones are picked up even after leaving the tab.
 */
const KEY = 'sc.docs';
let list: DocResult[] = (() => { try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') as DocResult[]; } catch { return []; } })();
const subs = new Set<() => void>();
/** How to read a document again with another model (kept while the app is open: the document isn't kept anywhere). */
const retries = new Map<string, { need?: Need; run: (m: ModelChoice) => void }>();
function setList(next: DocResult[]) {
  list = next.slice(0, 50);
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* full */ }
  subs.forEach((f) => f());
}
const put = (r: DocResult) => setList([r, ...list.filter((x) => x.id !== r.id)]);
const useDocs = () => useSyncExternalStore((f) => (subs.add(f), () => void subs.delete(f)), () => list);

/** 🔄 The list as the server has it (the same on the phone and the computer). */
async function syncDocs() {
  const r = await api.docs().catch(() => null);
  if (!r?.synced) return;
  const known = new Set(r.docs.map((d) => d.id));
  const mine = list.filter((d) => !known.has(d.id) && d.status === 'pending' && retries.has(d.id));
  const next = [...mine, ...r.docs];
  if (JSON.stringify(next) !== JSON.stringify(list)) setList(next);
}

const needOf = (docs: DocInput[]): Need | undefined => (docs.some((d) => d.pdf) ? 'pdf' : docs.some((d) => d.images) ? 'pictures' : undefined);

async function analyze(mode: 'analyze' | 'compare', docs: DocInput[], model?: ModelChoice) {
  const id = await docId(mode, docs);
  const label = docs.map((d) => d.name).join(' → ');
  retries.set(id, { need: needOf(docs), run: (m) => void analyze(mode, docs, m) });
  put({ id, status: 'pending', mode, label, checkedAt: new Date().toISOString() });
  try {
    put(await api.doc({ id, mode, docs, model, fresh: !!model || undefined }));
  } catch (e) {
    // The connection dropped while the server works: it is picked up later (see the polling below).
    const r = await api.docResult(id).catch(() => null);
    put(r && r.status !== 'pending' ? r : { id, status: 'failed', mode, label, checkedAt: new Date().toISOString(), error: e instanceof Error ? e.message : String(e) });
  } finally {
    void refreshStatus();
  }
}

async function removeDoc(r: DocResult) {
  if (!window.confirm(`Delete “${r.title || r.label}”?`)) return;
  setList(list.filter((x) => x.id !== r.id));
  retries.delete(r.id);
  await api.deleteDoc(r.id).then(() => toast('success', 'Deleted.'), () => toast('success', 'Deleted from this device.'));
}

const FLAG: Record<DocLevel, { icon: string; text: string; cls: string }> = {
  high: { icon: '🔴', text: 'Serious', cls: 'border-red-200 bg-red-50 text-red-800' },
  medium: { icon: '🟠', text: 'Watch out', cls: 'border-amber-200 bg-amber-50 text-amber-800' },
  low: { icon: '⚪', text: 'Minor', cls: 'border-stone-200 bg-stone-100 text-stone-700' },
};
const IMPACT = { better: { icon: '🟢', text: 'Better for you' }, worse: { icon: '🔴', text: 'Worse for you' }, neutral: { icon: '⚪', text: 'Neutral' } } as const;

/** One document's answer. */
export function DocCard({ r, example = false }: { r: DocResult; example?: boolean }) {
  const when = new Date(r.checkedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const retry = retries.get(r.id);
  const flags = r.redFlags ?? [];
  const head = (
    <>
      <span className="flex flex-wrap items-center gap-1.5">
        {r.status === 'pending' ? <span className="chip border-teal-200 bg-teal-50 text-teal-800"><span className="spinner" /> Reading…</span>
          : r.status === 'failed' ? <span className="chip border-amber-200 bg-amber-50 text-amber-800">⚠️ Not done</span>
          : <span className="chip border-teal-200 bg-teal-50 text-teal-800">{r.mode === 'compare' ? '🔀 Compared' : '📄'} {r.docType || 'Document'}</span>}
        {r.status === 'done' && flags.length > 0 && <span className={`chip ${FLAG[flags[0].level].cls}`}>{FLAG[flags[0].level].icon} {flags.length} red flag{flags.length > 1 ? 's' : ''}</span>}
        {r.status === 'done' && !flags.length && <span className="chip border-emerald-200 bg-emerald-50 text-emerald-800">✅ No red flags</span>}
      </span>
      <span className="mt-1 block truncate text-sm font-semibold text-stone-900">{r.title || r.label}</span>
      <span className="hud block truncate !text-[10px]">{r.label} · {when}{r.remembered ? ' · 📌 remembered (free)' : ''}</span>
    </>
  );
  return (
    <Fold title={head} defaultOpen={example || r.status !== 'done'} className={r.status === 'pending' ? 'scan' : ''}>
      {r.status === 'pending' && <p className="text-xs text-stone-500">Long documents can take a minute. You can switch tabs or close the app: the answer will be here.</p>}
      {r.status === 'failed' && <p className="break-words text-sm text-amber-800">{r.error}</p>}
      {r.status === 'failed' && retry && !example && <ModelMenu label="⚠️ It failed: try another model" primary need={retry.need} tried={r.tried} onPick={retry.run} />}
      {r.status === 'failed' && !retry && <p className="text-xs text-stone-500">To try again, add the document again.</p>}
      {r.status === 'done' && (
        <div className="space-y-3 text-sm">
          <CheckedBy ai="done" aiBy={r.aiBy} />
          {r.summary && <p className="text-stone-800">{r.summary}</p>}
          {r.changes && r.changes.length > 0 && (
            <div className="space-y-1.5">
              <p className="label">What changed</p>
              <ul className="space-y-2">{r.changes.map((c, i) => (
                <li key={i} className="rounded-xl border border-stone-200/80 bg-white/60 p-2.5">
                  <p className="font-semibold text-stone-900"><span aria-hidden="true">{IMPACT[c.impact].icon}</span> {c.what} <span className="sr-only">({IMPACT[c.impact].text})</span></p>
                  {c.before && <p className="text-stone-500"><span className="label !text-[9.5px]">Before</span> {c.before}</p>}
                  {c.after && <p className="text-stone-800"><span className="label !text-[9.5px]">Now</span> {c.after}</p>}
                </li>
              ))}</ul>
            </div>
          )}
          {r.keyPoints && r.keyPoints.length > 0 && (
            <div className="space-y-1">
              <p className="label">Key points</p>
              <ul className="list-disc space-y-1 pl-5 text-stone-800">{r.keyPoints.map((k, i) => <li key={i}>{k}</li>)}</ul>
            </div>
          )}
          {flags.length > 0 && (
            <div className="space-y-1.5">
              <p className="label">Red flags</p>
              <ul className="space-y-2">{flags.map((f, i) => (
                <li key={i} className="rounded-xl border border-stone-200/80 bg-white/60 p-2.5">
                  <span className={`chip ${FLAG[f.level].cls}`}>{FLAG[f.level].icon} {FLAG[f.level].text}</span>
                  <p className="mt-1 font-semibold text-stone-900">{f.issue}</p>
                  <p className="text-stone-600">{f.why}</p>
                  {f.quote && <p className="mt-1 border-l-2 border-stone-300 pl-2 text-xs italic text-stone-500">“{f.quote}”</p>}
                </li>
              ))}</ul>
            </div>
          )}
          {r.actions && r.actions.length > 0 && (
            <div className="space-y-1">
              <p className="label">What to do</p>
              <ul className="space-y-1">{r.actions.map((a, i) => <li key={i} className="flex gap-2"><span aria-hidden="true">☐</span><span>{a.task}{a.when && <b className="ml-1 text-teal-800">· {a.when}</b>}</span></li>)}</ul>
            </div>
          )}
          {r.dates && r.dates.length > 0 && (
            <div className="space-y-1">
              <p className="label">Dates</p>
              <ul className="space-y-0.5">{r.dates.map((d, i) => <li key={i} className="flex justify-between gap-3"><span className="text-stone-700">{d.what}</span><span className="num shrink-0 text-stone-900">{d.when}</span></li>)}</ul>
            </div>
          )}
          {r.note && <p className="break-words text-xs text-stone-500">{r.note}</p>}
          <p className="text-xs text-stone-500">An AI can miss things: for anything important (signing, paying, legal), ask a professional.</p>
          {retry && !example && <ModelMenu label="↻ Read again with another model" need={retry.need} onPick={retry.run} />}
        </div>
      )}
      {!example && r.status !== 'pending' && <button className="btn w-full" onClick={() => void removeDoc(r)}>🗑 Delete</button>}
    </Fold>
  );
}

/** Where a document is dropped or picked. */
function DocDrop({ label, hint, picked, onFiles, disabled }: { label: string; hint: string; picked?: string; onFiles: (f: File[]) => void; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const onDrop = (e: DragEvent) => { e.preventDefault(); setOver(false); if (e.dataTransfer.files.length) onFiles([...e.dataTransfer.files]); };
  return (
    <div onDragOver={(e) => (e.preventDefault(), setOver(true))} onDragLeave={() => setOver(false)} onDrop={onDrop}>
      <input ref={input} type="file" multiple accept={DOC_ACCEPT} className="hidden" onChange={(e) => { onFiles([...(e.target.files ?? [])]); e.target.value = ''; }} />
      <button type="button" className="dropzone" data-over={over} disabled={disabled} onClick={() => input.current?.click()}>
        <span className="text-3xl" aria-hidden="true">{picked ? '✅' : '📄'}</span>
        <span className="font-display font-semibold text-teal-900">{picked ? <span className="break-all">{picked}</span> : label}</span>
        <span className="text-xs text-stone-500">{picked ? 'Tap to pick another one' : hint}</span>
      </button>
    </div>
  );
}

export function Docs() {
  const st = useStatus();
  const docs = useDocs();
  const [mode, setMode] = useState<'analyze' | 'compare'>('analyze');
  const [reading, setReading] = useState(false);
  const [pair, setPair] = useState<[DocInput | null, DocInput | null]>([null, null]);
  const [pick, setPick] = useState<ModelChoice | undefined>();
  const p = pick?.provider ?? st?.settings.ai.provider ?? 'claude';
  const u = st?.providers?.[p];
  const ready = !!u?.ready;
  const left = u && u.limit !== null ? Math.max(0, u.limit - u.used) : null;

  useEffect(() => {
    void syncDocs();
    const back = () => document.visibilityState === 'visible' && void syncDocs();
    document.addEventListener('visibilitychange', back);
    window.addEventListener('focus', back);
    return () => { document.removeEventListener('visibilitychange', back); window.removeEventListener('focus', back); };
  }, []);
  // Ones still being read on the server (you switched tabs or closed the app): their answers are picked up here.
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const waiting = list.filter((r) => r.status === 'pending' && !retries.has(r.id));
      for (const r of waiting) {
        const x = await api.docResult(r.id).catch(() => null);
        if (x && x.status !== 'pending') put(x);
        else if (!x && Date.now() - Date.parse(r.checkedAt) > 10 * 60_000) put({ ...r, status: 'failed', error: 'It didn’t finish. Add the document again.' });
      }
      return waiting.length > 0;
    };
    void (async () => { while (alive && (await tick())) await new Promise((ok) => setTimeout(ok, 6000)); })();
    return () => { alive = false; };
  }, [docs.length]);

  const read = async (files: File[]): Promise<DocInput | null> => {
    if (!files.length) return null;
    setReading(true);
    try {
      return await readDoc(files);
    } catch (e) {
      toast('error', e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setReading(false);
    }
  };
  const one = async (files: File[]) => {
    const d = await read(files);
    if (d) void analyze('analyze', [d], pick);
  };
  const setSide = async (i: 0 | 1, files: File[]) => {
    const d = await read(files);
    if (d) setPair((x) => (i === 0 ? [d, x[1]] : [x[0], d]));
  };
  const compare = () => {
    if (!pair[0] || !pair[1]) return;
    if (pair[0].pdf && pair[1].pdf) return toast('error', 'Both PDFs are scanned (pictures only): take photos of the pages of one of them instead.');
    void analyze('compare', [pair[0], pair[1]], pick);
    setPair([null, null]);
  };

  return (
    <Shell right={
      <Rail title="How it works">
        <ol className="space-y-1.5 text-sm text-stone-600">
          <li><span className="num text-teal-700">01</span> Add a PDF, Word file, text file or photos of the pages</li>
          <li><span className="num text-teal-700">02</span> Its words are read on your device; the AI from Settings explains it</li>
          <li><span className="num text-teal-700">03</span> Summary, key points, red flags, what to do and the dates</li>
        </ol>
        <p className="text-xs text-stone-500">Only the answer is kept, never the document.</p>
      </Rail>
    }>
      <section className="card space-y-3">
        <div>
          <p className="label">Documents</p>
          <h1 className="text-2xl font-bold">What does this document say?</h1>
          <p className="text-sm text-stone-500">Contracts, leases, insurance, letters, terms… You get a short summary, the key points, red flags, what to do and the dates. Or compare two versions to see what changed.</p>
        </div>
        <div className="grid grid-cols-2 gap-1.5" role="tablist" aria-label="What do you want to do?">
          {([['analyze', '📖 Read one'], ['compare', '🔀 Compare two']] as const).map(([m, name]) => (
            <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)}
              className={`min-h-[44px] rounded-xl border text-sm font-semibold transition ${mode === m ? 'border-teal-500/70 bg-white text-teal-900 shadow-[0_0_0_3px_rgba(74,146,155,0.12)]' : 'border-stone-200/80 bg-white/50 text-stone-600'}`}>{name}</button>
          ))}
        </div>
        {st && <p className="hud">🤖 {pick ? modelName(pick.provider, pick.id) : st.model}{left !== null && ready ? ` · uses 1 of ${left} checks left today` : ''}</p>}
        {st && (!ready || left === 0) && (
          <div className="panel space-y-2 text-sm text-amber-800">
            <p>{!ready ? <>{providerOf(p).name} isn’t set up (<code>{providerOf(p).env}</code> in Vercel).</> : `Today’s ${providerOf(p).name} checks are used up.`} Pick another model to continue:</p>
            <ModelMenu label="🤖 Use another model" primary onPick={setPick} />
          </div>
        )}
        {pick && <button type="button" className="btn-ghost text-xs" onClick={() => setPick(undefined)}>✕ Back to the Settings model</button>}
        {reading && <p className="panel scan text-sm text-teal-800"><span className="spinner" /> Reading the file on your device…</p>}
        {mode === 'analyze' ? (
          <DocDrop label="Add a document" hint="PDF, Word (.docx), text, or up to 6 photos of the pages · drag & drop works too" onFiles={(f) => void one(f)} disabled={!ready || left === 0 || reading} />
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-2">
              <DocDrop label="1. The old version" hint="PDF, Word, text or photos" picked={pair[0]?.name} onFiles={(f) => void setSide(0, f)} disabled={reading} />
              <DocDrop label="2. The new version" hint="PDF, Word, text or photos" picked={pair[1]?.name} onFiles={(f) => void setSide(1, f)} disabled={reading} />
            </div>
            <button className="btn-primary w-full" disabled={!pair[0] || !pair[1] || !ready || left === 0} onClick={compare}>🔀 Compare (1 AI check)</button>
          </>
        )}
        <p className="text-xs text-stone-500">Long documents: about the first 40 pages are read. Old .doc or .xls files: save them as PDF first. Only the answer is kept (on your phone and computer), never the document.</p>
      </section>
      {docs.length > 0 && <p className="label">Your documents</p>}
      <div className="space-y-2">{docs.map((r) => <DocCard key={`${r.id}${r.status}`} r={r} />)}</div>
    </Shell>
  );
}
