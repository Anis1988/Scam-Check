import { useState, type ReactNode } from 'react';
import { ResultCard } from '../components/ResultCard';
import { SavedCard } from '../components/SavedCard';
import type { CheckResult, SavedItem } from '../lib/types';

function Section({ title, children, open: start = false }: { title: string; children: ReactNode; open?: boolean }) {
  const [open, setOpen] = useState(start);
  return (
    <section className="card">
      <button className="flex w-full items-center justify-between gap-2 text-left" onClick={() => setOpen(!open)} aria-expanded={open}>
        <h2 className="text-lg font-semibold">{title}</h2>
        <span className="text-stone-500" aria-hidden="true">{open ? '−' : '+'}</span>
      </button>
      {open && <div className="mt-3 space-y-3 text-sm text-stone-600">{children}</div>}
    </section>
  );
}

const at = '2026-10-10T14:05:00.000Z';
// Made-up examples, to show what a result looks like.
const SAFE: CheckResult = {
  id: 'example2', kind: 'bill', verdict: 'safe', score: 6, ai: 'done', checkedAt: at, preview: 'Bill (picture or PDF)',
  summary: 'This is a normal Duke Energy bill. Nothing suspicious.',
  signals: [{ source: 'link', level: 'good', weight: -8, title: 'duke-energy.com is Duke Energy’s real website' }],
  links: [{ url: 'https://duke-energy.com', domain: 'duke-energy.com', level: 'good', note: 'Real Duke Energy website' }],
  phones: [],
  brief: {
    whatItIs: 'Your Duke Energy electric bill for September.',
    keyInfo: [{ label: 'Amount due', value: '$142.18' }, { label: 'Due date', value: 'Oct 24' }, { label: 'Account', value: '•••• 4821' }],
    steps: ['Pay $142.18 by Oct 24 in the Duke Energy app or at duke-energy.com.', 'Nothing else to do.'],
  },
  whatToDo: [],
};

const SAVED: SavedItem = {
  id: 'example3', savedAt: at, checkedAt: at, note: 'Paid in the Duke Energy app on Oct 12.', kind: 'bill', verdict: 'safe', score: 6,
  summary: 'This is a normal Duke Energy bill. Nothing suspicious.',
  links: [{ domain: 'duke-energy.com', level: 'good', note: 'Real Duke Energy website' }], phones: [],
  reasons: ['duke-energy.com is Duke Energy’s real website'],
  whatToDo: [],
  brief: SAFE.brief,
  excerpt: 'Duke Energy · Amount due $142.18 · Due Oct 24',
};

