/** Shared between the app and the server functions (api/). */

export type Kind = 'email' | 'text' | 'bill' | 'screenshot' | 'qr' | 'voicemail';
export type Verdict = 'safe' | 'suspicious' | 'scam';
export type Source = 'pattern' | 'link' | 'phone' | 'sender' | 'list' | 'ai';
export type AiState = 'off' | 'pending' | 'done' | 'failed' | 'limit' | 'skipped';
/**
 * ask (default, saves AI credit): photos and PDFs automatically, text only when you tap "Ask the AI".
 * smart: also text when the free checks aren't sure. always / never. In Settings.
 */
export type AiMode = 'ask' | 'smart' | 'always' | 'never';

/** One reason for (or against) the verdict. weight > 0 adds risk, < 0 is a good sign. */
export interface Signal {
  source: Source;
  level: 'bad' | 'warn' | 'good' | 'info';
  title: string;
  detail?: string;
  weight: number;
  hard?: boolean; // a certain sign on its own (e.g. Google lists the link as dangerous)
}

export interface LinkInfo { url: string; domain: string; level: Signal['level']; note: string; age?: string }
export interface PhoneInfo { number: string; level: Signal['level']; note: string }
export interface SenderInfo { name?: string; address?: string; replyTo?: string; subject?: string; auth?: string }

export interface CheckResult {
  id: string;
  kind: Kind;
  verdict: Verdict;
  score: number; // 0 (no risk) to 100
  summary: string;
  signals: Signal[];
  links: LinkInfo[];
  phones: PhoneInfo[];
  sender?: SenderInfo;
  impersonating?: string;
  whatToDo: string[];
  ai: AiState;
  aiNote?: string;
  unchecked?: boolean; // a picture or PDF that couldn't be read (no AI): no verdict
  aiOffer?: boolean; // the free checks weren't sure: the app offers an "Ask the AI" button
  briefOffer?: boolean; // safe, but no AI yet: the app offers a "Summarize" button (1 AI check)
  brief?: Brief; // safe ones only: what it is, key info, what to do (from the same AI call)
  bill?: BillFacts; // a safe bill: who, how much, when (from the AI) -> 📅 Bills
  billCompare?: BillCompare; // the same company's previous bill
  remembered?: boolean; // this answer was remembered from an earlier check (free): ↻ Re-check asks again
  aiBy?: string; // which AI answered, e.g. "Gemini (free)" or "Claude Opus 5.5"
  aiTried?: string; // the model that failed or was over its daily limit (same naming as aiBy)
  title?: string; // who or what it is, in a few words (from the AI), e.g. "Duke Energy bill": used to name saved checks
  preview: string; // the start of the message, for the history list
  checkedAt: string;
}

export const VERDICT_LABEL: Record<Verdict, { icon: string; text: string }> = {
  safe: { icon: '✅', text: 'Looks safe' },
  suspicious: { icon: '⚠️', text: 'Suspicious' },
  scam: { icon: '🚨', text: 'Likely scam' },
};

export const KIND_LABEL: Record<Kind, { icon: string; text: string; hint: string }> = {
  email: { icon: '✉️', text: 'Email', hint: 'Paste the email, or upload the .eml file (best: it includes the hidden sender details).' },
  text: { icon: '💬', text: 'Text', hint: 'Paste the text message (SMS, WhatsApp, Facebook…) and, if you have it, the number it came from.' },
  bill: { icon: '🧾', text: 'Bill', hint: 'Take a photo of the bill or invoice, or upload the PDF.' },
  screenshot: { icon: '📱', text: 'Screenshot', hint: 'Upload a screenshot of the message, pop-up or website.' },
  voicemail: { icon: '🎙️', text: 'Voicemail', hint: 'A voicemail or a recorded call (MP3, M4A, WAV…). The AI listens to what the caller says and asks for: Gemini directly, the others after Groq turns it into words (free). Up to 3 minutes.' },
  qr: { icon: '🔳', text: 'QR code', hint: 'Take a photo of the QR code (parking meter, letter, flyer). It is read on your phone, for free, and its link is checked without opening it.' },
};

