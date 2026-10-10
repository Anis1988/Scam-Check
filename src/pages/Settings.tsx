import { useEffect, useState } from 'react';
import { api, setCode, type Status } from '../lib/api';
import { DEFAULT_SETTINGS, type AppSettings } from '../lib/types';
import { getAiMode, setAiMode } from '../lib/history';
import type { AiMode } from '../lib/types';
import { Card, Field, Toggle, toast } from '../components/ui';

const MODES: { id: AiMode; name: string; hint: string }[] = [
  { id: 'ask', name: 'Save credits (recommended)', hint: 'Photos and PDFs go to the AI automatically (it’s the only way to read them). Texts and emails only when you tap “Ask the AI”.' },
  { id: 'smart', name: 'Smart', hint: 'Also asks the AI by itself about texts and emails when the free checks aren’t sure.' },
  { id: 'always', name: 'Always', hint: 'Every check gets the AI’s opinion too (uses more of the daily AI limit).' },
  { id: 'never', name: 'Never', hint: 'Free checks only. Pictures and PDFs can’t be read without the AI, and no “Ask the AI” button.' },
];

export function Settings() {
  const [mode, setMode] = useState<AiMode>(getAiMode);
  const [st, setSt] = useState<Status | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => void api.status().then(setSt, (e) => setErr(e instanceof Error ? e.message : String(e))), []);
  // Server settings: automatic clean-up of ⭐ Saved.
  const [cfg, setCfg] = useState<AppSettings | null>(null);
  useEffect(() => void api.settings().then(setCfg, () => setCfg(DEFAULT_SETTINGS)), []);
  const saveCfg = async (next: AppSettings) => {
    const before = cfg;
    setCfg(next);
    try {
      const r = await api.saveSettings(next);
      toast('success', r.cleaned ? `Saved. ${r.cleaned} old saved check(s) cleaned up.` : 'Saved.');
    } catch (e) {
      setCfg(before);
      toast('error', e instanceof Error ? e.message : String(e));
    }
  };
  const choose = (m: AiMode) => (setMode(m), setAiMode(m));

  return (
    <div className="grid items-start gap-3 lg:grid-cols-2">
      <h1 className="text-2xl font-extrabold lg:col-span-2">Settings</h1>
      <Card title="AI check" subtitle="Saved on this device">
        <div className="space-y-2" role="radiogroup" aria-label="AI check">
          {MODES.map((m) => (
            <button key={m.id} role="radio" aria-checked={mode === m.id} onClick={() => choose(m.id)}
              className={`w-full rounded-xl border p-3 text-left transition ${mode === m.id ? 'border-teal-600 bg-teal-50' : 'border-stone-200 bg-white'}`}>
              <p className="text-sm font-medium">{mode === m.id ? '◉' : '○'} {m.name}</p>
              <p className="text-xs text-stone-500">{m.hint}</p>
            </button>
          ))}
        </div>
      </Card>
      <Card title="What’s set up" subtitle="On the server (Vercel)">
        {err && <p className="text-sm text-red-700">{err}</p>}
        {!st && !err && <p className="text-sm text-stone-500"><span className="spinner" /> Loading…</p>}
        {st && (
          <>
            <Field label="AI analysis" hint={!st.ai ? 'Add ANTHROPIC_API_KEY in Vercel to read pictures and get the AI’s opinion.' : !st.store ? 'Also needs the free Upstash Redis storage (Vercel → Storage), which keeps the daily limit.' : `Used today: ${st.used} of ${st.limit} (AI_DAILY_LIMIT). The same message checked again is free for 7 days.`}>
              <span className={`text-sm ${st.ai && st.store ? 'text-emerald-700' : 'text-amber-700'}`}>{st.ai && st.store ? '✓ On' : 'Off'}</span>
            </Field>
            <Field label="Google Safe Browsing" hint={st.safeBrowsing ? 'Links are checked against Google’s list of dangerous websites.' : 'Optional, free: add GOOGLE_SAFE_BROWSING_KEY in Vercel to check links against Google’s list of dangerous sites.'}>
              <span className={`text-sm ${st.safeBrowsing ? 'text-emerald-700' : 'text-stone-500'}`}>{st.safeBrowsing ? '✓ On' : 'Off'}</span>
            </Field>
            <Field label="Free checks" hint="Known scam patterns, look-alike websites, how new a website is, phone number type and country, email sender checks.">
              <span className="text-sm text-emerald-700">✓ Always on</span>
            </Field>
          </>
        )}
      </Card>
      <Card title="🧹 Automatic clean-up" subtitle="For ⭐ Saved, like the clean-up in your video app">
        {!cfg ? <p className="text-sm text-stone-500"><span className="spinner" /> Loading…</p> : (
          <>
            <Field label="Clean up old saved checks" hint="Runs by itself when you open ⭐ Saved (at most once an hour).">
              <Toggle on={cfg.cleanup.enabled} label="Clean up old saved checks" onChange={(v) => void saveCfg({ cleanup: { ...cfg.cleanup, enabled: v } })} />
            </Field>
            {cfg.cleanup.enabled && (
              <>
                <Field label="After">
                  <select className="input" value={cfg.cleanup.days} onChange={(e) => void saveCfg({ cleanup: { ...cfg.cleanup, days: Number(e.target.value) } })} aria-label="After how many days">
                    {[7, 30, 60, 90, 180, 365].map((d) => <option key={d} value={d}>{d === 365 ? '1 year' : `${d} days`}</option>)}
                  </select>
                </Field>
                <Field label="What to delete">
                  <select className="input" value={cfg.cleanup.what} onChange={(e) => void saveCfg({ cleanup: { ...cfg.cleanup, what: e.target.value as 'files' | 'all' } })} aria-label="What to delete">
                    <option value="files">Pictures and messages only (keep the facts)</option>
                    <option value="all">The whole saved check</option>
                  </select>
                </Field>
              </>
            )}
          </>
        )}
      </Card>
      <Card title="This device">
        <Field label="Access code" hint="Saved on this device only.">
          <button className="btn" onClick={() => (setCode(''), window.location.reload())}>Forget it</button>
        </Field>
      </Card>
    </div>
  );
}
