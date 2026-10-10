import { useEffect, useRef, useState } from 'react';
import { api, readUpload, waitForAi, type Upload } from '../lib/api';
import { getAiMode, saveToHistory } from '../lib/history';
import { KIND_LABEL, type CheckResult, type Kind } from '../lib/types';
import { ResultCard } from '../components/ResultCard';
import { toast } from '../components/ui';

const KINDS = Object.keys(KIND_LABEL) as Kind[];

/** Something shared to the app from the phone's Share menu (/share?text=…). */
function takeShare(): string {
  if (!window.location.pathname.startsWith('/share')) return '';
  const q = new URLSearchParams(window.location.search);
  window.history.replaceState(null, '', '/');
  return [q.get('title'), q.get('text'), q.get('url')].filter(Boolean).join('\n').slice(0, 20_000);
}

export function Check({ open }: { open?: CheckResult | null }) {
  const [shared] = useState(takeShare);
  const [kind, setKind] = useState<Kind>('text');
  const [text, setText] = useState(shared);
  const [from, setFrom] = useState('');
  const [file, setFile] = useState<Upload | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(open ?? null);
  const resultRef = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => setResult(open ?? null), [open]);
  // Opening a check from History that was still waiting for the AI: keep waiting.
  useEffect(() => {
    if (result?.ai === 'pending') void waitForAi(result, (r) => (setResult(r), saveToHistory(r)));
  }, [result?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = async (f: File | undefined) => {
    if (!f) return;
    try {
      // An email file (.eml) is read as text: its hidden sender details are checked for free.
      if (/\.eml$/i.test(f.name) || f.type === 'message/rfc822') {
        if (f.size > 2_000_000) throw new Error('This email file is too big (2 MB max).');
        setText(await f.text());
        setKind('email');
        setFile(null);
        return;
      }
      setFile(await readUpload(f));
      if (kind === 'email' || kind === 'text') setKind(f.type === 'application/pdf' ? 'bill' : 'screenshot');
    } catch (e) {
      toast('error', e instanceof Error ? e.message : String(e));
    }
  };

  const run = async () => {
    if (!text.trim() && !file) return toast('error', 'Paste the message or add a picture first.');
    setBusy(true);
    try {
      let r = await api.check({ kind, text, from, file: file ?? undefined, aiMode: getAiMode() });
      setResult(r);
      saveToHistory(r);
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
      if (r.ai === 'pending') {
        r = await waitForAi(r, (x) => setResult(x));
        saveToHistory(r);
      }
    } catch (e) {
      toast('error', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const reset = () => (setText(''), setFrom(''), setFile(null), setResult(null));
  const wantsFile = kind === 'bill' || kind === 'screenshot';

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <section className="card space-y-3">
        <div>
          <h1 className="text-2xl font-semibold">Is it a scam?</h1>
          <p className="text-sm text-slate-400">Paste it or add a picture. You get ✅ Looks safe, ⚠️ Suspicious or 🚨 Likely scam, with the reasons.</p>
        </div>
        <div className="grid grid-cols-4 gap-1.5" role="tablist" aria-label="What are you checking?">
          {KINDS.map((k) => (
            <button key={k} role="tab" aria-selected={kind === k} onClick={() => setKind(k)}
              className={`flex flex-col items-center gap-0.5 rounded-xl border px-1 py-2 text-xs transition ${kind === k ? 'border-emerald-300/60 bg-emerald-400/15 text-white' : 'border-white/10 bg-white/[0.03] text-slate-300'}`}>
              <span className="text-lg" aria-hidden="true">{KIND_LABEL[k].icon}</span>{KIND_LABEL[k].text}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-400">{KIND_LABEL[kind].hint}</p>

        {wantsFile && (
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary flex-1" onClick={() => fileInput.current?.click()}>📷 {kind === 'bill' ? 'Photo or PDF of the bill' : 'Choose a screenshot'}</button>
          </div>
        )}
        <input ref={fileInput} type="file" className="hidden" accept={kind === 'email' ? '.eml,message/rfc822' : 'image/*,application/pdf,.eml'} onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ''; }} />
        {file && (
          <div className="panel flex items-center gap-3">
            {file.preview ? <img src={file.preview} alt="" className="h-16 w-16 rounded-lg object-cover" /> : <span className="text-3xl" aria-hidden="true">📄</span>}
            <p className="min-w-0 flex-1 truncate text-sm">{file.name}</p>
            <button className="btn" onClick={() => setFile(null)} aria-label="Remove the file">✕</button>
          </div>
        )}

        <label className="block space-y-1">
          <span className="label">{wantsFile ? 'Or paste the words (optional, makes the free checks better)' : kind === 'email' ? 'The email' : 'The message'}</span>
          <textarea className="input min-h-[140px] w-full" value={text} onChange={(e) => setText(e.target.value)} maxLength={100_000}
            placeholder={kind === 'email' ? 'Paste the whole email here (with the sender and subject if you can)…' : kind === 'text' ? 'e.g. "USPS: your package is on hold, update your address at…"' : 'Optional'} />
        </label>
        {kind === 'email' && <button className="btn-ghost" onClick={() => fileInput.current?.click()}>📎 Upload an .eml file instead</button>}
        {kind === 'text' && (
          <label className="block space-y-1">
            <span className="label">From (optional)</span>
            <input className="input w-full" value={from} onChange={(e) => setFrom(e.target.value)} maxLength={60} placeholder="The number or name it came from, e.g. +1 876 555 0199" inputMode="tel" />
          </label>
        )}
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary flex-1" disabled={busy || (!text.trim() && !file)} onClick={() => void run()}>{busy ? <><span className="spinner" /> Checking…</> : '🛡️ Check it'}</button>
          {(text || file || result) && <button className="btn" disabled={busy} onClick={reset}>Clear</button>}
        </div>
        <p className="text-xs text-slate-500">Never open links or call numbers from a message you’re unsure about. This app only looks them up.</p>
      </section>
      <div ref={resultRef}>{result && <ResultCard r={result} />}</div>
    </div>
  );
}
