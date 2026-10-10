import { useState, type ReactNode } from 'react';
import { ResultCard } from '../components/ResultCard';
import { SavedCard } from '../components/SavedCard';
import { Rail, ScoreRing, Shell, VerdictChip } from '../components/ui';
import type { CheckResult, SavedItem, Verdict } from '../lib/types';

const at = '2026-10-10T14:05:00.000Z';
// Made-up examples, to show what things look like.
const SAFE: CheckResult = {
  id: 'example2', kind: 'bill', verdict: 'safe', score: 6, ai: 'done', checkedAt: at, preview: 'Bill (picture or PDF)', title: 'Duke Energy bill',
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
  id: 'example3', name: '1-Duke Energy', savedAt: at, checkedAt: at, note: 'Paid in the Duke Energy app on Oct 12.', kind: 'bill', verdict: 'safe', score: 6,
  summary: 'This is a normal Duke Energy bill. Nothing suspicious.',
  links: [{ domain: 'duke-energy.com', level: 'good', note: 'Real Duke Energy website' }], phones: [],
  reasons: ['duke-energy.com is Duke Energy’s real website'],
  whatToDo: [],
  brief: SAFE.brief,
  excerpt: 'Duke Energy · Amount due $142.18 · Due Oct 24',
};

// Three pictures checked at once (made up): each gets its own result.
const BATCH: { icon: string; file: string; verdict: Verdict; score: number; line: string }[] = [
  { icon: '🧾', file: 'IMG_2041.jpg', verdict: 'safe', score: 6, line: 'Your Duke Energy electric bill for September.' },
  { icon: '📱', file: 'Screenshot_0912.png', verdict: 'safe', score: 12, line: 'Your Chase card payment reminder.' },
  { icon: '📱', file: 'Screenshot_0913.png', verdict: 'suspicious', score: 48, line: 'A “delivery problem” text from an unknown number.' },
];

const SECTIONS = [
  ['how', 'How it works'], ['many', '📥 Drag & drop, several at once'], ['checks', 'What it checks'], ['summary', '📋 Summary of safe ones'],
  ['saving', '⭐ Saving and names'], ['cleanup', '🧹 Automatic clean-up'], ['settings', '⚙️ Settings'], ['bills', 'Bills and screenshots'],
  ['share', 'Share from your phone'], ['scam', 'If it’s a scam'], ['privacy', 'Privacy and cost'],
] as const;
type Id = (typeof SECTIONS)[number][0];

function GuideSection({ id, open, onToggle, children }: { id: Id; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <section id={`g-${id}`} className="card scroll-mt-28">
      <button className="flex w-full items-center justify-between gap-2 text-left" onClick={onToggle} aria-expanded={open}>
        <h2 className="text-lg font-semibold">{SECTIONS.find((x) => x[0] === id)![1]}</h2>
        <span className="text-stone-500" aria-hidden="true">{open ? '−' : '+'}</span>
      </button>
      {open && <div className="mt-3 space-y-3 text-sm text-stone-600">{children}</div>}
    </section>
  );
}

