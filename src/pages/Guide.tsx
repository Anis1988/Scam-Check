import { useState, type ReactNode } from 'react';
import { ResultCard } from '../components/ResultCard';
import { SavedCard } from '../components/SavedCard';
import { BillRow } from './Bills';
import { RecheckBar } from '../components/Recheck';
import { Empty, Fold, FoldBody, Rail, ScoreRing, Shell, Skeleton, Slide, VerdictChip } from '../components/ui';
import type { Bill, CheckResult, CompanyInfo, DocResult, SavedItem, ScamNews, Verdict, VideoResult } from '../lib/types';
import { DocCard } from './Docs';
import { NewsList } from '../components/ScamNews';
import { VideoCard } from './Video';
import { CompanyCard } from './Lookup';

const at = '2026-10-10T14:05:00.000Z';
// Made-up examples, to show what things look like.
const SAFE: CheckResult = {
  id: 'example2', kind: 'bill', verdict: 'safe', score: 6, ai: 'done', aiBy: 'Claude Opus 5.5', checkedAt: at, preview: 'Bill (picture or PDF)', title: 'Duke Energy bill',
  summary: 'This is a normal Duke Energy bill. Nothing suspicious.',
  signals: [{ source: 'link', level: 'good', weight: -8, title: 'duke-energy.com is Duke Energy’s real website' }],
  links: [{ url: 'https://duke-energy.com', domain: 'duke-energy.com', level: 'good', note: 'Real Duke Energy website' }],
  phones: [],
  brief: {
    whatItIs: 'Your Duke Energy electric bill for September.',
    keyInfo: [{ label: 'Amount due', value: '$142.18' }, { label: 'Due date', value: 'Oct 24' }, { label: 'Account', value: '•••• 4821' }],
    steps: ['Pay $142.18 by Oct 24 in the Duke Energy app or at duke-energy.com.', 'Nothing else to do.'],
  },
  bill: { company: 'Duke Energy', amount: 142.18, dueDate: '2026-10-24', account: '4821' },
  billCompare: { prevAmount: 98.2, prevDue: '2026-09-24', prevCheckedAt: '2026-09-10T14:05:00.000Z', change: 45 },
  whatToDo: [],
};

// A made-up voicemail for the 🎙️ example.
const VOICEMAIL: CheckResult = {
  id: 'example-vm', kind: 'voicemail', verdict: 'scam', score: 94, ai: 'done', aiBy: 'Gemini Flash (free)', checkedAt: at, preview: 'Voicemail', title: 'Fake IRS call',
  summary: 'A recorded voice says it is the IRS and asks you to call back today about a lawsuit, or be arrested. The IRS never calls like this.',
  signals: [
    { source: 'ai', level: 'bad', weight: 30, title: 'Pretends to be the IRS and threatens arrest' },
    { source: 'phone', level: 'warn', weight: 10, title: '(202) 555-0147 is an internet (VoIP) number' },
  ],
  links: [], phones: [{ number: '(202) 555-0147', level: 'warn', note: 'US internet (VoIP) number' }],
  whatToDo: ['Don’t call back.', 'The IRS writes to you by post first. If unsure, call the number on irs.gov yourself.', 'Block the number.'],
};

// A made-up document read by 📄 Docs.
const DOC: DocResult = {
  id: 'example-doc', status: 'done', mode: 'analyze', label: 'lease-2027.pdf', checkedAt: at, title: 'Apartment lease, 12 months', docType: 'Lease',
  summary: 'A 12-month lease for 14 Oak St, Apt 3, from Jan 1 to Dec 31, 2027, at $1,450 a month. You pay electricity and internet; the landlord pays water.',
  keyPoints: ['Rent $1,450, due on the 1st', 'Deposit $1,450, back within 30 days of moving out', 'No pets without written OK'],
  redFlags: [
    { issue: 'It renews by itself for 12 months', why: 'If you don’t give notice 60 days before the end, you’re locked in for another year.', level: 'high', quote: 'This lease shall automatically renew for successive twelve-month terms' },
    { issue: 'Late fee from day 2', why: '$75 plus $10 a day is high: most leases give 5 days.', level: 'medium' },
  ],
  actions: [{ task: 'Ask to change the auto-renewal to month-to-month', when: 'before signing' }, { task: 'Put the move-out notice date in your calendar', when: 'Nov 1, 2027' }],
  dates: [{ what: 'Start', when: 'Jan 1, 2027' }, { what: 'Notice to leave', when: 'Nov 1, 2027' }],
  aiBy: 'Claude Sonnet 5.5',
};
const NEWS: ScamNews = {
  items: [
    { name: 'Fake toll texts', how: 'A text says you owe a small toll and links to a payment page.', tell: 'Toll agencies don’t text links: check in your toll account’s app.', who: 'drivers' },
    { name: 'Package “delivery problem”', how: 'A message asks you to confirm your address and pay a small fee.', tell: 'Track the package on the shipper’s own app instead.' },
  ],
  sources: [], aiBy: 'Gemini Flash (free)', checkedAt: at,
};

