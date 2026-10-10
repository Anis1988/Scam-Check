/** Shared between the app and the server functions (api/). */

export type Kind = 'email' | 'text' | 'bill' | 'screenshot' | 'qr';
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
  aiBy?: string; // which AI answered, e.g. "Gemini (free)" or "Claude Opus 5.5"
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
export type Provider = 'claude' | 'gemini';
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
}
export const DEFAULT_SETTINGS: AppSettings = {
  ai: { mode: 'ask', model: 'claude-opus-5-5', dailyLimit: 5, unlimited: false, effort: 'low', summaries: true, provider: 'claude', geminiModel: 'gemini-flash-latest', geminiDailyLimit: 50, privateToClaude: false },
  checks: { safeBrowsing: true, websiteAge: true, rememberDays: 7 },
  pictures: { maxSize: 1400, maxBatch: 10 },
  saving: { keepOriginal: true },
  bills: { track: true },
  cleanup: { enabled: false, days: 90, what: 'files' },
};

/** "$1,234.50" */
export const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