export function Guide() {
  const [open, setOpen] = useState<Set<Id>>(new Set(['how']));
  const toggle = (id: Id, v?: boolean) => setOpen((s) => { const n = new Set(s); (v ?? !n.has(id)) ? n.add(id) : n.delete(id); return n; });
  const jump = (id: Id) => { toggle(id, true); setTimeout(() => document.getElementById(`g-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30); };
  const Section = ({ id, children }: { id: Id; children: ReactNode }) => <GuideSection id={id} open={open.has(id)} onToggle={() => toggle(id)}>{children}</GuideSection>;

  return (
    <Shell
      left={<Rail title="Contents"><nav className="flex flex-col">{SECTIONS.map(([id, name]) => <button key={id} onClick={() => jump(id)} className="rounded-lg px-2 py-1.5 text-left text-sm font-semibold text-stone-600 hover:bg-white/80 hover:text-teal-800">{name}</button>)}</nav></Rail>}
      right={
        <Rail title="The three answers">
          <ul className="space-y-2 text-sm">
            <li><VerdictChip verdict="safe" /><span className="mt-0.5 block text-xs text-stone-500">No warning signs. Still never share codes or passwords.</span></li>
            <li><VerdictChip verdict="suspicious" /><span className="mt-0.5 block text-xs text-stone-500">Check it another way: the company’s own app or website.</span></li>
            <li><VerdictChip verdict="scam" /><span className="mt-0.5 block text-xs text-stone-500">Don’t click, call or pay. Delete and block.</span></li>
          </ul>
        </Rail>
      }>
      <div>
        <p className="label">Manual</p>
        <h1 className="text-2xl font-bold">Guide</h1>
        <p className="text-sm text-stone-500">How Scam Check works, in plain words.</p>
      </div>
      <div className="xl:hidden -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
        {SECTIONS.map(([id, name]) => <button key={id} onClick={() => jump(id)} className="shrink-0 whitespace-nowrap rounded-lg border border-stone-200/80 bg-white/50 px-2.5 py-1.5 text-xs font-semibold text-stone-600">{name}</button>)}
      </div>

      <Section id="how">
        <ol className="list-decimal space-y-1.5 pl-5">
          <li><b>Pick what you got:</b> ✉️ Email, 💬 Text, 🧾 Bill or 📱 Screenshot.</li>
          <li><b>Paste it, or add pictures.</b> On a computer you can also drag & drop them. For a text, you can also type the number it came from.</li>
          <li>Tap <b>🛡️ Check it</b>. The free checks answer at once; photos and PDFs also go to the AI (it’s the only way to read them). Each one gets an answer with a <b>risk score</b> from 0 (no risk) to 100, the reasons and what to do.</li>
        </ol>
        <p className="text-xs text-stone-500">The score ring (made up):</p>
        <div className="flex items-center gap-3"><ScoreRing score={6} verdict="safe" /><span>Low number, green ring: no warning signs found.</span></div>
      </Section>

      <Section id="many">
        <p><b>Drag & drop:</b> on a computer, drag pictures, PDFs or an email file (.eml) anywhere onto the Check page and let go. You can also paste a screenshot into the message box (Ctrl+V).</p>
        <p><b>Several at once:</b> choose or drop up to 10 pictures (you can change the number in Settings). Each picture is checked <b>on its own</b> and gets its own score and, if it looks safe, its own short summary. Each picture uses 1 AI check.</p>
        <p>Tap a result to see why and what to do, or tap <b>⭐ Save all</b> to save them all in one go.</p>
        <p className="text-xs text-stone-500">Example of three pictures checked together (made up, does nothing here):</p>
        <ul className="space-y-2">
          {BATCH.map((b) => (
            <li key={b.file} className="card flex items-center gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white bg-white/70 text-2xl" aria-hidden="true">{b.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs text-stone-500">{b.file}</span>
                <VerdictChip verdict={b.verdict} />
                <span className="mt-0.5 block truncate text-sm font-medium text-stone-900">{b.line}</span>
              </span>
              <ScoreRing score={b.score} verdict={b.verdict} size={44} />
            </li>
          ))}
        </ul>
      </Section>

      <Section id="checks">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>🔎 <b>Known scam patterns</b> (free): gift cards, crypto, Zelle/wire requests, "verify your account", threats, prizes, package and toll texts, utility shut-offs, fake subscriptions, tech support, fake jobs, investment promises, "keep it secret"…</li>
          <li>🌐 <b>Links and websites</b> (free): a site pretending to be a company (paypa1-login.com is not PayPal), how new the website is (brand-new sites are a big warning), shortened links, unusual endings like .top or .xyz, and Google’s list of dangerous sites if you turned it on. Links are only looked up, never opened.</li>
          <li>📞 <b>Phone numbers</b> (free): country, mobile / landline / internet (VoIP) / premium-rate, and Caribbean numbers that look American but cost a lot to call back ("one-ring" scam).</li>
          <li>✉️ <b>Who sent the email</b> (free): the real sender address, a different reply address, a link that shows one website but opens another, and whether the email passed the sender checks. Best with the .eml file (in Gmail: ⋮ → Download message; in Outlook: Save as).</li>
          <li>🤖 <b>AI analysis</b> (paid, 5 a day to start, you choose in Settings): reads photos and PDFs by itself. For texts and emails it only runs when <b>you</b> tap the button below a result where the free checks weren’t sure, so most checks cost nothing. The Check screen shows how many AI checks are left today.</li>
        </ul>
        <p className="text-xs text-stone-500">The button you see when the free checks aren’t sure (example, does nothing here):</p>
        <div className="card space-y-2">
          <p className="text-sm text-stone-600">The free checks aren’t sure about this one. Want a second opinion?</p>
          <button className="btn-primary w-full" tabIndex={-1}>🤖 Ask the AI (uses 1 of 4 left today)</button>
        </div>
        <p className="text-xs text-stone-500">Example of a safe one (made up):</p>
        <ResultCard r={SAFE} />
      </Section>

      <Section id="summary">
        <p>When something <b>looks safe</b>, you also get a tiny summary in simple words: <b>what it is</b>, the <b>key info</b> (amount, due date, account number…) and <b>what to do</b>, step by step. See the bill example above.</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li><b>Photos and PDFs</b> (bills, letters): the summary comes with the AI’s check, at no extra cost.</li>
          <li><b>Texts and emails</b> that the free checks find safe: tap <b>📋 Summarize</b> if you want one. It uses 1 AI check, only when you tap.</li>
          <li>Never for suspicious or scam ones, so no AI credit is spent on them. You can turn summaries off in Settings.</li>
        </ul>
      </Section>

      <Section id="saving">
        <p>Below any result, tap <b>⭐ Save this check</b> and add a note if you like ("Called my bank, all fine"). Leave <b>Keep the original</b> ticked to also keep the message and the picture or PDF.</p>
        <p><b>Names:</b> every saved check gets a name that starts with a number, then what it is: <span className="font-mono">1-Duke Energy</span>, <span className="font-mono">2-USPS package text</span>, <span className="font-mono">3-Chase</span>… The number goes up by one with each save. Downloaded pictures get the same name. Tap <b>✏️ Rename / note</b> to change it.</p>
        <p>In the <b>⭐ Saved</b> tab, tap a check to open it: the key facts, your note, the summary for safe ones, and the original. <b>👁 View</b> shows the picture or PDF, <b>⬇ Download</b> saves it to your phone or computer, and <b>🗑 Delete</b> removes the picture (or the whole check). Search by name, number, website or a word of your note, or show only one kind of answer. Saved checks are the same on your phone and your computer.</p>
        <p className="text-xs text-stone-500">Example (made up):</p>
        <SavedCard s={SAVED} example />
      </Section>

      <Section id="cleanup">
        <p>In <b>Settings → Saving & clean-up</b>, choose to tidy up old saved checks by themselves, for example after 90 days:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li><b>Pictures and messages only</b>: the kept picture, PDF and message are deleted, the key facts and your note stay.</li>
          <li><b>The whole saved check</b>: it is deleted completely.</li>
        </ul>
        <p>History (your last checks) is on this device only and keeps itself short by itself.</p>
      </Section>

      <Section id="settings">
        <p>Everything is set in the <b>⚙️ Settings</b> tab, and it’s the same on your phone and computer:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li><b>🤖 AI:</b> when to use it (Save credits, Smart, Always, Never), which AI model (Opus = best, Sonnet = cheaper, Haiku = cheapest), how many AI checks a day or <b>Unlimited</b>, how hard it thinks (Low is cheapest), and the summary of safe ones.</li>
          <li><b>🔎 Free checks:</b> Google’s list of dangerous sites, how new a website is, and how many days a result is remembered (checking it again is then free).</li>
          <li><b>📷 Pictures:</b> picture size (Small is cheaper, Sharp reads tiny text better) and how many at once.</li>
          <li><b>⭐ Saving & clean-up:</b> keep the original by default, and the automatic clean-up.</li>
          <li><b>📱 This device:</b> bigger text, how many checks History keeps, forget the access code.</li>
        </ul>
        <p>The secret keys (the AI key, storage, access code) stay in Vercel and are never shown. The Vercel variables <code>AI_MODEL</code> and <code>AI_DAILY_LIMIT</code> are only the starting values: what you pick in Settings wins. <b>↺ Starting values</b> puts everything back.</p>
      </Section>

      <Section id="bills">
        <p>Take a photo of a bill, or upload the PDF or a screenshot. The AI reads it, then the links and phone numbers in it are checked too. Fake invoices ("your Norton subscription renewed for $399, call to cancel") are very common.</p>
        <p>Without the AI, pictures can’t be read: you’ll see <b>❔ Not checked</b>. Paste the words instead and the free checks still work.</p>
      </Section>

      <Section id="share">
        <p>Add the app to your home screen (in Chrome: ⋮ → Install app). Then, in Messages or WhatsApp, long-press a message → <b>Share</b> → <b>Scam Check</b>: it opens with the text already filled in.</p>
      </Section>

      <Section id="scam">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Don’t click, call back, reply or pay. Delete it and block the sender.</li>
          <li>Already paid or gave details? Call your bank using the number on your card, right away.</li>
          <li>Report: forward texts to <b>7726</b> (SPAM), phishing emails to <b>reportphishing@apwg.org</b>, and tell the FTC at <b>reportfraud.ftc.gov</b>.</li>
        </ul>
      </Section>

      <Section id="privacy">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Your history is saved on <b>this device only</b>. The server keeps only the result (7 days to start, Settings → Remember results), so checking the same message again is instant and free; the message itself is not stored, unless you ⭐ save the check with “Keep the original”.</li>
          <li>Pictures are made smaller on your phone before upload. They are only kept if you save the check with “Keep the original”.</li>
          <li>The AI has a daily limit (5 to start, change it in Settings) and is asked for short answers to keep each check cheap. When it’s used up, you still get the free checks.</li>
          <li>No check is perfect. When in doubt, contact the company yourself using its official app, website or the number on your card.</li>
        </ul>
      </Section>
    </Shell>
  );
}