export function Guide() {
  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-2xl font-extrabold">Guide</h1>
        <p className="text-sm text-stone-500">How Scam Check works, in plain words.</p>
      </div>

      <div className="grid items-start gap-3 lg:grid-cols-2">
      <Section title="How it works" open>
        <ol className="list-decimal space-y-1.5 pl-5">
          <li><b>Pick what you got:</b> ✉️ Email, 💬 Text, 🧾 Bill or 📱 Screenshot.</li>
          <li><b>Paste it or add a picture.</b> For a text, you can also type the number it came from.</li>
          <li>Tap <b>🛡️ Check it</b>. The free checks answer at once; photos and PDFs also go to the AI (it’s the only way to read them). You get one of three answers, with the reasons and what to do:
            <span className="mt-1 block">✅ <b>Looks safe</b> · ⚠️ <b>Suspicious</b> (check it another way) · 🚨 <b>Likely scam</b></span>
          </li>
        </ol>
      </Section>

      <Section title="What it checks">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>🔎 <b>Known scam patterns</b> (free): gift cards, crypto, Zelle/wire requests, "verify your account", threats, prizes, package and toll texts, utility shut-offs, fake subscriptions, tech support, fake jobs, investment promises, "keep it secret"…</li>
          <li>🌐 <b>Links and websites</b> (free): a site pretending to be a company (paypa1-login.com is not PayPal), how new the website is (brand-new sites are a big warning), shortened links, unusual endings like .top or .xyz, and Google’s list of dangerous sites if you turned it on. Links are only looked up, never opened.</li>
          <li>📞 <b>Phone numbers</b> (free): country, mobile / landline / internet (VoIP) / premium-rate, and Caribbean numbers that look American but cost a lot to call back ("one-ring" scam).</li>
          <li>✉️ <b>Who sent the email</b> (free): the real sender address, a different reply address, a link that shows one website but opens another, and whether the email passed the sender checks. Best with the .eml file (in Gmail: ⋮ → Download message; in Outlook: Save as).</li>
          <li>🤖 <b>AI analysis</b> (paid, 5 a day by default): reads photos and PDFs by itself. For texts and emails it only runs when <b>you</b> tap the button below a result where the free checks weren’t sure, so most checks cost nothing. The Check screen shows how many AI checks are left today. You can change this in Settings.</li>
        </ul>
        <p className="text-xs text-stone-500">The button you see when the free checks aren’t sure (example, does nothing here):</p>
        <div className="card space-y-2">
          <p className="text-sm text-stone-600">The free checks aren’t sure about this one. Want a second opinion?</p>
          <button className="btn-primary w-full" tabIndex={-1}>🤖 Ask the AI (uses 1 of 4 left today)</button>
        </div>
        <p className="text-xs text-stone-500">Example of a safe one (made up):</p>
        <ResultCard r={SAFE} />
      </Section>

      <Section title="📋 Summary of safe ones">
        <p>When something <b>looks safe</b>, you also get a tiny summary in simple words: <b>what it is</b>, the <b>key info</b> (amount, due date, account number…) and <b>what to do</b>, step by step. See the bill example above.</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li><b>Photos and PDFs</b> (bills, letters): the summary comes with the AI’s check, at no extra cost.</li>
          <li><b>Texts and emails</b> that the free checks find safe: tap <b>📋 Summarize</b> if you want one. It uses 1 AI check, only when you tap.</li>
          <li>Never for suspicious or scam ones: there is nothing to do with those except not answering, so no AI credit is spent on them.</li>
        </ul>
      </Section>

      <Section title="⭐ Saving important checks">
        <p>Below any result, tap <b>⭐ Save this check</b> and add a note if you like ("Called my bank, all fine"). Leave <b>Keep the original</b> ticked to also keep the message and the picture or PDF.</p>
        <p>In the <b>⭐ Saved</b> tab, tap a check to open it: the key facts, your note, the summary for safe ones, and the original. <b>👁 View</b> shows the picture or PDF, <b>⬇ Download</b> saves it to your phone or computer, and <b>🗑 Delete</b> removes the picture (or the whole check). Search by name, number, website or a word of your note. Saved checks are the same on your phone and your computer.</p>
        <p className="text-xs text-stone-500">Example (made up):</p>
        <SavedCard s={SAVED} example />
      </Section>

      <Section title="🧹 Automatic clean-up">
        <p>In <b>Settings → Automatic clean-up</b>, choose to tidy up old saved checks by themselves, for example after 90 days:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li><b>Pictures and messages only</b>: the kept picture, PDF and message are deleted, the key facts and your note stay.</li>
          <li><b>The whole saved check</b>: it is deleted completely.</li>
        </ul>
        <p>History (your last 50 checks) is on this device only and keeps itself short by itself.</p>
      </Section>

      <Section title="Bills and screenshots">
        <p>Take a photo of a bill, or upload the PDF or a screenshot. The AI reads it, then the links and phone numbers in it are checked too. Fake invoices ("your Norton subscription renewed for $399, call to cancel") are very common.</p>
        <p>Without the AI, pictures can’t be read: you’ll see <b>❔ Not checked</b>. Paste the words instead and the free checks still work.</p>
      </Section>

      <Section title="Share straight from your phone">
        <p>Add the app to your home screen (in Chrome: ⋮ → Install app). Then, in Messages or WhatsApp, long-press a message → <b>Share</b> → <b>Scam Check</b>: it opens with the text already filled in.</p>
      </Section>

      <Section title="If it’s a scam">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Don’t click, call back, reply or pay. Delete it and block the sender.</li>
          <li>Already paid or gave details? Call your bank using the number on your card, right away.</li>
          <li>Report: forward texts to <b>7726</b> (SPAM), phishing emails to <b>reportphishing@apwg.org</b>, and tell the FTC at <b>reportfraud.ftc.gov</b>.</li>
        </ul>
      </Section>

      <Section title="Privacy and cost">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Your history is saved on <b>this device only</b>. The server keeps only the result for 7 days, so checking the same message again is instant and free (no AI credit); the message itself is not stored, unless you ⭐ save the check with “Keep the original”.</li>
          <li>Pictures are made smaller on your phone before upload. They are only kept if you save the check with “Keep the original”.</li>
          <li>The AI has a daily limit (set by <code>AI_DAILY_LIMIT</code>, 5 by default) and is asked for short answers to keep each check cheap. When it’s used up, you still get the free checks.</li>
          <li>No check is perfect. When in doubt, contact the company yourself using its official app, website or the number on your card.</li>
        </ul>
      </Section>
      </div>
    </div>
  );
}
