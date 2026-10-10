/** Shared between the app and the server functions (api/). */

export type Kind = 'email' | 'text' | 'bill' | 'screenshot';
export type Verdict = 'safe' | 'suspicious' | 'scam';
export type Source = 'pattern' | 'link' | 'phone' | 'sender' | 'ai';
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
};

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

/** Server settings (Settings tab): the same on the phone and the computer. They win over the Vercel variables. */
export interface AppSettings {
  ai: {
    mode: AiMode;
    model: string;
    dailyLimit: number; // AI checks a day (starts from AI_DAILY_LIMIT)
    unlimited: boolean;
    effort: Effort; // how hard the AI thinks: more = a bit better, slower and dearer
    summaries: boolean; // the short summary of safe ones
  };
  checks: {
    safeBrowsing: boolean; // Google's list of dangerous sites (needs GOOGLE_SAFE_BROWSING_KEY)
    websiteAge: boolean; // how new a website is
    rememberDays: number; // the same message is answered again for free for this many days
  };
  pictures: { maxSize: number; maxBatch: number }; // picture size sent to the AI (px), pictures at once
  saving: { keepOriginal: boolean }; // "Keep the original" ticked by default
  cleanup: { enabled: boolean; days: number; what: 'files' | 'all' }; // auto clean-up of ⭐ Saved
}
export const DEFAULT_SETTINGS: AppSettings = {
  ai: { mode: 'ask', model: 'claude-opus-5-5', dailyLimit: 5, unlimited: false, effort: 'low', summaries: true },
  checks: { safeBrowsing: true, websiteAge: true, rememberDays: 7 },
  pictures: { maxSize: 1400, maxBatch: 10 },
  saving: { keepOriginal: true },
  cleanup: { enabled: false, days: 90, what: 'files' },
};
