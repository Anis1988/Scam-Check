import { useEffect, useRef, useState, type DragEvent } from 'react';
import { api, isAudio, readUpload, type CheckInput, type Upload } from '../lib/api';
import { readQr } from '../lib/qr';
import { openShared, sharedFiles, type SharedFile } from '../lib/share';
import { getInput } from '../lib/inputs';
import { loadHistory, saveToHistory } from '../lib/history';
import { askAgain, deleteChecks, newKey, patchItem, runBatch, setBatch, showOne, useBatch, type Item } from '../lib/batch';
import { KIND_LABEL, MODELS, money, type Bill, type CheckResult, type ModelChoice, type Kind, type Verdict } from '../lib/types';
import { aiLeft, useStatus } from '../lib/useStatus';
import { ResultCard } from '../components/ResultCard';
import { RecheckBar, needOf, stuck } from '../components/Recheck';
import { ModelMenu } from '../components/ModelMenu';
import { ScamNewsFold } from '../components/ScamNews';
import { SaveBox } from '../components/SaveBox';
import { Rail, ScoreRing, Shell, VerdictChip, toast, Slide, Skeleton, Empty } from '../components/ui';
import { dueText } from '../components/bills';

// No typing on Check (owner's choice): pictures, PDFs, email files and QR codes. Texts shared from other apps still work.
const KINDS: Kind[] = ['screenshot', 'bill', 'voicemail', 'email', 'qr'];
const MODE_NAME = { ask: 'Save credits', smart: 'Smart', always: 'Always', never: 'Never (free only)' } as const;
const TIPS = [
  'Real companies never ask for gift cards, crypto or a wire transfer.',
  'Never read a one-time code to someone who called or texted you.',
  'A link that “looks right” can still be fake: type the website yourself.',
  'Pressure (“in 30 minutes”, “today only”) is the #1 scam sign.',
  'Call back on the number on your card or a past bill, not the one in the message.',
];

/**
 * Something shared to the app from the phone's Share menu: /share?text=… (the website and the Android app), or
 * /share?files=a,b&mimes=x,y (pictures, PDFs or recordings the Android app copied into its own cache; videos go to 🎬 Video).
 */
function takeShare(): { text: string; files: SharedFile[] } {
  if (!window.location.pathname.startsWith('/share')) return { text: '', files: [] };
  const q = new URLSearchParams(window.location.search);
  window.history.replaceState(null, '', '/');
  return {
    text: [q.get('title'), q.get('text'), q.get('url')].filter(Boolean).join('\n').slice(0, 20_000),
    files: sharedFiles(q).filter((f) => !f.mime.startsWith('video/')),
  };
}

/** One thing being checked: its input (to ask the AI later) and its result. */
type FileItem = Upload & { key: string; qr?: string }; // qr: what a QR code in the picture says (read on the phone)
const isPdf = (f: { mime: string }) => f.mime === 'application/pdf';
const fileIcon = (f: { mime: string }) => (isAudio(f) ? '🎙️' : '📄');