/** A bill's key numbers (safe bills only). dueDate is YYYY-MM-DD or empty. */
export interface BillFacts { company: string; amount: number; dueDate: string; account?: string }
/** One bill in 📅 Bills. key = company + due date, so the same bill checked twice counts once. */
export interface Bill extends BillFacts { key: string; id: string; checkedAt: string; paid?: boolean }
export interface BillCompare { prevAmount: number; prevDue: string; prevCheckedAt: string; change: number } // change in %

/** ✅ Trusted / 🚫 Blocked: phone numbers, email addresses and websites you know. */
export type ListKind = 'phone' | 'email' | 'domain';
export interface ListEntry { key: string; kind: ListKind; value: string; list: 'trusted' | 'blocked'; addedAt: string }

/** For safe messages and documents: a short, plain summary. Never made for suspicious or scam ones (saves AI credit). */
export interface Brief {
  whatItIs: string;
  keyInfo: { label: string; value: string }[];
  steps: string[];
}

/**
 * What you see: a safety score from 1 (extremely bad) to 10 (pretty safe), from the risk score (0-100) used inside.
 * It always agrees with the answer: looks safe = 8-10, suspicious = 4-7, likely scam = 1-3.
 */
export function safetyOf(risk: number): number {
  if (risk < 30) return risk < 10 ? 10 : risk < 20 ? 9 : 8;
  if (risk < 65) return risk < 39 ? 7 : risk < 48 ? 6 : risk < 57 ? 5 : 4;
  return risk < 77 ? 3 : risk < 89 ? 2 : 1;
}

/** 0-29 safe, 30-64 suspicious, 65+ likely scam. */
export const verdictOf = (score: number): Verdict => (score >= 65 ? 'scam' : score >= 30 ? 'suspicious' : 'safe');

/** A check you saved (⭐): only the key facts, kept on the server until you delete it. Never the full message or picture. */
export interface SavedItem {
  id: string;
  name?: string; // "1-Duke Energy": a number that goes up with each save, then what it is
  savedAt: string;
  checkedAt: string;
  note: string;
  kind: Kind;
  verdict: Verdict;
  unchecked?: boolean;
  score: number;
  summary: string;
  impersonating?: string;
  sender?: { name?: string; address?: string };
  links: { domain: string; note: string; level: Signal['level'] }[];
  phones: { number: string; note: string; level: Signal['level'] }[];
  reasons: string[];
  whatToDo: string[];
  excerpt: string;
  brief?: Brief;
  aiBy?: string; // which AI checked it (none = free checks only)
  text?: string; // the original message, when you chose to keep it
  file?: { mime: string; name: string; size: number }; // a kept picture or PDF (the file itself: GET /api/file?id=…)
}