// A made-up website for the 🌐 SEO example.
const SEO_EXAMPLE: DocResult = {
  id: 'example-seo', status: 'done', mode: 'seo', label: 'mybakery.com', checkedAt: at, title: 'Best Bakery – Springfield', docType: 'Website SEO', aiBy: 'Gemini Flash (free)',
  summary: 'A solid start: the basics are mostly right, but the page is thin and misses the searches people make most.',
  seo: {
    url: 'https://mybakery.com/', score: 74, fetchedMs: 820, sizeKb: 64,
    meta: { title: 'Best Bakery', description: 'Fresh bread daily.', viewport: true, lang: 'en', schema: ['Bakery'], favicon: true },
    headings: [{ level: 1, text: 'Welcome' }, { level: 2, text: 'Our bread' }, { level: 3, text: 'Sourdough' }],
    stats: { words: 420, images: 8, imagesNoAlt: 3, linksInternal: 12, linksExternal: 3, https: true, robotsTxt: true, sitemap: false },
    issues: [{ level: 'medium', what: 'The title is short (11 characters)', fix: 'Use 30–60 characters: main keyword + what you offer + brand.' }, { level: 'medium', what: 'No sitemap found', fix: 'Create sitemap.xml and add it in Google Search Console.' }],
    content: { score: 68, summary: 'Friendly and clear, but thin: no prices, and nothing about what makes your bread special.', strengths: ['Warm, local tone'], weaknesses: ['No prices or menu text'] },
    keywords: [{ keyword: 'sourdough bakery near me', why: 'Lots of local searches, few strong pages', where: 'Title and H1' }],
    competitors: [{ site: 'breadhouse.com', note: 'Full menu with prices and online ordering' }],
    gaps: [{ gap: 'Customer reviews', action: 'Show 3–5 Google reviews on the home page' }],
    topFixes: ['Rewrite the title: “Sourdough Bakery in Springfield | Best Bakery”', 'Add a sitemap and submit it to Google'],
  },
};

// Made-up bills for the 📅 Bills example.
const BILLS: Bill[] = [
  { key: 'a', id: 'a', company: 'Duke Energy', amount: 142.18, dueDate: '2026-10-24', account: '4821', checkedAt: at },
  { key: 'b', id: 'b', company: 'Spectrum', amount: 79.99, dueDate: '2026-10-02', checkedAt: at, paid: true },
];

