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
const SCAM: CheckResult = {
  id: 'example1', kind: 'text', verdict: 'scam', score: 88, ai: 'done', checkedAt: at, preview: 'E-ZPass: unpaid toll…',
  summary: 'This text pretends to be E-ZPass to get your card details. The link goes to a fake site made last week.',
  impersonating: 'E-ZPass',
  signals: [
    { source: 'pattern', level: 'bad', weight: 25, title: 'Unpaid toll message', detail: 'Unpaid-toll texts are a huge scam wave.' },
    { source: 'pattern', level: 'warn', weight: 12, title: 'Pressure to act fast', detail: 'Scammers rush you so you don’t stop to check.' },
    { source: 'link', level: 'bad', weight: 35, title: 'Pretends to be E-ZPass', detail: 'payment-tolls.top is not E-ZPass.' },
    { source: 'link', level: 'bad', weight: 25, title: 'payment-tolls.top was created 6 days ago', detail: 'Brand-new websites are a strong scam sign.' },
    { source: 'ai', level: 'bad', weight: 0, title: 'Tiny fee, big late penalty', detail: 'A $4 bill with a $50 "late fee" is a classic pressure trick.' },
  ],
  links: [{ url: 'https://ezpass-oh.payment-tolls.top/pay', domain: 'payment-tolls.top', level: 'bad', note: 'Pretends to be E-ZPass · Unusual ending ".top"', age: 'registered 6 days ago' }],
  phones: [],
  whatToDo: ['Don’t tap the link or pay.', 'Check your toll balance yourself at your E-ZPass account’s real website or app.', 'Forward the text to 7726 (SPAM), then delete it.'],
};
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
  id: 'example3', savedAt: at, checkedAt: at, note: 'Called Duke Energy at the number on my bill: my account is fine.', kind: 'text', verdict: 'scam', score: 91,
  summary: 'This text pretends to be Duke Energy and demands gift cards to stop a shut-off.', impersonating: 'Duke Energy',
  links: [], phones: [{ number: '+1 876 555 0199', note: 'In Jamaica: calling back is an expensive international call', level: 'bad' }],
  reasons: ['Asks for gift cards', 'Utility shut-off threat', 'Pressure to act fast'],
  whatToDo: ['Don’t call the number or pay.', 'Check your account in the Duke Energy app or at duke-energy.com.'],
  excerpt: 'Duke Energy: your power will be disconnected in 30 minutes unless…',
};

export function Guide() {
  return (
    <div className="mx-auto max-w-2xl space-y-3">
      <div>
        <h1 className="text-2xl font-extrabold">Guide</h1>
        <p className="text-sm text-stone-500">How Scam Check works, in plain words.</p>
      </div>

      <Section title="How it works" open>
        <ol className="list-decimal space-y-1.5 pl-5">
          <li><b>Pick what you got:</b> ✉️ Email, 💬 Text, 🧾 Bill or 📱 Screenshot.</li>
          <li><b>Paste it or add a picture.</b> For a text, you can also type the number it came from.</li>
          <li>Tap <b>🛡️ Check it</b>. The free checks answer at once; photos and PDFs also go to the AI (it’s the only way to read them). You get one of three answers, with the reasons and what to do:
            <span className="mt-1 block">✅ <b>Looks safe</b> · ⚠️ <b>Suspicious</b> (check it another way) · 🚨 <b>Likely scam</b></span>
          </li>
        </ol>
        <p className="text-xs text-stone-500">Example (made up):</p>
        <ResultCard r={SCAM} />
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
        <p>Below any result, tap <b>⭐ Save this check</b> and add a note if you like ("Called my bank, all fine"). It keeps only the key facts: the verdict, who it pretended to be, the sender, phone numbers and websites, the main reasons, what to do (and the summary, for safe ones), the date and the first words of the message. Never the whole message or the picture.</p>
        <p>Find them in the <b>⭐ Saved</b> tab, on your phone and your computer alike. Search by name, number, website or a word of your note. They stay until you delete them (History only keeps your last 50 checks, on this device).</p>
        <p className="text-xs text-stone-500">Example (made up):</p>
        <SavedCard s={SAVED} example />
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
          <li>Your history is saved on <b>this device only</b>. The server keeps only the result for 7 days, so checking the same message again is instant and free (no AI credit); the message itself is never stored. ⭐ Saved checks keep only their key facts.</li>
          <li>Pictures are made smaller on your phone before upload, and they’re only sent for the AI check, never stored.</li>
          <li>The AI has a daily limit (set by <code>AI_DAILY_LIMIT</code>, 5 by default) and is asked for short answers to keep each check cheap. When it’s used up, you still get the free checks.</li>
          <li>No check is perfect. When in doubt, contact the company yourself using its official app, website or the number on your card.</li>
        </ul>
      </Section>
    </div>
  );
}