/** The AI models you can pick in Settings (cheapest last). */
export const MODELS: { id: string; name: string; hint: string }[] = [
  { id: 'claude-opus-5-5', name: 'Claude Opus 5.5', hint: 'The best at spotting tricky scams. Costs the most (a few cents a check).' },
  { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5', hint: 'Very good, and cheaper.' },
  { id: 'claude-haiku-5-5', name: 'Claude Haiku 5.5', hint: 'The fastest and cheapest. Can miss clever scams.' },
];
export type Effort = 'low' | 'medium' | 'high';
export type Provider = 'claude' | 'gemini' | 'groq' | 'openrouter';
/** The free AIs that speak the OpenAI way (one shared client, server/openai.ts). */
export type FreeProvider = 'groq' | 'openrouter';
/** A model picked for one ↻ Re-check. */
export interface ModelChoice { provider: Provider; id: string }
/** Google's Gemini models (free with a key from Google AI Studio, within Google's own daily limits). */
export const GEMINI_MODELS: { id: string; name: string; hint: string }[] = [
  { id: 'gemini-pro-latest', name: 'Gemini Pro', hint: 'Google’s biggest and most careful model. Its free allowance is small: when it runs out, Gemini Flash takes over by itself.' },
  { id: 'gemini-flash-latest', name: 'Gemini Flash', hint: 'Good at reading screenshots and texts. Free within Google’s daily limit.' },
  { id: 'gemini-flash-lite-latest', name: 'Gemini Flash-Lite', hint: 'Faster, with a bigger free allowance, but less careful.' },
];

/** Server settings (Settings tab): the same on the phone and the computer. They win over the Vercel variables. */
export interface AppSettings {
  ai: {
    mode: AiMode;
    model: string;
    dailyLimit: number; // AI checks a day (starts from AI_DAILY_LIMIT)
    unlimited: boolean;
    effort: Effort; // how hard the AI thinks: more = a bit better, slower and dearer
    summaries: boolean; // the short summary of safe ones
    provider: Provider; // which AI checks things: Claude (paid) or Gemini (free)
    geminiModel: string;
    geminiDailyLimit: number; // Gemini checks a day (kept under Google's free allowance)
    privateToClaude: boolean; // no longer used (the owner removed the switch): the picked model checks everything
    freeModels: Record<FreeProvider, string>; // the model picked for each of the other free AIs
    freeDailyLimit: number; // checks a day for each of Groq and OpenRouter
  };
  checks: {
    safeBrowsing: boolean; // Google's list of dangerous sites (needs GOOGLE_SAFE_BROWSING_KEY)
    websiteAge: boolean; // how new a website is
    rememberDays: number; // the same message is answered again for free for this many days
  };
  pictures: { maxSize: number; maxBatch: number }; // picture size sent to the AI (px), pictures at once
  saving: { keepOriginal: boolean }; // "Keep the original" ticked by default
  bills: { track: boolean }; // safe bills go to 📅 Bills (due dates, compared to last time)
  cleanup: { enabled: boolean; days: number; what: 'files' | 'all' }; // auto clean-up of ⭐ Saved
  place: { zip: string }; // 📍 your ZIP code: look-ups, scam news and checks think of your area
}
export const DEFAULT_SETTINGS: AppSettings = {
  ai: { mode: 'ask', model: 'claude-opus-5-5', dailyLimit: 5, unlimited: false, effort: 'low', summaries: true, provider: 'claude', geminiModel: 'gemini-flash-latest', geminiDailyLimit: 50, privateToClaude: false, freeModels: { groq: 'meta-llama/llama-4-maverick-17b-128e-instruct', openrouter: 'meta-llama/llama-4-maverick:free' }, freeDailyLimit: 50 },
  checks: { safeBrowsing: true, websiteAge: true, rememberDays: 7 },
  pictures: { maxSize: 1400, maxBatch: 10 },
  saving: { keepOriginal: true },
  bills: { track: true },
  cleanup: { enabled: false, days: 90, what: 'files' },
  place: { zip: '45245' },
};

/** "$1,234.50" */
export const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

/** A model in the list: can it read pictures (screenshots, bills) and PDFs? */
export interface ModelInfo { id: string; name: string; hint: string; pictures: boolean; pdf: boolean }
/** Every AI you can pick (Settings → AI model, ↻ Re-check). Each needs its own key in Vercel. */
export const PROVIDERS: { id: Provider; name: string; paid: boolean; env: string; about: string; models: ModelInfo[] }[] = [
  { id: 'claude', name: 'Claude', paid: true, env: 'ANTHROPIC_API_KEY', about: 'By Anthropic: the best at tricky scams, a few cents a check. What you send is not used to train it.', models: MODELS.map((m) => ({ ...m, pictures: true, pdf: true })) },
  { id: 'gemini', name: 'Gemini', paid: false, env: 'GEMINI_API_KEY', about: 'By Google: free within Google’s daily allowance. On the free plan Google may keep and use what you send.', models: GEMINI_MODELS.map((m) => ({ ...m, pictures: true, pdf: true })) },
  { id: 'groq', name: 'Groq', paid: false, env: 'GROQ_API_KEY', about: 'Very fast and free (console.groq.com). Runs Meta’s Llama 4 and OpenAI’s open model gpt-oss. No PDFs.', models: [
    { id: 'meta-llama/llama-4-maverick-17b-128e-instruct', name: 'Llama 4 Maverick', hint: 'Meta’s bigger Llama 4. Reads screenshots.', pictures: true, pdf: false },
    { id: 'openai/gpt-oss-120b', name: 'GPT-OSS 120B', hint: 'OpenAI’s open model. Texts and emails only (no pictures).', pictures: false, pdf: false },
    { id: 'meta-llama/llama-4-scout-17b-16e-instruct', name: 'Llama 4 Scout', hint: 'Smaller and faster. Reads screenshots.', pictures: true, pdf: false },
  ] },
  { id: 'openrouter', name: 'OpenRouter', paid: false, env: 'OPENROUTER_API_KEY', about: 'One key for many free models (openrouter.ai). Free ones can be slow or busy, and come and go. No PDFs.', models: [
    { id: 'meta-llama/llama-4-maverick:free', name: 'Llama 4 Maverick (free)', hint: 'Reads screenshots.', pictures: true, pdf: false },
    { id: 'deepseek/deepseek-chat-v3.1:free', name: 'DeepSeek V3.1 (free)', hint: 'Strong for texts and emails (no pictures).', pictures: false, pdf: false },
    { id: 'openai/gpt-oss-120b:free', name: 'GPT-OSS 120B (free)', hint: 'OpenAI’s open model. Texts and emails only.', pictures: false, pdf: false },
  ] },
];
export const providerOf = (p: Provider) => PROVIDERS.find((x) => x.id === p)!;
/** The model picked for an AI in Settings. */
export const modelFor = (ai: AppSettings['ai'], p: Provider): string => (p === 'claude' ? ai.model : p === 'gemini' ? ai.geminiModel : ai.freeModels?.[p] ?? DEFAULT_SETTINGS.ai.freeModels[p]);
/** The Settings change that picks a model. */
export const pickModel = (ai: AppSettings['ai'], p: Provider, id: string): Partial<AppSettings['ai']> =>
  p === 'claude' ? { provider: p, model: id } : p === 'gemini' ? { provider: p, geminiModel: id } : { provider: p, freeModels: { ...DEFAULT_SETTINGS.ai.freeModels, ...ai.freeModels, [p]: id } };
/** "Llama 4 Maverick (Groq, free)" */
export function modelName(p: Provider, id: string): string {
  const pr = providerOf(p);
  const m = pr.models.find((x) => x.id === id);
  if (p === 'claude') return m?.name ?? id;
  if (p === 'gemini') return `${m?.name ?? id} (free)`;
  return `${m?.name ?? id} (${pr.name}, free)`;
}

/** 🎬 Video: is it true? */
export type FactVerdict = 'true' | 'mostly-true' | 'mixed' | 'misleading' | 'false' | 'unverifiable' | 'opinion';
export const FACT_LABEL: Record<FactVerdict, { icon: string; text: string; tone: 'good' | 'warn' | 'bad' | 'info' }> = {
  true: { icon: '✅', text: 'True', tone: 'good' },
  'mostly-true': { icon: '✅', text: 'Mostly true', tone: 'good' },
  mixed: { icon: '⚖️', text: 'Partly true', tone: 'warn' },
  misleading: { icon: '⚠️', text: 'Misleading', tone: 'warn' },
  false: { icon: '❌', text: 'False', tone: 'bad' },
  unverifiable: { icon: '❔', text: 'Can’t be checked', tone: 'info' },
  opinion: { icon: '💬', text: 'Opinion or entertainment', tone: 'info' },
};
export interface VideoResult {
  id: string;
  status: 'pending' | 'done' | 'failed';
  from: 'upload' | 'youtube' | 'tiktok';
  label: string; // the file name or the link
  checkedAt: string;
  verdict?: FactVerdict;
  title?: string; // what the video is, in a few words
  summary?: string; // 2-3 short sentences, simple words
  claims?: { claim: string; verdict: FactVerdict; why: string }[];
  aiSigns?: string; // signs it is AI-made or edited, if any
  sources?: { title: string; url: string }[];
  aiBy?: string;
  note?: string;
  error?: string;
  tried?: string; // the model that failed (same naming as aiBy)
}

/** 🏢 Look up: a company's real contact details (from a live Google search, with sources). */
export interface CompanyInfo {
  name: string;
  whatTheyDo: string;
  website?: { url: string; domain: string; level: Signal['level']; note: string };
  phones: { label: string; number: string; note?: string; level?: Signal['level'] }[];
  emails: { label: string; email: string }[];
  contactPage?: string;
  hours?: string;
  address?: string;
  scamWarning?: string; // common scams that pretend to be this company
  nearYou?: { place: string; address: string; phone?: string; phoneNote?: string; phoneLevel?: Signal['level']; hours?: string; zip: string }; // 📍 closest branch to your ZIP code
  sources: { title: string; url: string }[];
  aiBy?: string;
  note?: string;
  checkedAt: string;
  remembered?: boolean;
}

/** 📄 Docs: a document read by the AI (summary, key points, red flags, to-dos), or two versions compared. */
export type DocLevel = 'high' | 'medium' | 'low';
export interface DocResult {
  id: string;
  status: 'pending' | 'done' | 'failed';
  mode: 'analyze' | 'compare' | 'seo';
  label: string; // the file name, "old.pdf → new.pdf", or the website address
  checkedAt: string;
  title?: string; // what it is, in a few words
  docType?: string; // e.g. "Lease", "Insurance policy", "Job offer"
  summary?: string;
  keyPoints?: string[];
  redFlags?: { issue: string; why: string; level: DocLevel; quote?: string }[];
  actions?: { task: string; when?: string }[];
  dates?: { what: string; when: string }[];
  changes?: { what: string; before?: string; after?: string; impact: 'better' | 'worse' | 'neutral' }[]; // compare only
  seo?: SeoReport; // 🌐 website SEO only
  aiBy?: string;
  note?: string;
  error?: string;
  tried?: string;
  remembered?: boolean;
}

/** 📰 Scams going around now (from this week's news, made when asked). */
export interface ScamNews { items: { name: string; how: string; tell: string; who?: string; local?: boolean }[]; sources: { title: string; url: string }[]; aiBy?: string; zip?: string; checkedAt: string }

/** 🌐 Website SEO: what was read on the page (free) and the AI's view (content, keywords, competitors). */
export type SeoLevel = 'high' | 'medium' | 'low';
export interface SeoReport {
  url: string; // the address after redirects
  score: number; // 0-100
  fetchedMs: number;
  sizeKb: number;
  meta: { title: string; description: string; canonical?: string; robots?: string; viewport: boolean; lang?: string; ogTitle?: string; ogDescription?: string; ogImage?: string; twitterCard?: string; schema: string[]; favicon: boolean };
  headings: { level: number; text: string }[];
  stats: { words: number; images: number; imagesNoAlt: number; linksInternal: number; linksExternal: number; https: boolean; robotsTxt: boolean; sitemap: boolean };
  issues: { level: SeoLevel; what: string; fix: string }[]; // from the free checks
  content?: { score: number; summary: string; strengths: string[]; weaknesses: string[] };
  keywords?: { keyword: string; why: string; where: string }[];
  competitors?: { site: string; note: string }[];
  gaps?: { gap: string; action: string }[];
  topFixes?: string[];
}

