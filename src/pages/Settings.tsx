import { useEffect, useState, type ReactNode } from 'react';
import { api, setCode } from '../lib/api';
import { getPrefs, setPrefs, type DevicePrefs } from '../lib/history';
import { deleteAllChecks } from '../lib/batch';
import { PROVIDERS, modelFor, pickModel, providerOf, type AiMode, type AppSettings, type Effort, type ListEntry } from '../lib/types';
import { DEFAULT_ZIP, zipState } from '../lib/place';
import { refreshStatus, setStatusSettings, useStatus, useStatusError } from '../lib/useStatus';
import { Field, Fold, Rail, Shell, Toggle, openFold, toast, Slide } from '../components/ui';
import { APP_BUILD, installUpdate, latestApp } from '../components/AppUpdate';
import { getServer, isNative, setServer } from '../lib/native';

const MODES: { id: AiMode; name: string; hint: string }[] = [
  { id: 'ask', name: 'Save credits (recommended)', hint: 'Photos and PDFs go to the AI automatically (it’s the only way to read them). Texts and emails only when you tap “Ask the AI”.' },
  { id: 'smart', name: 'Smart', hint: 'Also asks the AI by itself about texts and emails when the free checks aren’t sure.' },
  { id: 'always', name: 'Always', hint: 'Every check gets the AI’s opinion too (uses more AI checks).' },
  { id: 'never', name: 'Never', hint: 'Free checks only. Pictures and PDFs can’t be read without the AI, and no “Ask the AI” button.' },
];
const SECTIONS = [['ai', '🤖 AI'], ['place', '📍 Your area'], ['checks', '🔎 Free checks'], ['pictures', '📷 Pictures'], ['saving', '⭐ Saving, bills & clean-up'], ['lists', '✅ Trusted & 🚫 Blocked'], ['device', '📱 This device']] as const;

/** 📍 Your ZIP code: saved when you leave the box or press Enter (5 digits). */
function ZipBox({ zip, onSave }: { zip: string; onSave: (z: string) => void }) {
  const [v, setV] = useState(zip);
  useEffect(() => setV(zip), [zip]);
  const commit = () => {
    const z = v.trim() || DEFAULT_ZIP;
    if (!/^\d{5}$/.test(z)) return (setV(zip), toast('error', 'A ZIP code is 5 digits, like 45245.'));
    setV(z);
    if (z !== zip) onSave(z);
  };
  return <input className="input w-28 text-center font-mono" inputMode="numeric" maxLength={5} value={v} aria-label="ZIP code" placeholder={DEFAULT_ZIP}
    onChange={(e) => setV(e.target.value.replace(/\D/g, ''))} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()} />;
}

/** A row of choices, one picked (like radio buttons). */
function Segmented<T extends string | number>({ value, options, onChange, label }: { value: T; options: { id: T; name: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <Slide className="flex flex-wrap gap-1 rounded-2xl border border-stone-200/80 bg-white/50 p-1" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.id)} type="button" role="radio" aria-checked={value === o.id} onClick={() => onChange(o.id)}
          className={`tap min-h-[44px] flex-1 rounded-xl px-3 text-sm font-semibold ${value === o.id ? 'text-teal-800' : 'text-stone-500 hover:text-stone-800'}`}>
          {o.name}
        </button>
      ))}
    </Slide>
  );
}

/** Every section folds, and starts closed (owner's choice): tap its title to open it. */
function Section({ id, title, subtitle, children }: { id: string; title: string; subtitle?: string; children: ReactNode }) {
  return <Fold id={id} title={title} subtitle={subtitle}>{children}</Fold>;
}