export function Check() {
  const st = useStatus();
  const cfg = st?.settings;
  const maxBatch = cfg?.pictures.maxBatch ?? 10;
  const left = aiLeft(st);
  const [shared] = useState(takeShare);
  const [kind, setKind] = useState<Kind>(shared.text ? 'text' : 'screenshot');
  const [emlName, setEmlName] = useState('');
  const [text, setText] = useState(shared.text);
  const from = ''; // no typing on Check any more
  const [files, setFiles] = useState<FileItem[]>([]);
  // The running checks live outside this screen (lib/batch): switching tabs doesn't stop or forget them.
  const { items, busy, openKey } = useBatch();
  const setItems = (items: Item[]) => setBatch({ items });
  const setOpenKey = (openKey: string) => setBatch({ openKey });
  const [over, setOver] = useState(false);
  const depth = useRef(0);
  const resultRef = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [recent, setRecent] = useState(() => loadHistory().slice(0, 5));
  useEffect(() => {
    const upd = () => setRecent(loadHistory().slice(0, 5));
    window.addEventListener('sc-history', upd);
    return () => window.removeEventListener('sc-history', upd);
  }, []);
  // Pictures, PDFs or recordings shared from another app (Android app): added like picked files, then checked at once.
  const autoRun = useRef(false);
  useEffect(() => {
    if (!shared.files.length) return;
    void (async () => {
      const got: File[] = [];
      for (const f of shared.files) {
        const file = await openShared(f).catch(() => null);
        if (file) got.push(file);
      }
      if (got.length < shared.files.length) toast('error', `${shared.files.length - got.length === 1 ? 'A shared file' : 'Some shared files'} could not be opened. Add ${got.length ? 'it' : 'them'} with the button instead.`);
      autoRun.current = got.length > 0;
      await addFiles(got);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!autoRun.current || !files.length || busy) return;
    autoRun.current = false;
    void run();
  }, [files]); // eslint-disable-line react-hooks/exhaustive-deps
  const patch = patchItem;

  // A file dropped outside the drop area must not make the browser open it (and leave the app).
  useEffect(() => {
    const stop = (e: Event) => e.preventDefault();
    window.addEventListener('dragover', stop);
    window.addEventListener('drop', stop);
    return () => { window.removeEventListener('dragover', stop); window.removeEventListener('drop', stop); };
  }, []);

  /** Pictures and PDFs from the file picker, drag & drop or paste (several at once, up to the limit in Settings). */
  const addFiles = async (list: File[]) => {
    if (!list.length) return;
    const eml = list.find((f) => /\.eml$/i.test(f.name) || f.type === 'message/rfc822');
    if (eml) {
      // An email file (.eml) is read as text: its hidden sender details are checked for free.
      if (eml.size > 2_000_000) return toast('error', 'This email file is too big (2 MB max).');
      setText(await eml.text());
      setEmlName(eml.name);
      setKind('email');
      list = list.filter((f) => f !== eml);
      if (!list.length) return;
    }
    const room = maxBatch - files.length;
    if (room <= 0) return toast('error', `Up to ${maxBatch} pictures at once (Settings → Pictures).`);
    if (list.length > room) toast('info', `Only the first ${room} were added (up to ${maxBatch} at once).`);
    const added: FileItem[] = [];
    for (const f of list.slice(0, room)) {
      try {
        const up = await readUpload(f, cfg?.pictures.maxSize ?? 1400);
        if ('cut' in up && up.cut) toast('info', `${f.name}: only the first 3 minutes are checked.`);
        // Every picture is also looked at for a QR code (free, on the phone).
        const qr = up.preview ? await readQr(up.preview).catch(() => '') : '';
        if (kind === 'qr' && !qr) { toast('error', `No QR code found in ${f.name}. Try a closer, sharper photo.`); continue; }
        added.push({ ...up, key: newKey(), qr: qr || undefined });
      } catch (e) {
        toast('error', `${f.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    if (!added.length) return;
    setFiles((x) => [...x, ...added]);
    if (added.every(isAudio)) setKind('voicemail');
    else if (kind === 'email' || kind === 'text' || kind === 'voicemail') setKind(added.every((f) => f.qr) ? 'qr' : added.every(isPdf) ? 'bill' : 'screenshot');
  };

  // A screenshot pasted anywhere on Check (Ctrl+V) is added like a picked file.
  const addRef = useRef(addFiles);
  addRef.current = addFiles;
  useEffect(() => {
    const h = (e: ClipboardEvent) => {
      const pics = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/') || f.type === 'application/pdf' || isAudio(f));
      if (pics.length) (e.preventDefault(), void addRef.current(pics));
    };
    window.addEventListener('paste', h);
    return () => window.removeEventListener('paste', h);
  }, []);

  const onDrag = (e: DragEvent, kindOf: 'enter' | 'leave') => {
    if (![...e.dataTransfer.types].some((t) => t === 'Files' || t === 'text/plain')) return;
    e.preventDefault();
    depth.current += kindOf === 'enter' ? 1 : -1;
    setOver(depth.current > 0);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    depth.current = 0;
    setOver(false);
    const dropped = [...e.dataTransfer.files];
    if (dropped.length) return void addFiles(dropped);
    const t = e.dataTransfer.getData('text/plain');
    if (t) setText((x) => (x ? `${x}\n${t}` : t).slice(0, 100_000));
  };

  const run = async () => {
    if (!text.trim() && !files.length) return toast('error', 'Paste the message or add a picture first.');
    const aiMode = cfg?.ai.mode ?? 'ask';
    // A QR code found in a picture: its link is checked too.
    const qrLine = (f?: FileItem) => (f?.qr ? `\nQR code in this picture: ${f.qr}` : '');
    // QR codes: only what they say is checked (free); the photo itself isn't sent anywhere.
    // One picture goes with the words; several pictures are each checked on their own (and the words too, if any).
    const inputs: CheckInput[] = kind === 'qr'
      ? files.filter((f) => f.qr).map((f) => ({ kind: 'qr' as Kind, text: f.qr, aiMode }))
      : files.length <= 1
      ? [{ kind: files[0] && isAudio(files[0]) ? 'voicemail' : kind, text: `${text}${qrLine(files[0])}`.trim(), from, file: files[0], aiMode }]
      : [
          ...files.map((f) => ({ kind: (isAudio(f) ? 'voicemail' : isPdf(f) || kind === 'bill' ? 'bill' : 'screenshot') as Kind, text: qrLine(f).trim() || undefined, file: f, aiMode })),
          ...(text.trim() ? [{ kind: (kind === 'email' ? 'email' : 'text') as Kind, text, from, aiMode }] : []),
        ];
    if (!inputs.length) return toast('error', 'Add a photo of a QR code first.');
    setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
    // All at once: the server finishes each one even if you switch tabs or close the app.
    await runBatch(inputs);
  };

  /** "Ask the AI" / "Summarize" (only when you tap it), or ↻ Re-check with the AI picked in Settings: 1 AI check. */
  const askAi = async (it: Item, fresh = false, model?: ModelChoice) => {
    const note = await askAgain(it.key, fresh, model);
    if (note) toast('info', note);
  };

  const saveAll = async () => {
    const keep = cfg?.saving.keepOriginal ?? true;
    let n = 0;
    for (const it of items) {
      if (!it.result || it.result.ai === 'pending' || it.savedName) continue;
      try {
        const s = await api.save(it.result.id, '', keep ? { text: it.input?.text, file: it.input?.file } : undefined);
        patch(it.key, { savedName: s.name ?? 'Saved' });
        n++;
      } catch (e) {
        toast('error', e instanceof Error ? e.message : String(e));
        break;
      }
    }
    if (n) toast('success', `${n} saved. Find them in ⭐ Saved.`);
  };

  /** A check from the Recent list: shown again here. */
  /** After ✓ Trust / 🚫 Block: the result is shown again with your lists. */
  const reload = (it: Item) => it.result && void api.result(it.result.id).then((x) => (patch(it.key, { result: x }), saveToHistory(x)), () => undefined);

  /** 📅 The next bills (side panel). */
  const [bills, setBills] = useState<Bill[]>([]);
  useEffect(() => { if (st?.store) void api.bills().then(setBills, () => undefined); }, [st?.store, items.length]);
  const nextBills = bills.filter((b) => !b.paid && b.dueDate && new Date(`${b.dueDate}T23:59:59`).getTime() > Date.now() - 7 * 86400_000).sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 3);

  const reopen = (r: CheckResult) => {
    void getInput(r.id).then((input) => showOne(r, input ?? undefined));
    setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  };

  const reset = () => (setText(''), setEmlName(''), setFiles([]), setItems([]), kind === 'text' && setKind('screenshot'));
  const done = items.filter((x) => x.result && x.result.ai !== 'pending');
  const counts = (['safe', 'suspicious', 'scam'] as Verdict[]).map((v) => [v, done.filter((x) => !x.result!.unchecked && x.result!.verdict === v).length] as const);

  const offers = (it: Item) => {
    const r = it.result;
    if (!r || r.ai === 'pending' || !it.input) return null;
    return (
      <>
        {r.aiOffer && (
          <div className="card space-y-2">
            <p className="text-sm text-stone-600">The free checks aren’t sure about this one. Want a second opinion?</p>
            <button className="btn-primary w-full" disabled={left === 0} onClick={() => void askAi(it)}>
              🤖 Ask the AI {left !== null ? `(uses 1 of ${left} left today)` : ''}
            </button>
            {left === 0 && <p className="text-xs text-amber-700">No AI checks left today. They come back tomorrow.</p>}
          </div>
        )}
        {r.briefOffer && (
          <div className="card space-y-2">
            <p className="text-sm text-stone-600">Looks safe. Want a short summary: what it is, the key info and what to do?</p>
            <button className="btn w-full border-teal-500/60 text-teal-800" disabled={left === 0} onClick={() => void askAi(it)}>
              📋 Summarize {left !== null ? `(uses 1 of ${left} AI checks left today)` : '(uses 1 AI check)'}
            </button>
            {left === 0 && <p className="text-xs text-amber-700">No AI checks left today. They come back tomorrow.</p>}
          </div>
        )}
      </>
    );
  };

  /** 🗑 Gone from the screen, History and the server (a ⭐ saved copy stays). */
  const removeCheck = (r: CheckResult) => {
    if (!window.confirm(`Delete this check (${r.title || KIND_LABEL[r.kind].text})? It’s removed from all your devices. A ⭐ saved copy stays.`)) return;
    void deleteChecks([r.id]).then(() => toast('success', 'Deleted.'), (e) => toast('error', e instanceof Error ? e.message : String(e)));
  };
  const recheckBar = (it: Item) => it.result && <RecheckBar r={it.result} canRecheck={!!it.input} need={needOf(it.input?.file)} onRecheck={(m) => void askAi(it, true, m)} />;
  // The AI failed or hit today's limit on these: they can all go to another model at once.
  const stuckOnes = items.filter((x) => x.result && x.input && stuck(x.result));
  const full = (it: Item) => (
    <div className="space-y-3">
      {it.result && stuck(it.result) && recheckBar(it)}
      {it.result && <ResultCard r={it.result} onChanged={() => reload(it)} />}
      {offers(it)}
      {it.result && !stuck(it.result) && recheckBar(it)}
      {it.result && it.result.ai !== 'pending' && <SaveBox key={`${it.result.id}${it.savedName ?? ''}`} id={it.result.id} text={it.input?.text} file={it.input?.file} savedName={it.savedName} onSaved={(n) => patch(it.key, { savedName: n })} />}
      {it.result && it.result.ai !== 'pending' && <button className="btn w-full" onClick={() => removeCheck(it.result!)}>🗑 Delete this check</button>}
    </div>
  );

  const leftRail = (
    <>
      <Rail title="AI today">
        {!st ? <p className="text-sm text-stone-500"><span className="spinner" /></p> : !st.ai || !st.store ? <p className="text-sm text-stone-600">Off: free checks only. See Settings.</p> : (
          <>
            <p className="font-display text-3xl font-bold text-stone-900">{left === null ? '∞' : left}<span className="ml-1 text-sm font-medium text-stone-500">{left === null ? 'unlimited' : `of ${st.limit} left`}</span></p>
            {st.limit !== null && <div className="h-1.5 overflow-hidden rounded-full bg-stone-200"><div className="h-full rounded-full bg-gradient-to-r from-teal-500 to-iris-500" style={{ width: `${Math.min(100, (100 * (left ?? 0)) / Math.max(1, st.limit))}%` }} /></div>}
            <p className="hud">{MODELS.find((m) => m.id === st.model)?.name ?? st.model}</p>
            <p className="hud">Mode · {MODE_NAME[cfg?.ai.mode ?? 'ask']}</p>
          </>
        )}
      </Rail>
      {nextBills.length > 0 && (
        <Rail title="📅 Next bills">
          <ul className="space-y-1.5 text-sm">
            {nextBills.map((b) => <li key={b.key}><span className="flex justify-between gap-2"><span className="truncate font-semibold text-stone-800">{b.company}</span><span className="num">{money(b.amount)}</span></span><span className="hud !text-[10px]">{dueText(b.dueDate)}</span></li>)}
          </ul>
          <p className="text-xs text-stone-500">All bills: ⭐ Saved → 📅 Bills</p>
        </Rail>
      )}
      <Rail title="How it works">
        <ol className="space-y-1.5 text-sm text-stone-600">
          <li><span className="num text-teal-700">01</span> Paste it, or drop pictures</li>
          <li><span className="num text-teal-700">02</span> Free checks answer at once</li>
          <li><span className="num text-teal-700">03</span> Pictures are read by the AI</li>
        </ol>
      </Rail>
    </>
  );
  const rightRail = (
    <>
      <Rail title="Recent">
        {!recent.length ? <p className="text-sm text-stone-500">Nothing checked yet.</p> : (
          <ul className="space-y-1">
            {recent.map((r) => (
              <li key={r.id} className="flex items-start gap-1">
                <button className="tap min-w-0 flex-1 rounded-lg px-1.5 py-1.5 text-left hover:bg-white/80" onClick={() => reopen(r)}>
                  <VerdictChip verdict={r.verdict} unchecked={r.unchecked} />
                  <span className="mt-0.5 block truncate text-xs text-stone-700">{r.title || r.preview || KIND_LABEL[r.kind].text}</span>
                </button>
                <button className="rounded-lg px-1.5 py-1.5 text-xs text-stone-400 hover:text-red-700" onClick={() => removeCheck(r)} aria-label={`Delete ${r.title || KIND_LABEL[r.kind].text}`}>🗑</button>
              </li>
            ))}
          </ul>
        )}
      </Rail>
      <Rail title="Tip">
        <p className="text-sm text-stone-700">{TIPS[new Date().getDate() % TIPS.length]}</p>
      </Rail>
    </>
  );

  return (
    <div onDragEnter={(e) => onDrag(e, 'enter')} onDragLeave={(e) => onDrag(e, 'leave')} onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      {over && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-mist/70 p-6 backdrop-blur-sm">
          <div className="dropzone max-w-md py-12" data-over="true">
            <p className="text-4xl" aria-hidden="true">📥</p>
            <p className="font-display text-xl font-semibold text-teal-900">Drop to check</p>
            <p className="text-sm text-stone-600">Pictures, PDFs, recordings or an .eml email, up to {maxBatch} at once</p>
          </div>
        </div>
      )}
      <Shell left={leftRail} right={rightRail}>
        <section className="card space-y-3">
          <div>
            <p className="label">New check</p>
            <h1 className="text-2xl font-bold">Is it a scam?</h1>
            <p className="text-sm text-stone-500">Add screenshots, photos or PDFs of bills, a voicemail, an email file or a QR code. Each one gets ✅ Looks safe, ⚠️ Suspicious or 🚨 Likely scam, with the reasons.</p>
          </div>
          <Slide className="grid grid-cols-5 gap-1.5" role="tablist" aria-label="What are you checking?">
            {KINDS.map((k) => (
              <button key={k} role="tab" aria-selected={kind === k} onClick={() => setKind(k)}
                className={`tap flex min-h-[60px] min-w-0 flex-col items-center justify-center gap-1 rounded-xl border px-0 py-2.5 text-[10.5px] font-semibold leading-tight tracking-tight sm:text-xs ${kind === k ? 'border-transparent text-teal-900' : 'border-stone-200/80 bg-white/40 text-stone-600 hover:bg-white/70'}`}>
                <span className={`text-lg transition-transform duration-500 ${kind === k ? 'scale-110' : ''}`} aria-hidden="true">{KIND_LABEL[k].icon}</span>{KIND_LABEL[k].text}
              </button>
            ))}
          </Slide>
          <p className="text-xs text-stone-500">{KIND_LABEL[kind].hint}</p>

          <input ref={fileInput} type="file" multiple className="hidden" accept={kind === 'email' ? '.eml,message/rfc822' : kind === 'qr' ? 'image/*' : kind === 'voicemail' ? 'audio/*,.m4a,.amr,.3gp,.opus' : 'image/*,application/pdf,.eml,audio/*'} onChange={(e) => { void addFiles([...(e.target.files ?? [])]); e.target.value = ''; }} />
          <button type="button" className="dropzone tap" onClick={() => fileInput.current?.click()}>
            <span className="text-3xl" aria-hidden="true">{kind === 'bill' ? '🧾' : kind === 'qr' ? '🔳' : kind === 'email' ? '📧' : kind === 'voicemail' ? '🎙️' : '📷'}</span>
            <span className="font-display font-semibold text-teal-900">{kind === 'bill' ? 'Add photos or PDFs of bills' : kind === 'qr' ? 'Take or choose photos of QR codes' : kind === 'email' ? 'Add the email file (.eml)' : kind === 'voicemail' ? 'Add a voicemail or call recording' : 'Add screenshots'}</span>
            <span className="text-xs text-stone-500">{kind === 'email' ? 'In Gmail: ⋮ → Download message. In Outlook: Save as. Then tap here or drag it in.' : kind === 'voicemail' ? 'From your phone: open the voicemail → Share or Save, then add it here · up to 3 minutes each' : `Tap to choose, or drag & drop here · up to ${maxBatch} at once · each gets its own result`}</span>
          </button>
          {files.length > 0 && (
            <div>
              <p className="hud mb-1.5">{files.length} file{files.length > 1 ? 's' : ''}{files.length > 1 ? ' · each checked on its own' : ''}</p>
              <ul className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                {files.map((f) => (
                  <li key={f.key} className={`relative aspect-square overflow-hidden rounded-xl border border-white bg-white/70 shadow-[0_0_0_1px_rgb(var(--c-ink)/0.08)] ${busy ? 'scan' : ''}`}>
                    {f.qr && <span className="absolute bottom-1 left-1 rounded-md bg-stone-900/65 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur">🔳 QR</span>}
                    {f.preview ? <img src={f.preview} alt={f.name} className="h-full w-full object-cover" /> : <span className="flex h-full flex-col items-center justify-center gap-1 p-1 text-center"><span className="text-2xl" aria-hidden="true">{fileIcon(f)}</span><span className="w-full truncate text-[10px] text-stone-600">{f.name}</span></span>}
                    {!busy && <button className="absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-full bg-stone-900/60 text-sm text-white backdrop-blur" onClick={() => setFiles((x) => x.filter((y) => y.key !== f.key))} aria-label={`Remove ${f.name}`}>✕</button>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {kind === 'qr' && files.length > 0 && (
            <ul className="space-y-1">{files.map((f) => <li key={f.key} className="panel break-all py-2 font-mono text-xs text-stone-700">🔳 {f.qr}</li>)}</ul>
          )}
          {text.trim() && (
            <div className="panel space-y-1">
              <div className="flex items-center justify-between gap-2">
                <p className="label">{emlName ? `📧 ${emlName}` : '📩 Shared with Scam Check'}</p>
                <button className="btn-ghost" onClick={() => (setText(''), setEmlName(''), kind === 'text' && setKind('screenshot'))} aria-label="Remove it">✕</button>
              </div>
              {!emlName && <p className="max-h-40 overflow-auto whitespace-pre-wrap break-words text-sm text-stone-700">{text}</p>}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary flex-1" disabled={busy || !text.trim() && !files.length} onClick={() => void run()}>
              {busy ? <><span className="spinner" /> Checking…</> : files.length > 1 ? `🛡️ Check all ${files.length + (text.trim() ? 1 : 0)}` : '🛡️ Check it'}
            </button>
            {(text || files.length > 0 || items.length > 0) && <button className="btn" disabled={busy} onClick={reset}>Clear</button>}
          </div>
          <p className="text-xs text-stone-500">Never open links or call numbers from a message you’re unsure about. This app only looks them up.</p>
          {st?.ai && st.store && <p className="hud xl:hidden">🤖 AI checks left today: <b className="text-stone-800">{left === null ? 'unlimited' : `${left} of ${st.limit}`}</b> · free checks unlimited</p>}
        </section>

        <ScamNewsFold />

        <div ref={resultRef} className="scroll-mt-28 space-y-3">
          {!items.length && (
            <Empty icon="🛡️" title="Your results will show here." className="hidden border-dashed lg:block">Paste a message or drop pictures above, then tap Check it.</Empty>
          )}
          {items.length === 1 && (items[0].result ? full(items[0]) : items[0].error ? <p className="card text-sm text-red-700">{items[0].error}</p> : <div className="card scan space-y-3 text-sm text-teal-800"><p><span className="spinner" /> Checking…</p><Skeleton ring /></div>)}
          {items.length > 1 && (
            <>
              <div className="card flex flex-wrap items-center gap-x-3 gap-y-2">
                <div className="min-w-0 flex-1">
                  <p className="label">Results</p>
                  <p className="font-display text-lg font-semibold">{done.length} of {items.length} checked{busy ? '…' : ''}</p>
                  <p className="flex flex-wrap gap-1.5 pt-1">{counts.filter(([, n]) => n).map(([v, n]) => <VerdictChip key={v} verdict={v} extra={String(n)} />)}</p>
                </div>
                {!busy && done.length > 0 && <button className="btn" onClick={() => void saveAll()} disabled={done.every((x) => x.savedName)}>⭐ Save all</button>}
                {!busy && stuckOnes.length > 0 && (
                  <div className="w-full space-y-1.5 border-t border-stone-200/70 pt-2">
                    <p className="text-sm text-amber-800">⚠️ The AI couldn’t check {stuckOnes.length === 1 ? '1 of them' : `${stuckOnes.length} of them`}{stuckOnes[0].result!.aiTried ? ` (${stuckOnes[0].result!.aiTried})` : ''}.</p>
                    <ModelMenu label={`Continue ${stuckOnes.length === 1 ? 'it' : `all ${stuckOnes.length}`} with another model`} primary
                      need={(['pdf', 'audio', 'pictures'] as const).find((n) => stuckOnes.some((x) => needOf(x.input?.file) === n))}
                      tried={stuckOnes[0].result!.aiTried} onPick={(m) => stuckOnes.forEach((x) => void askAi(x, true, m))} />
                  </div>
                )}
              </div>
              <ul className="space-y-2">
                {items.map((it, i) => {
                  const r = it.result;
                  const f = it.input?.file;
                  const open = openKey === it.key;
                  return (
                    <li key={it.key} className="rise" style={{ animationDelay: `${i * 40}ms` }}>
                      <button className="card flex w-full items-center gap-3 text-left transition hover:shadow-[0_0_0_1px_rgb(var(--c-glow)/0.35),0_10px_30px_-12px_rgb(var(--c-glow)/0.45)]" onClick={() => setOpenKey(open ? '' : it.key)} aria-expanded={open} disabled={!r}>
                        <span className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-white bg-white/70 ${!r || r.ai === 'pending' ? 'scan' : ''}`}>
                          {f?.preview ? <img src={f.preview} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center text-2xl" aria-hidden="true">{f ? fileIcon(f) : KIND_LABEL[it.input?.kind ?? 'text'].icon}</span>}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs text-stone-500">{f?.name ?? 'The words you pasted'}</span>
                          {it.error ? <span className="block text-sm text-red-700">{it.error}</span>
                            : !r ? <span className="hud">{it.waiting ? 'Waiting…' : 'Checking…'}</span>
                            : <>
                                <VerdictChip verdict={r.verdict} unchecked={r.unchecked && r.ai !== 'pending'} extra={r.ai === 'pending' ? 'AI reading…' : undefined} />
                                <span className="mt-0.5 block truncate text-sm font-medium text-stone-900">{r.brief?.whatItIs || r.title || r.summary}</span>
                                {r.ai === 'done' && r.aiBy && <span className="hud block truncate !text-[10px]">🤖 {r.aiBy}</span>}
                                {stuck(r) && <span className="block truncate text-xs font-semibold text-amber-700">⚠️ {r.ai === 'limit' ? 'Limit reached' : r.ai === 'off' ? 'No AI set up' : 'The AI failed'}: tap to pick another model</span>}
                                {it.savedName && <span className="block truncate font-mono text-xs text-emerald-700">⭐ {it.savedName}</span>}
                              </>}
                        </span>
                        {r && !r.unchecked && <ScoreRing score={r.score} verdict={r.verdict} size={46} muted={r.ai === 'pending'} />}
                        {r && <span className="text-stone-400" aria-hidden="true">{open ? '−' : '+'}</span>}
                      </button>
                      {open && r && <div className="mt-2 border-l-2 border-teal-400/40 pl-3">{full(it)}</div>}
                    </li>
                  );
                })}
              </ul>
              <p className="text-xs text-stone-500">Tap a result to see why, what to do, and to save it.</p>
            </>
          )}
        </div>
      </Shell>
    </div>
  );
}