const SAVED: SavedItem = {
  id: 'example3', name: '1-Duke Energy', aiBy: 'Claude Opus 5.5', savedAt: at, checkedAt: at, note: 'Paid in the Duke Energy app on Oct 12.', kind: 'bill', verdict: 'safe', score: 6,
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

// Made-up video check and company look-up for the examples.
const VIDEO: VideoResult = {
  id: 'example-video', status: 'done', from: 'youtube', label: 'youtube.com/watch?v=…', checkedAt: at, verdict: 'misleading', title: 'Claim that bananas cure flu',
  summary: 'The video says eating 5 bananas a day cures the flu. Bananas are healthy, but no study shows they cure or prevent the flu.',
  claims: [
    { claim: 'Bananas cure the flu', verdict: 'false', why: 'No research shows this. Rest, fluids and a flu shot are what doctors recommend.' },
    { claim: 'Bananas are rich in potassium', verdict: 'true', why: 'A medium banana has about 400 mg of potassium.' },
  ],
  sources: [{ title: 'cdc.gov', url: 'https://www.cdc.gov/flu' }], aiBy: 'Gemini Flash (free)',
};
const COMPANY: CompanyInfo = {
  name: 'Duke Energy', whatTheyDo: 'An electric and gas company serving the Carolinas, Florida, Ohio, Indiana and Kentucky.',
  website: { url: 'https://www.duke-energy.com', domain: 'duke-energy.com', level: 'good', note: 'Real Duke Energy website' },
  phones: [{ label: 'Customer service', number: '800-555-0123', note: 'toll-free', level: 'info' }], emails: [],
  contactPage: 'https://www.duke-energy.com/contact-us', hours: 'Mon–Fri 7 am – 7 pm',
  scamWarning: 'Scammers call threatening to cut your power unless you pay by gift card or app: Duke Energy never does that.',
  sources: [{ title: 'duke-energy.com', url: 'https://www.duke-energy.com' }], aiBy: 'Gemini Flash (free)', checkedAt: at,
};

const SECTIONS = [
  ['how', 'How it works'], ['many', '📥 Drag & drop, several at once'], ['voicemail', '🎙️ Voicemails and calls'], ['docs', '📄 Documents'], ['seo', '🌐 Website SEO'], ['news', '📰 Scams going around'], ['video', '🎬 Video: is it true?'], ['company', '🏢 Look up a company'], ['lookup', '⚡ Quick look-up'], ['qr', '🔳 QR codes'], ['checks', 'What it checks'], ['summary', '📋 Summary of safe ones'],
  ['saving', '⭐ Saving and names'], ['billtrack', '📅 Bills'], ['lists', '✅ Trusted & 🚫 Blocked'], ['cleanup', '🧹 Automatic clean-up'], ['whichai', '🤖 Which AI'], ['search', '🔎 Search History'], ['recheck', '↻ Re-check'], ['failed', '⚠️ When an AI fails'], ['look', '🌙 Dark mode'], ['feel', '✨ Look and feel'], ['sync', '🔄 Same on phone & computer'], ['myapps', '📊 On your “My apps” page'], ['tidy', '📂 Fold & 🗑 delete'], ['settings', '⚙️ Settings'], ['bills', 'Bills and screenshots'],
  ['share', 'Share from your phone'], ['iphone', '🍏 iPhone'], ['scam', 'If it’s a scam'], ['privacy', 'Privacy and cost'],
] as const;
type Id = (typeof SECTIONS)[number][0];

function GuideSection({ id, open, onToggle, children }: { id: Id; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <section id={`g-${id}`} className="card scroll-mt-28">
      <button className="flex min-h-[40px] w-full items-center justify-between gap-2 text-left" onClick={onToggle} aria-expanded={open}>
        <h2 className="text-lg font-semibold">{SECTIONS.find((x) => x[0] === id)![1]}</h2>
        <span className={`chev flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-stone-200/80 bg-white/60 text-xs text-stone-500 ${open ? 'rotate-180' : ''}`} aria-hidden="true">▾</span>
      </button>
      <FoldBody open={open} className="mt-3 space-y-3 text-sm text-stone-600">{children}</FoldBody>
    </section>
  );
}

/** 📊 What the "My apps" page shows for Scam Check (made-up numbers). */
function MyAppsDemo() {
  return (
    <div className="card space-y-2 text-sm">
      <p className="label">Scam Check</p>
      <p>🛡️ 3 checks today</p>
      <p className="flex flex-wrap items-center gap-1.5">Last: <VerdictChip verdict="scam" /> <span className="text-stone-600">(Fake parcel fee)</span></p>
      <p>🚨 2 likely scams this week</p>
      <p className="hud border-t border-stone-200/80 pt-2">AI today 3 · about $0.15 · week 11 · month 40 (estimate)</p>
    </div>
  );
}

/** ✨ Look and feel example: a sliding choice (it only moves here), the "checking" shimmer and an empty page. */
function FeelDemo() {
  const [pick, setPick] = useState<'a' | 'b' | 'c'>('a');
  return (
    <div className="space-y-3">
      <Slide className="grid grid-cols-3 gap-1.5" role="tablist" aria-label="Example choice">
        {([['a', '📖 Read one'], ['b', '🔀 Compare'], ['c', '🌐 Website']] as const).map(([id, name]) => (
          <button key={id} type="button" role="tab" aria-selected={pick === id} onClick={() => setPick(id)}
            className={`tap min-h-[44px] rounded-xl border px-1 text-sm font-semibold ${pick === id ? 'border-transparent text-teal-900' : 'border-stone-200/80 bg-white/40 text-stone-600'}`}>{name}</button>
        ))}
      </Slide>
      <div className="card space-y-3 text-sm text-teal-800"><p><span className="spinner" /> Checking…</p><Skeleton ring /></div>
      <div className="card flex items-center gap-3">
        <ScoreRing score={6} verdict="safe" size={52} />
        <span className="min-w-0"><VerdictChip verdict="safe" /><span className="mt-0.5 block truncate text-sm font-medium text-stone-900">Duke Energy bill</span></span>
      </div>
      <Empty icon="⭐">Nothing saved yet. After a check, tap <b>⭐ Save this check</b>.</Empty>
    </div>
  );
}

export function Guide() {
  const [open, setOpen] = useState<Set<Id>>(new Set(['how']));
  const toggle = (id: Id, v?: boolean) => setOpen((s) => { const n = new Set(s); (v ?? !n.has(id)) ? n.add(id) : n.delete(id); return n; });
  const jump = (id: Id) => { toggle(id, true); setTimeout(() => document.getElementById(`g-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30); };
  const Section = ({ id, children }: { id: Id; children: ReactNode }) => <GuideSection id={id} open={open.has(id)} onToggle={() => toggle(id)}>{children}</GuideSection>;

  return (
    <Shell
      left={<Rail title="Contents"><nav className="flex flex-col">{SECTIONS.map(([id, name]) => <button key={id} onClick={() => jump(id)} className="tap rounded-lg px-2 py-1.5 text-left text-sm font-semibold text-stone-600 hover:bg-white/80 hover:text-teal-800">{name}</button>)}</nav></Rail>}
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
      <div className="no-scrollbar xl:hidden -mx-4 flex gap-1.5 overflow-x-auto px-4 py-1">
        {SECTIONS.map(([id, name]) => <button key={id} onClick={() => jump(id)} className="tap min-h-[36px] shrink-0 whitespace-nowrap rounded-full border border-stone-200/80 bg-white/50 px-3 py-1.5 text-xs font-semibold text-stone-600">{name}</button>)}
      </div>

      <Section id="how">
        <ol className="list-decimal space-y-1.5 pl-5">
          <li><b>Pick what you got:</b> 📱 Screenshot, 🧾 Bill, ✉️ Email (the .eml file) or 🔳 QR code. No typing needed.</li>
          <li><b>Add it:</b> tap to choose, or on a computer drag & drop it (or paste a screenshot with Ctrl+V). A text message: take a screenshot of it, or share it to the app from Messages.</li>
          <li>Tap <b>🛡️ Check it</b>. The free checks answer at once; photos and PDFs also go to the AI (it’s the only way to read them). Each one gets an answer with a <b>safety score from 1 to 10</b>, the reasons and what to do.</li>
        </ol>
        <p><b>The safety score:</b> 10 is pretty safe, 1 is extremely bad. The fuller the ring, the safer. It always matches the answer:</p>
        <ul className="space-y-1.5">
          <li className="flex items-center gap-3"><ScoreRing score={6} verdict="safe" size={44} /><span><b>8 to 10</b>: ✅ Looks safe, no warning signs found.</span></li>
          <li className="flex items-center gap-3"><ScoreRing score={48} verdict="suspicious" size={44} /><span><b>4 to 7</b>: ⚠️ Suspicious, check it another way first.</span></li>
          <li className="flex items-center gap-3"><ScoreRing score={92} verdict="scam" size={44} /><span><b>1 to 3</b>: 🚨 Likely scam, don’t click, call or pay.</span></li>
        </ul>
        <p className="text-xs text-stone-500">(Made-up examples.)</p>
      </Section>

      <Section id="many">
        <p><b>Drag & drop:</b> on a computer, drag pictures, PDFs or an email file (.eml) anywhere onto the Check page and let go. You can also paste a screenshot anywhere on Check (Ctrl+V).</p>
        <p><b>Several at once:</b> choose or drop up to 10 pictures (you can change the number in Settings). Each picture is checked <b>on its own</b> and gets its own safety score (1 to 10) and, if it looks safe, its own short summary. Each picture uses 1 AI check.</p>
        <p>Tap a result to see why and what to do, or tap <b>⭐ Save all</b> to save them all in one go.</p>
        <p><b>Keep using the app while it checks:</b> switch tabs, or even close the app or the browser. Everything is sent to the server at once and finished there. Your results stay on the Check screen, and <b>History</b> fills in the answers by itself (“AI checking…” until they arrive).</p>
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

      <Section id="voicemail">
        <p>Got a strange voicemail or a call you recorded (“IRS”, “your bank”, “your grandson is in jail”, “Medicare”)? Pick <b>🎙️ Voicemail</b> on Check and add the recording (MP3, M4A, WAV, OGG…). On a phone: open the voicemail and tap <b>Share</b> or <b>Save</b> first. On a computer you can drag it in.</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li><b>Gemini</b> listens to it directly. <b>Claude, Groq, OpenRouter</b> can’t hear, so <b>Groq</b> first turns what is said into words for free (needs the free <code>GROQ_API_KEY</code>), then your model checks them.</li>
          <li>Phone numbers and websites the caller says are checked too (free), like in a text.</li>
          <li>Up to <b>3 minutes</b> each: the recording is made small on your phone first (phone quality), and a longer one keeps its start. Each recording uses 1 AI check.</li>
          <li>Tick <b>Keep the original</b> when saving to play it again later from ⭐ Saved.</li>
        </ul>
        <p className="text-xs text-stone-500">Example (made up):</p>
        <ResultCard r={VOICEMAIL} example />
      </Section>

      <Section id="docs">
        <p>In the <b>📄 Docs</b> tab, add any document: a <b>PDF</b>, a <b>Word</b> file (.docx), a text file, or <b>photos of the pages</b> of a paper (up to 6). The AI picked in Settings explains it in plain words:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>A short <b>summary</b> and the <b>key points</b> (amounts, dates, who it’s between).</li>
          <li><b>Red flags</b> (🔴 serious, 🟠 watch out, ⚪ minor): unfair terms, hidden fees, auto-renewals, penalties, missing cancellation terms, signs of a fake, with the exact words quoted.</li>
          <li><b>What to do</b> (a to-do list with deadlines) and the important <b>dates</b>.</li>
          <li><b>🔀 Compare two:</b> add the old and the new version (say, last year’s and this year’s contract) and see <b>what changed</b>, whether each change is 🟢 better or 🔴 worse for you, and any new risk.</li>
        </ul>
        <p>The words are taken out of the file <b>on your device</b>, so any AI can read it; a scanned PDF (only pictures) goes to Claude or Gemini as it is. Each one uses 1 AI check, and the same document again is free. About the first 40 pages are read. Old .doc or .xls files: save them as PDF first. Only the answer is kept (on your phone and computer alike), never the document. If it fails, tap <b>⚠️ It failed: try another model</b>.</p>
        <p className="text-xs text-stone-500">Example (made up):</p>
        <DocCard r={DOC} example />
      </Section>

      <Section id="seo">
        <p>In <b>📄 Docs → 🌐 Website SEO</b>, type a website address (yours, a client’s…) to see how it does on Google and what to fix:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li><b>Free checks:</b> the page title and description (and their length), headings (H1, H2, H3), number of words, images without a description, links, https, phone-ready, sitemap and robots.txt, speed. Each problem comes with how to fix it.</li>
          <li><b>With the AI</b> (1 AI check, with a web search): how good the <b>content</b> is, <b>keyword opportunities</b> (searches people make that you could win) and <b>competitor gaps</b> (what they cover that you don’t). Type up to 3 competitors, or leave it empty and the AI finds the top ones.</li>
          <li>A <b>score out of 100</b> (technical 60%, content 40%), a <b>fix these first</b> list, and <b>⬇ Download the PDF report</b> to keep or send to your web designer.</li>
        </ul>
        <p>This is the only place the app opens a website: only the address you type, read as text by the server (never a link from a message). If the AI part can’t run, you still get the free part and can add the AI part with another model. Each run is kept, so you can check again after your fixes.</p>
        <p className="text-xs text-stone-500">Example (made up; the PDF button does nothing here):</p>
        <DocCard r={SEO_EXAMPLE} example />
      </Section>

      <Section id="news">
        <p>On <b>🛡️ Check</b>, open <b>📰 Scams going around now</b> to see the newest scams in the news (from the FTC, FBI, AARP, BBB and the news), each with how to spot it. It’s made only when you tap <b>Get this week’s list</b> (1 AI check, with a live web search), then kept for your phone and computer, and offered again after a week.</p>
        <p className="text-xs text-stone-500">Example (made up):</p>
        <div className="card"><NewsList n={NEWS} /></div>
      </Section>

      <Section id="video">
        <p>In the <b>🎬 Video</b> tab, upload a video (from your phone or computer) or paste a <b>YouTube</b> or <b>TikTok</b> link. The AI picked in <b>Settings</b> checks what it claims with a <b>web search</b> and tells you in simple words:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>✅ True, ⚖️ Partly true, ⚠️ Misleading, ❌ False, ❔ Can’t be checked, or 💬 Opinion or entertainment.</li>
          <li>A short summary, each main claim with what’s really true, signs it’s AI-made or edited, and the <b>sources</b>.</li>
        </ul>
        <ul className="list-disc space-y-1.5 pl-5">
          <li><b>Gemini</b> watches and listens to the whole video (up to about 20 minutes), YouTube links too.</li>
          <li><b>Claude, Groq, OpenRouter</b> can’t watch videos: the app takes 6 pictures from your video on your phone and they check those (no sound). For a YouTube link they check its title and cover picture.</li>
          <li><b>TikTok links:</b> no AI can watch them, so only the caption and cover are checked. For the whole video, save it (Share → Save video) and upload it.</li>
        </ul>
        <p>Each video uses 1 AI check. You can switch tabs or close the app while it works. If it fails or today’s limit is reached, tap <b>⚠️ It failed: try another model</b> and pick one from the list.</p>
        <p className="text-xs text-stone-500">Example (made up):</p>
        <VideoCard r={VIDEO} example />
      </Section>

      <Section id="company">
        <p>In the <b>🏢 Look up</b> tab, type a company name (Duke Energy, Chase, Amazon…). You get what they do, their <b>real website</b>, <b>customer service phone and email</b>, contact page and hours, from a live web search with sources, by the AI picked in Settings. The app also checks the website (real one, how old) and the phone numbers.</p>
        <p>It never comes from an AI’s memory, because a wrong number could lead you to a scammer: <b>Gemini</b> uses Google Search, <b>Claude</b> its own web search (about 1 cent more per look-up), <b>Groq</b> its free “Compound” search. OpenRouter’s free models can’t search, so they’re greyed out here. If today’s limit is reached, tap <b>Continue with another model</b>. Still, the safest number is the one on your card, bill or the company’s own app. Uses 1 AI check; the same company is remembered for a week (free).</p>
        <p className="text-xs text-stone-500">Example (made up, the links do nothing here):</p>
        <CompanyCard c={COMPANY} example />
      </Section>

      <Section id="lookup">
        <p>In the <b>🏢 Look up</b> tab, under the company search, paste <b>just</b> a link, a phone number or an email address and tap <b>Look up</b>. You get the same free checks in a second: is the website pretending to be a company, how new it is, Google’s list of dangerous sites, the phone number’s country and type, a free email address pretending to be a company…</p>
        <p>It never uses the AI, so it’s always free. The link is only looked up, never opened.</p>
      </Section>

      <Section id="qr">
        <p>Fake QR codes are stuck on parking meters, restaurant tables, letters and flyers, and lead to fake payment pages.</p>
        <ol className="list-decimal space-y-1.5 pl-5">
          <li>Pick <b>🔳 QR code</b>, then take or choose a photo of the code (several at once is fine).</li>
          <li>The code is read <b>on your phone</b>, for free: you see what’s inside before anything else.</li>
          <li>Tap <b>Check it</b>: the link inside is checked like any other link, without opening it. No AI is used and the photo isn’t sent anywhere.</li>
        </ol>
        <p>Any other picture you check is also looked at for a QR code: if there is one, its link is checked too.</p>
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
        <ResultCard r={SAFE} example />
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

      <Section id="billtrack">
        <p>When the AI reads a <b>bill</b> (photo or PDF) and it looks safe, it goes to <b>⭐ Saved → 📅 Bills</b> by itself, with who it’s from, the amount and the due date. No extra AI check is used.</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li><b>Due dates:</b> see what’s due soon (“due in 3 days”) and what’s late. Tap <b>✓ Paid</b> when you’ve paid it.</li>
          <li><b>Compared to last time:</b> the next bill from the same company shows the difference, e.g. <b>📈 45% more than last time</b>. A much higher bill gets a gentle note to check your account in the company’s own app before paying: it can be a mistake, or a fake bill.</li>
          <li><b>By company:</b> each company’s amounts over time.</li>
        </ul>
        <p>You can turn this off in Settings → Saving, bills & clean-up.</p>
        <p className="text-xs text-stone-500">Example (made up, the buttons do nothing here):</p>
        <ul className="space-y-2">{BILLS.map((b) => <BillRow key={b.key} b={b} example />)}</ul>
      </Section>

      <Section id="lists">
        <p>Under every result, next to each website, phone number and sender, you’ll see <b>✓ Trust</b> and <b>🚫 Block</b> (see the bill example above).</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li><b>🚫 Block</b> a number or website that scammed you: every future message with it shows as 🚨 Likely scam at once.</li>
          <li><b>✓ Trust</b> your bank, your doctor, your power company: their messages get a little less risk. A strong warning still counts, because scammers can copy a trusted name.</li>
        </ul>
        <p>See and change both lists in <b>Settings → ✅ Trusted & 🚫 Blocked</b>, where you can also type one in. They apply at once, even to checks you did before.</p>
      </Section>

      <Section id="cleanup">
        <p>In <b>Settings → Saving & clean-up</b>, choose to tidy up old saved checks by themselves, for example after 90 days:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li><b>Pictures and messages only</b>: the kept picture, PDF and message are deleted, the key facts and your note stay.</li>
          <li><b>The whole saved check</b>: it is deleted completely.</li>
        </ul>
        <p>History (your last 100 checks) keeps itself short by itself.</p>
      </Section>

      <Section id="whichai">
        <p>In <b>Settings → AI → AI model</b>, tap the model you want: Claude’s and Gemini’s are in the same list. The one you pick reads your pictures, bills and PDFs and answers “Ask the AI”:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li><b>Claude (paid):</b> the best at spotting tricky scams, a few cents a check. What you send is not used to train it.</li>
          <li><b>Groq, OpenRouter (free):</b> more free AIs, each with its own free key and daily limit (50 to start). They run strong models like Meta’s Llama 4, OpenAI’s open model GPT-OSS and DeepSeek. They read screenshots (models marked 🚫📷 can’t: another model of the same AI reads the picture instead), but not PDFs: a PDF goes to Gemini or Claude.</li>
          <li><b>Gemini (free):</b> Google’s AI, free within Google’s daily allowance. Pick <b>Gemini Pro</b> (the biggest and most careful), <b>Flash</b> or <b>Flash-Lite</b>. Pro’s free allowance is small: when it runs out, Flash takes over by itself and the result says so. The app stops at 50 Gemini checks a day to start (you can change it). On the free plan <b>Google may keep and use what you send</b>.</li>
        </ul>
        <p>The model you pick does <b>everything</b>: checks, 🎬 Video and 🏢 Look up. Each AI has its own daily limit: with Claude you set the number of paid checks (or Unlimited), with the free ones how many a day. When one is used up, the result shows <b>⏸ Limit reached: continue with another model</b>: tap it and pick another one to carry on.</p>
        <p>The <b>top</b> of every result says which AI checked it, e.g. “🤖 Checked by Claude Opus 5.5” in the bill example above, or “🤖 Checked by Gemini Pro (free)”. When no AI was needed it says “🔎 Free checks only (no AI)”. It stays on the result in History and on your saved checks too.</p>
        <p><b>One-time setup for Gemini:</b> go to <b>aistudio.google.com</b>, sign in, tap <b>Get API key</b> → <b>Create API key</b>, and add it in Vercel as <code>GEMINI_API_KEY</code> (Settings → Environment Variables), then redeploy. Like your other keys, never paste it anywhere else.</p>
      </Section>

      <Section id="search">
        <p>At the top of <b>🕘 History</b>, type in the <b>🔎 search</b> box to find a check by a word, a company, a website or a phone number (with or without dashes). Tap <b>🚨 Scam</b>, <b>⚠️ Suspicious</b> or <b>✅ Safe</b> to show only those, or pick a kind (🧾 bills, 🎙️ voicemails…). <b>Show all</b> clears it.</p>
      </Section>

      <Section id="recheck">
        <p><b>↻ Re-check</b> asks an AI again about the same message, under <b>every</b> result, even a good one. Tap <b>↻ Re-check</b> and a list of all the models (Claude, Gemini, Groq, OpenRouter) opens: tap one and it checks it right away, just for this once (Settings stay as they are; models not set up, or with no checks left today, are greyed out). It uses 1 AI check of that kind. You find it under a result on the Check screen and when you open one in History.</p>
        <p>Checking the <b>same</b> message again normally gives the answer remembered from last time, for free, even if you picked another model since. The result then says so (📌) and offers Re-check.</p>
        <p>Re-check needs the original, so the device you checked on keeps each check’s words and picture (on that device only, removed with History). A check made on your phone can be re-checked on the phone.</p>
        <p className="text-xs text-stone-500">Example (made up, does nothing here):</p>
        <RecheckBar r={{ ...SAFE, remembered: true, aiBy: 'Gemini Flash (free)' }} canRecheck example />
      </Section>

      <Section id="failed">
        <p>Sometimes the AI you picked can’t do it: it’s busy, its key is wrong, it isn’t set up, or today’s limit is reached. Then you don’t lose anything:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li><b>Screenshots, bills, emails:</b> the free checks still give an answer, and right at the top you see <b>⚠️ It failed: try another model</b>. Tap it, pick another model, and it checks again with that one.</li>
          <li><b>Several pictures at once:</b> the ones that failed say so in the list, and one button sends <b>all of them</b> to the model you pick.</li>
          <li><b>🎬 Video:</b> the card says <b>⚠️ It failed: try another model</b>. If the model in Settings isn’t set up or has no checks left today, pick another one right there before you upload.</li>
          <li><b>🏢 Look up:</b> <b>Continue with another model</b>.</li>
        </ul>
        <p>The list only lets you pick models that <b>can</b> do the job: the one that just failed is marked ⚠️, and the ones that can’t read pictures or PDFs, can’t search the web, aren’t set up, or have no checks left today are greyed out with the reason. Your Settings stay as they are.</p>
        <p className="text-xs text-stone-500">Example (made up, does nothing here):</p>
        <RecheckBar r={{ ...SAFE, ai: 'failed', aiTried: 'Gemini Pro (free)', remembered: undefined }} canRecheck example />
      </Section>

      <Section id="look">
        <p>Tap <b>🌙</b> at the top (next to the AI counter) for the dark look, and <b>☀️</b> to go back to light. It’s remembered on this phone or computer; you also find it in <b>Settings → 📱 This device → Look</b>.</p>
        <p className="text-xs text-stone-500">The same result in both looks (made up):</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {(['light', 'dark'] as const).map((t) => (
            <div key={t} className={`${t} space-y-2 rounded-2xl bg-mist p-3 text-stone-800`}>
              <p className="hud">{t === 'light' ? '☀️ Light' : '🌙 Dark'}</p>
              <div className="card flex items-center gap-3">
                <span className="min-w-0 flex-1"><VerdictChip verdict="safe" /><span className="mt-0.5 block truncate text-sm font-medium text-stone-900">Duke Energy bill</span></span>
                <ScoreRing score={6} verdict="safe" size={44} />
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section id="feel">
        <p>The app is made to feel smooth on a phone. The <b>tabs at the top</b> slide sideways if they don’t all fit, and a glowing bar slides under the one you’re on. Every button <b>sinks a little and glows</b> when you tap it, then springs back. Choices like <b>📖 Read one / 🔀 Compare</b> have a glass marker that slides to the one you pick, and folds open and close gently.</p>
        <p>While something is being checked you see <b>shimmering grey lines</b> where the answer will appear. An empty page shows a small glowing circle with what to do next. Each answer always says <b>✅ Looks safe</b>, <b>⚠️ Suspicious</b> or <b>🚨 Likely scam</b> in words, next to its colour and score ring.</p>
        <p>If your phone is set to <b>reduce motion</b>, all of this movement stops; everything still works the same.</p>
        <p className="text-xs text-stone-500">Examples (made up; the choices only move the marker here):</p>
        <FeelDemo />
      </Section>

      <Section id="sync">
        <p>Your phone (the app) and your computer (the website) show the <b>same</b> things: <b>🕘 History</b> (your last 100 checks), <b>🎬 video checks</b>, <b>🏢 recent companies</b>, <b>⭐ Saved</b>, <b>📅 Bills</b>, your <b>trusted / blocked</b> lists, <b>Settings</b> and today’s AI checks left. A check made on one shows on the other when you open the app again or switch back to it. Deleting one deletes it on both.</p>
        <p>Only a few things stay per device: light or dark look, text size, and the access code.</p>
        <p>The first time each device opens this version, the checks it had before are added to the shared list, so nothing is lost.</p>
      </Section>

      <Section id="myapps">
        <p>Your <b>“My apps”</b> page (the one that shows all your apps on one screen) has a card for Scam Check: how many checks today, the last answer, how many likely scams this week, and how many AI checks were used today, this week and this month, with what Claude cost.</p>
        <p>It asks with your <b>same access code</b>, and only that page may ask; it can only read, never change anything. The cost is an <b>estimate</b> (a few cents per Claude check, depending on the model picked in Settings); the free AIs count as $0. The week and month numbers count from Oct 16, 2026, when the app started keeping each day’s AI count.</p>
        <p className="text-xs text-stone-500">Example (made up):</p>
        <MyAppsDemo />
      </Section>

      <Section id="tidy">
        <p><b>Fold:</b> anything with a <b>▾</b> opens and closes when you tap its title. In <b>⚙️ Settings</b> every section starts <b>closed</b>, so the page stays short: tap the one you need, or <b>▾ Open all</b> / <b>▴ Close all</b>. In a result, <b>Why</b> and <b>Found in the message</b> start closed too (What to do stays open).</p>
        <p><b>Delete:</b> tap <b>🗑</b> to delete any check, everywhere it shows:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li><b>🛡️ Check</b> and <b>🕘 History:</b> 🗑 next to each check, or <b>🗑 Delete all</b> in History (also in Settings → This device). It’s removed from <b>all your devices and the server</b>, so checking the same message again starts fresh.</li>
          <li><b>🎬 Video:</b> open a video check → <b>🗑 Delete this video check</b>, or <b>🗑 Delete all</b> above the list.</li>
          <li><b>🏢 Look up:</b> ✕ / 🗑 next to a recent company, <b>🗑 Delete this look-up</b> under a result, or <b>🗑 Delete all</b>.</li>
          <li><b>⭐ Saved</b> and <b>📅 Bills</b> have their own 🗑. Deleting a check in History doesn’t touch its ⭐ saved copy.</li>
        </ul>
        <p className="text-xs text-stone-500">Example (made up; tap the title to open and close it):</p>
        <Fold label="Why" subtitle="2 things checked · tap to see">
          <p className="text-sm text-stone-700">✗ Pretends to be USPS but the website is usps-help.top</p>
          <p className="text-sm text-stone-700">! The website is 3 days old</p>
        </Fold>
        <div className="flex items-stretch gap-2">
          <div className="card flex min-w-0 flex-1 items-center gap-3"><ScoreRing score={92} verdict="scam" size={40} /><span className="min-w-0"><VerdictChip verdict="scam" /><span className="mt-0.5 block truncate text-sm">USPS package text</span></span></div>
          <span className="card flex w-12 shrink-0 items-center justify-center !p-0 text-lg text-stone-500" aria-hidden="true">🗑</span>
        </div>
      </Section>

      <Section id="settings">
        <p>Everything is set in the <b>⚙️ Settings</b> tab, and it’s the same on your phone and computer. Each section starts closed: tap its title to open it.</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li><b>🤖 AI:</b> which AI (Claude or Gemini, free), when to use it (Save credits, Smart, Always, Never), which AI model (Opus = best, Sonnet = cheaper, Haiku = cheapest), how many AI checks a day or <b>Unlimited</b>, how hard it thinks (Low is cheapest), and the summary of safe ones.</li>
          <li><b>🔎 Free checks:</b> Google’s list of dangerous sites, how new a website is, and how many days a result is remembered (checking it again is then free).</li>
          <li><b>📷 Pictures:</b> picture size (Small is cheaper, Sharp reads tiny text better) and how many at once.</li>
          <li><b>⭐ Saving & clean-up:</b> keep the original by default, and the automatic clean-up.</li>
          <li><b>📱 This device:</b> ☀️ light or 🌙 dark look, bigger text, forget the access code.</li>
        </ul>
        <p>The secret keys (the AI key, storage, access code) stay in Vercel and are never shown. The Vercel variables <code>AI_MODEL</code> and <code>AI_DAILY_LIMIT</code> are only the starting values: what you pick in Settings wins. <b>↺ Starting values</b> puts everything back.</p>
      </Section>

      <Section id="bills">
        <p>Take a photo of a bill, or upload the PDF or a screenshot. The AI reads it, then the links and phone numbers in it are checked too. Fake invoices ("your Norton subscription renewed for $399, call to cancel") are very common.</p>
        <p>Without the AI, pictures can’t be read: you’ll see <b>❔ Not checked</b>. Paste the words instead and the free checks still work.</p>
      </Section>

      <Section id="share">
        <p>Add the app to your home screen (in Chrome: ⋮ → Install app). Then, in Messages or WhatsApp, long-press a message → <b>Share</b> → <b>Scam Check</b>: it opens on Check with the message shown in a card, ready to check.</p>
        <p>Share a <b>YouTube or TikTok</b> video to the app and it opens the <b>🎬 Video</b> tab and checks it.</p>
      </Section>

      <Section id="iphone">
        <p>There is no App Store app (Apple needs a paid developer account and a Mac for that), but on an iPhone the website works like an app:</p>
        <ol className="list-decimal space-y-1.5 pl-5">
          <li>Open <b>scamcheck-anis.vercel.app</b> in <b>Safari</b>.</li>
          <li>Tap the <b>Share</b> button (the square with an arrow) → <b>Add to Home Screen</b> → <b>Add</b>.</li>
          <li>Open <b>Scam Check</b> from its new icon: it opens full screen, without Safari’s bars. Enter your access code once.</li>
        </ol>
        <p>Everything works the same (Check, Video, Look up, Saved, dark mode…) and it shares your saved checks, settings and AI limit. The one thing an iPhone doesn’t allow for websites is <b>Share → Scam Check</b> from other apps: save the screenshot or recording first, then add it in Scam Check.</p>
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
          <li>Your History (the results, with the first words of each message as a preview) is kept on the server so your phone and computer show the same, until you delete it (the last 100). The answer used to reply instantly to the same message is kept 7 days to start (Settings → Remember results). The whole message and picture are not stored, unless you ⭐ save the check with “Keep the original”.</li>
          <li>Pictures are made smaller on your phone before upload. They are only kept if you save the check with “Keep the original”.</li>
          <li>The AI has a daily limit (5 to start, change it in Settings) and is asked for short answers to keep each check cheap. When it’s used up, you still get the free checks.</li>
          <li>No check is perfect. When in doubt, contact the company yourself using its official app, website or the number on your card.</li>
        </ul>
      </Section>
    </Shell>
  );
}
