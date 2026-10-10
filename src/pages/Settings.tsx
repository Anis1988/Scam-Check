import { useEffect, useState } from 'react';
import { api, setCode, type Status } from '../lib/api';
import { getAiMode, setAiMode } from '../lib/history';
import type { AiMode } from '../lib/types';
import { Card, Field } from '../components/ui';

const MODES: { id: AiMode; name: string; hint: string }[] = [
  { id: 'smart', name: 'Smart (recommended)', hint: 'The AI looks only when the free checks aren’t already sure it’s a scam, and always for pictures and PDFs.' },
  { id: 'always', name: 'Always', hint: 'Every check gets the AI’s opinion too (uses more of the daily AI limit).' },
  { id: 'never', name: 'Never', hint: 'Free checks only. Pictures and PDFs can’t be read without the AI.' },
];

export function Settings() {
  const [mode, setMode] = useState<AiMode>(getAiMode);
  const [st, setSt] = useState<Status | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => void api.status().then(setSt, (e) => setErr(e instanceof Error ? e.message : String(e))), []);
  const choose = (m: AiMode) => (setMode(m), setAiMode(m));

  return (
    <div className="mx-auto max-w-2xl space-y-3">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <Card title="AI check" subtitle="Saved on this device">
        <div className="space-y-2" role="radiogroup" aria-label="AI check">
          {MODES.map((m) => (
            <button key={m.id} role="radio" aria-checked={mode === m.id} onClick={() => choose(m.id)}
              className={`w-full rounded-xl border p-3 text-left transition ${mode === m.id ? 'border-emerald-300/60 bg-emerald-400/10' : 'border-white/10 bg-white/[0.03]'}`}>
              <p className="text-sm font-medium">{mode === m.id ? '◉' : '○'} {m.name}</p>
              <p className="text-xs text-slate-400">{m.hint}</p>
            </button>
          ))}
        </div>
      </Card>
      <Card title="What’s set up" subtitle="On the server (Vercel)">
        {err && <p className="text-sm text-red-200">{err}</p>}
        {!st && !err && <p className="text-sm text-slate-400"><span className="spinner" /> Loading…</p>}
        {st && (
          <>
            <Field label="AI analysis" hint={!st.ai ? 'Add ANTHROPIC_API_KEY in Vercel to read pictures and get the AI’s opinion.' : !st.store ? 'Also needs the free Upstash Redis storage (Vercel → Storage), which keeps the daily limit.' : `Used today: ${st.used} of ${st.limit} (AI_DAILY_LIMIT). The same message checked again is free for 7 days.`}>
              <span className={`text-sm ${st.ai && st.store ? 'text-emerald-200' : 'text-amber-200'}`}>{st.ai && st.store ? '✓ On' : 'Off'}</span>
            </Field>
            <Field label="Google Safe Browsing" hint={st.safeBrowsing ? 'Links are checked against Google’s list of dangerous websites.' : 'Optional, free: add GOOGLE_SAFE_BROWSING_KEY in Vercel to check links against Google’s list of dangerous sites.'}>
              <span className={`text-sm ${st.safeBrowsing ? 'text-emerald-200' : 'text-slate-400'}`}>{st.safeBrowsing ? '✓ On' : 'Off'}</span>
            </Field>
            <Field label="Free checks" hint="Known scam patterns, look-alike websites, how new a website is, phone number type and country, email sender checks.">
              <span className="text-sm text-emerald-200">✓ Always on</span>
            </Field>
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