export function Settings() {
  const st = useStatus();
  const stErr = useStatusError();
  const [cfg, setCfg] = useState<AppSettings | null>(st?.settings ?? null);
  useEffect(() => { if (st && !cfg) setCfg(st.settings); }, [st, cfg]);
  const [prefs, setP] = useState<DevicePrefs>(getPrefs);
  const [limitText, setLimitText] = useState('');
  useEffect(() => { if (cfg) setLimitText(String(cfg.ai.dailyLimit)); }, [cfg?.ai.dailyLimit]); // eslint-disable-line react-hooks/exhaustive-deps
  const [otherModel, setOtherModel] = useState('');

  const save = async (next: AppSettings) => {
    const before = cfg;
    setCfg(next);
    try {
      const r = await api.saveSettings(next);
      setStatusSettings(next);
      toast('success', r.cleaned ? `Saved. ${r.cleaned} old saved check(s) cleaned up.` : 'Saved.');
    } catch (e) {
      setCfg(before);
      toast('error', e instanceof Error ? e.message : String(e));
    }
  };
  /** Changes one part of the settings and saves at once. */
  const set = <K extends keyof AppSettings>(k: K, p: Partial<AppSettings[K]>) => cfg && void save({ ...cfg, [k]: { ...cfg[k], ...p } });
  const reset = async () => {
    if (!window.confirm('Put every setting back to its starting value (the Vercel variables, or the defaults)?')) return;
    try {
      const r = await api.resetSettings();
      const { cleaned: _, ...s } = r;
      setCfg(s);
      setStatusSettings(s);
      toast('success', 'Back to the starting values.');
    } catch (e) {
      toast('error', e instanceof Error ? e.message : String(e));
    }
  };
  const device = (p: Partial<DevicePrefs>) => { const next = { ...getPrefs(), ...p }; setP(next); setPrefs(next); };
  // The ☀️/🌙 button at the top changes it too.
  useEffect(() => { const upd = () => setP(getPrefs()); window.addEventListener('sc-prefs', upd); return () => window.removeEventListener('sc-prefs', upd); }, []);
  const commitLimit = () => {
    if (!cfg) return;
    const n = Math.round(Number(limitText));
    if (!Number.isFinite(n) || n < 0 || n > 1000) return (setLimitText(String(cfg.ai.dailyLimit)), toast('error', 'Use a number from 0 to 1000.'));
    if (n !== cfg.ai.dailyLimit) set('ai', { dailyLimit: n });
  };

  const setupRail = (
    <Rail title="What’s set up">
      {!st && stErr ? (
        <div className="space-y-2">
          <p className="text-sm text-red-700">{stErr}</p>
          <button className="btn w-full" onClick={() => void refreshStatus()}>↻ Try again</button>
          {isNative() && <button className="btn w-full" onClick={() => { const v = window.prompt('The address you open Scam Check at in the browser (Vercel → Domains):', getServer()); if (v) { setServer(v); window.location.reload(); } }}>Change your site’s address</button>}
        </div>
      ) : !st ? <p className="text-sm text-stone-500"><span className="spinner" /> Loading…</p> : (
        <ul className="space-y-2 text-sm">
          {[
            ...PROVIDERS.map((p) => [`${p.name} key${p.paid ? '' : ' (free)'}`, st.providers?.[p.id]?.ready, `${p.env}${p.id === 'claude' ? ' in Vercel' : ' (optional)'}`] as const),
            ['Storage', st.store, 'Upstash Redis (Vercel → Storage)'],
            ['Google Safe Browsing key', st.safeBrowsing, 'GOOGLE_SAFE_BROWSING_KEY (optional, free)'],
            ['Free checks', true, 'Always on'],
          ].map(([name, ok, hint]) => (
            <li key={String(name)} className="flex gap-2">
              <span className={ok ? 'text-emerald-600' : 'text-stone-400'} aria-hidden="true">{ok ? '●' : '○'}</span>
              <span className="min-w-0"><span className="font-semibold text-stone-800">{name}</span><span className="block text-xs text-stone-500">{ok ? 'On' : 'Not set'} · {hint}</span></span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-stone-500">Keys stay in Vercel and are never shown here. Everything else is set on this page.</p>
    </Rail>
  );
  const nav = (
    <Rail title="Sections">
      <nav className="flex flex-col">
        {SECTIONS.map(([id, name]) => <a key={id} href={`#${id}`} onClick={(e) => { e.preventDefault(); openFold({ id }); setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30); }} className="rounded-lg px-2 py-1.5 text-sm font-semibold text-stone-600 hover:bg-white/80 hover:text-teal-800">{name}</a>)}
      </nav>
    </Rail>
  );

  return (
    <Shell left={nav} right={setupRail}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="label">Control panel</p>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-sm text-stone-500">Saved on the server: the same on your phone and computer. They win over the Vercel variables.</p>
        </div>
        {cfg && <button className="btn" onClick={() => void reset()}>↺ Starting values</button>}
      </div>
      <div className="flex gap-2">
        <button className="btn flex-1" onClick={() => openFold({ all: true })}>▾ Open all</button>
        <button className="btn flex-1" onClick={() => openFold({ all: false })}>▴ Close all</button>
      </div>
      <div className="lg:hidden"><Fold id="setup" title="🔌 What’s set up" subtitle="Your keys and storage">{setupRail}</Fold></div>
      {!cfg ? <p className="card text-sm text-stone-500">{stErr ? 'Settings can’t be loaded until the server answers (see above).' : <><span className="spinner" /> Loading…</>}</p> : (
        <>
          <Section id="ai" title="🤖 AI" subtitle={st ? `Used today: ${st.used}${st.limit !== null ? ` of ${st.limit}` : ''} (${st.model})` : ''}>
            <div className="space-y-1.5">
              <p className="label">AI model</p>
              <p className="text-xs text-stone-500">Tap the one you want. It checks everything that goes to the AI.</p>
              {PROVIDERS.map((pr) => {
                const chosen = modelFor(cfg.ai, pr.id);
                const list = pr.models.some((m) => m.id === chosen) ? pr.models : [...pr.models, { id: chosen, name: chosen, hint: 'Your own choice.', pictures: true, pdf: pr.id === 'claude' || pr.id === 'gemini' }];
                const up = st?.providers?.[pr.id]?.ready;
                return (
                  <div key={pr.id} className="space-y-1.5 pt-1">
                    <p className="text-sm font-semibold text-stone-800">{pr.name} · {pr.paid ? 'paid' : 'free'}</p>
                    <p className="text-xs text-stone-500">{pr.about}</p>
                    {st && !up && <p className="text-xs text-amber-800">Needs its key first: add <code>{pr.env}</code> in Vercel, then redeploy.</p>}
                    <div className="grid gap-2" role="radiogroup" aria-label={pr.name}>
                      {list.map((m) => {
                        const on = cfg.ai.provider === pr.id && chosen === m.id;
                        return (
                          <button key={m.id} role="radio" aria-checked={on} onClick={() => set('ai', pickModel(cfg.ai, pr.id, m.id))}
                            className={`tap flex items-center gap-3 rounded-xl border p-3 text-left ${on ? 'border-teal-500/70 bg-white shadow-[0_0_0_3px_rgb(var(--c-glow)/0.12)]' : 'border-stone-200/80 bg-white/50'}`}>
                            <span className="text-sm">{on ? '◉' : '○'}</span>
                            <span className="min-w-0"><span className="block text-sm font-semibold">{m.name}</span><span className="block text-xs text-stone-500">{m.hint}{!m.pictures ? ' 🚫📷' : ''}</span></span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              <details className="text-sm">
                <summary className="cursor-pointer text-xs font-semibold text-stone-500">A model that isn’t listed…</summary>
                <div className="mt-2 flex gap-2">
                  <input className="input min-w-0 flex-1 font-mono text-sm" value={otherModel} onChange={(e) => setOtherModel(e.target.value)} placeholder="e.g. gemini-2.5-pro, or a Groq/OpenRouter model" aria-label="Model name" />
                  <button className="btn" disabled={otherModel.trim().length < 3} onClick={() => { const v = otherModel.trim(); const p = (v.startsWith('claude-') ? 'claude' : v.startsWith('gemini-') ? 'gemini' : cfg.ai.provider === 'claude' || cfg.ai.provider === 'gemini' ? 'openrouter' : cfg.ai.provider); set('ai', pickModel(cfg.ai, p, v)); setOtherModel(''); }}>Use it</button>
                </div>
                <p className="mt-1 text-xs text-stone-500">Names starting with claude- go to Claude, gemini- to Gemini; any other name goes to the free AI picked above (or OpenRouter).</p>
              </details>
            </div>
            <div className="space-y-1.5">
              <p className="label">When to use it</p>
              <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="When to use the AI">
                {MODES.map((m) => (
                  <button key={m.id} role="radio" aria-checked={cfg.ai.mode === m.id} onClick={() => set('ai', { mode: m.id })}
                    className={`tap rounded-xl border p-3 text-left ${cfg.ai.mode === m.id ? 'border-teal-500/70 bg-white shadow-[0_0_0_3px_rgb(var(--c-glow)/0.12)]' : 'border-stone-200/80 bg-white/50'}`}>
                    <p className="text-sm font-semibold">{cfg.ai.mode === m.id ? '◉' : '○'} {m.name}</p>
                    <p className="text-xs text-stone-500">{m.hint}</p>
                  </button>
                ))}
              </div>
            </div>
            {cfg.ai.provider !== 'claude' ? (
              <Field label={`AI checks a day (${providerOf(cfg.ai.provider).name})`} hint="Stays under the free allowance. When they’re used up, you still get the free checks.">
                <select className="input" value={cfg.ai.provider === 'gemini' ? cfg.ai.geminiDailyLimit : cfg.ai.freeDailyLimit} onChange={(e) => set('ai', cfg.ai.provider === 'gemini' ? { geminiDailyLimit: Number(e.target.value) } : { freeDailyLimit: Number(e.target.value) })} aria-label="Free AI checks a day">
                  {[10, 25, 50, 100, 200].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </Field>
            ) : (
              <>
                <Field label="AI checks a day" hint={cfg.ai.unlimited ? 'Unlimited: every AI check is paid, with no daily stop.' : 'When they’re used up, you still get the free checks. They come back the next day.'}>
                  <div className="flex items-center gap-2">
                    {!cfg.ai.unlimited && (
                      <>
                        <button className="btn w-11 px-0" onClick={() => set('ai', { dailyLimit: Math.max(0, cfg.ai.dailyLimit - 1) })} aria-label="One less">−</button>
                        <input className="input w-20 text-center font-mono" inputMode="numeric" value={limitText} onChange={(e) => setLimitText(e.target.value.replace(/\D/g, ''))} onBlur={commitLimit} onKeyDown={(e) => e.key === 'Enter' && commitLimit()} aria-label="AI checks a day" />
                        <button className="btn w-11 px-0" onClick={() => set('ai', { dailyLimit: Math.min(1000, cfg.ai.dailyLimit + 1) })} aria-label="One more">+</button>
                      </>
                    )}
                  </div>
                </Field>
                <Field label="Unlimited" hint="No daily limit. Careful: every AI check costs a few cents.">
                  <Toggle on={cfg.ai.unlimited} label="Unlimited AI checks" onChange={(v) => (!v || window.confirm('Turn off the daily limit? Every AI check costs money.')) && set('ai', { unlimited: v })} />
                </Field>
                <div className="space-y-1.5">
                  <Field label="How hard it thinks" hint="Low is fast and cheapest, and enough for most messages. Higher can catch more, but is slower and costs more. (Haiku ignores this.)">{null}</Field>
                  <Segmented<Effort> label="How hard it thinks" value={cfg.ai.effort} onChange={(v) => set('ai', { effort: v })} options={[{ id: 'low', name: 'Low' }, { id: 'medium', name: 'Medium' }, { id: 'high', name: 'High' }]} />
                </div>
              </>
            )}
            <Field label="📋 Summary of safe ones" hint="What it is, the key info and what to do, for messages that look safe (comes with the AI check, or the Summarize button).">
              <Toggle on={cfg.ai.summaries} label="Summary of safe ones" onChange={(v) => set('ai', { summaries: v })} />
            </Field>
          </Section>

          <Section id="place" title="📍 Your area" subtitle={`ZIP code ${cfg.place?.zip ?? DEFAULT_ZIP}${zipState(cfg.place?.zip ?? DEFAULT_ZIP) ? ` · ${zipState(cfg.place?.zip ?? DEFAULT_ZIP)}` : ''}`}>
            <Field label="ZIP code" hint={`Look-ups find the branch near you, scam news adds ones going around your state, checks know what's local, and phone numbers say if they're from your state. Empty = ${DEFAULT_ZIP}.`}>
              <ZipBox zip={cfg.place?.zip ?? DEFAULT_ZIP} onSave={(zip) => set('place', { zip })} />
            </Field>
          </Section>

          <Section id="checks" title="🔎 Free checks" subtitle="Patterns, links, phone numbers and email senders are always checked, for free.">
            <Field label="Google Safe Browsing" hint={st?.safeBrowsing ? 'Checks links against Google’s list of dangerous sites.' : 'Needs a free GOOGLE_SAFE_BROWSING_KEY in Vercel first.'}>
              <Toggle on={cfg.checks.safeBrowsing && !!st?.safeBrowsing} label="Google Safe Browsing" onChange={(v) => st?.safeBrowsing ? set('checks', { safeBrowsing: v }) : toast('info', 'Add GOOGLE_SAFE_BROWSING_KEY in Vercel first.')} />
            </Field>
            <Field label="How new a website is" hint="Brand-new websites are a strong scam sign. Turn off for slightly faster checks.">
              <Toggle on={cfg.checks.websiteAge} label="How new a website is" onChange={(v) => set('checks', { websiteAge: v })} />
            </Field>
            <Field label="Remember results" hint="The same message checked again is answered at once and free (no AI credit).">
              <select className="input" value={cfg.checks.rememberDays} onChange={(e) => set('checks', { rememberDays: Number(e.target.value) })} aria-label="Remember results">
                {[1, 3, 7, 14, 30].map((d) => <option key={d} value={d}>{d === 1 ? '1 day' : `${d} days`}</option>)}
              </select>
            </Field>
          </Section>

          <Section id="pictures" title="📷 Pictures">
            <div className="space-y-1.5">
              <Field label="Picture size sent to the AI" hint="Pictures are made smaller on your phone first. Smaller = cheaper and faster; Sharp helps with tiny text.">{null}</Field>
              <Segmented<number> label="Picture size" value={cfg.pictures.maxSize} onChange={(v) => set('pictures', { maxSize: v })} options={[{ id: 1000, name: 'Small' }, { id: 1400, name: 'Standard' }, { id: 2000, name: 'Sharp' }]} />
            </div>
            <Field label="Pictures at once" hint="Each picture gets its own result and uses 1 AI check.">
              <select className="input" value={cfg.pictures.maxBatch} onChange={(e) => set('pictures', { maxBatch: Number(e.target.value) })} aria-label="Pictures at once">
                {[1, 3, 5, 10].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </Field>
          </Section>

          <Section id="saving" title="⭐ Saving, bills & clean-up">
            <Field label="Keep the original" hint="Ticked by default when you save: the message and the picture or PDF are kept, to see or download later.">
              <Toggle on={cfg.saving.keepOriginal} label="Keep the original by default" onChange={(v) => set('saving', { keepOriginal: v })} />
            </Field>
            <Field label="📅 Keep track of bills" hint="Safe bills the AI reads go to 🗂️ My checks → 📅 Bills, with their due date, and are compared with the same company’s last bill. Free (no extra AI check).">
              <Toggle on={cfg.bills.track} label="Keep track of bills" onChange={(v) => set('bills', { track: v })} />
            </Field>
            <Field label="🧹 Clean up old saved checks" hint="Runs by itself when you open ⭐ Saved (at most once an hour).">
              <Toggle on={cfg.cleanup.enabled} label="Clean up old saved checks" onChange={(v) => set('cleanup', { enabled: v })} />
            </Field>
            {cfg.cleanup.enabled && (
              <>
                <Field label="After">
                  <select className="input" value={cfg.cleanup.days} onChange={(e) => set('cleanup', { days: Number(e.target.value) })} aria-label="After how many days">
                    {[7, 30, 60, 90, 180, 365].map((d) => <option key={d} value={d}>{d === 365 ? '1 year' : `${d} days`}</option>)}
                  </select>
                </Field>
                <Field label="What to delete">
                  <select className="input max-w-full" value={cfg.cleanup.what} onChange={(e) => set('cleanup', { what: e.target.value as 'files' | 'all' })} aria-label="What to delete">
                    <option value="files">Pictures and messages only (keep the facts)</option>
                    <option value="all">The whole saved check</option>
                  </select>
                </Field>
              </>
            )}
          </Section>
        </>
      )}

      <ListsCard />

      <Section id="device" title="📱 This device" subtitle="Only on this phone or computer">
        {isNative() && (
          <>
            <Field label="App version" hint={`1.0.${APP_BUILD}. New versions are also offered at the top of the app when you open it.`}>
              <button className="btn" onClick={() => void latestApp().then((r) => {
                if (!r) toast('error', 'Could not reach the download page. Try again in a minute.');
                else if (r.build <= APP_BUILD) toast('success', 'You have the latest version.');
                else void installUpdate(r.url);
              }, () => toast('error', 'Could not reach the download page. Try again in a minute.'))}>Check for updates</button>
            </Field>
            <Field label="Your site’s address" hint={getServer()}>
              <button className="btn" onClick={() => { const v = window.prompt('The address you open Scam Check at (Vercel → Domains):', getServer()); if (v) { setServer(v); window.location.reload(); } }}>Change</button>
            </Field>
          </>
        )}
        <div className="space-y-1.5">
          <Field label="Look" hint="Also the ☀️/🌙 button at the top.">{null}</Field>
          <Segmented<DevicePrefs['theme']> label="Look" value={prefs.theme} onChange={(v) => device({ theme: v })} options={[{ id: 'light', name: '☀️ Light' }, { id: 'dark', name: '🌙 Dark' }]} />
        </div>
        <div className="space-y-1.5">
          <Field label="Text size">{null}</Field>
          <Segmented<DevicePrefs['textSize']> label="Text size" value={prefs.textSize} onChange={(v) => device({ textSize: v })} options={[{ id: 'normal', name: 'Normal' }, { id: 'large', name: 'Large' }]} />
        </div>
        <Field label="Clear History">
          <button className="btn" onClick={() => window.confirm('Delete all your checks? They’re removed from all your devices. ⭐ Saved checks stay.') && void deleteAllChecks().then(() => toast('success', 'History cleared.'), () => undefined)}>🗑 Delete all</button>
        </Field>
        <Field label="Access code" hint="Saved on this device only.">
          <button className="btn" onClick={() => (setCode(''), window.location.reload())}>Forget it</button>
        </Field>
        <Field label="Refresh" hint="Reload what’s set up and today’s AI use.">
          <button className="btn" onClick={() => void refreshStatus().then(() => toast('success', 'Up to date.'))}>↻ Refresh</button>
        </Field>
      </Section>
    </Shell>
  );
}

/** ✅ Trusted / 🚫 Blocked: phone numbers, email addresses and websites your checks always recognise. */
function ListsCard() {
  const [list, setList] = useState<ListEntry[] | null>(null);
  const [value, setValue] = useState('');
  const [which, setWhich] = useState<ListEntry['list']>('blocked');
  const [busy, setBusy] = useState(false);
  useEffect(() => void api.lists().then(setList, () => setList([])), []);
  const add = async () => {
    if (value.trim().length < 3) return;
    setBusy(true);
    try {
      const e = await api.listAdd(value.trim(), which);
      setList((l) => [e, ...(l ?? []).filter((x) => x.key !== e.key)]);
      setValue('');
      toast('success', `${e.value} added.`);
    } catch (e) {
      toast('error', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const remove = async (e: ListEntry) => {
    try {
      await api.listRemove(e.key);
      setList((l) => (l ?? []).filter((x) => x.key !== e.key));
    } catch (err) {
      toast('error', err instanceof Error ? err.message : String(err));
    }
  };
  const ICON = { phone: '📞', email: '✉️', domain: '🌐' } as const;
  const group = (w: ListEntry['list']) => (list ?? []).filter((e) => e.list === w);
  return (
    <Section id="lists" title="✅ Trusted & 🚫 Blocked" subtitle="Your checks always recognise these. Tip: tap ✓ Trust or 🚫 Block next to a number or website in a result.">
      <form className="space-y-2" onSubmit={(e) => (e.preventDefault(), void add())}>
        <input className="input w-full" value={value} onChange={(e) => setValue(e.target.value)} maxLength={200} placeholder="A phone number, email address or website" aria-label="Phone number, email address or website" autoCapitalize="off" spellCheck={false} />
        <div className="flex gap-2">
          <div className="flex-1"><Segmented<ListEntry['list']> label="Which list" value={which} onChange={setWhich} options={[{ id: 'trusted', name: '✓ Trusted' }, { id: 'blocked', name: '🚫 Blocked' }]} /></div>
          <button className="btn-primary" disabled={busy || value.trim().length < 3}>Add</button>
        </div>
      </form>
      {!list ? <p className="text-sm text-stone-500"><span className="spinner" /></p> : (['blocked', 'trusted'] as const).map((w) => (
        <div key={w} className="space-y-1">
          <p className="label">{w === 'blocked' ? '🚫 Blocked: always a likely scam' : '✓ Trusted: a little less risk (a strong warning still counts)'}</p>
          {!group(w).length ? <p className="text-xs text-stone-500">None yet.</p> : (
            <ul className="divide-y divide-stone-200/70 rounded-xl border border-stone-200/80 bg-white/60">
              {group(w).map((e) => (
                <li key={e.key} className="flex items-center gap-2 px-3 py-1.5">
                  <span aria-hidden="true">{ICON[e.kind]}</span>
                  <span className="min-w-0 flex-1 break-all font-mono text-sm">{e.value}</span>
                  <button className="btn min-h-[36px] px-3" onClick={() => void remove(e)} aria-label={`Remove ${e.value}`}>✕</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </Section>
  );
}
