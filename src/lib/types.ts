/** Shared between the app and the server functions (api/). */

export type Kind = 'email' | 'text' | 'bill' | 'screenshot';
export type Verdict = 'safe' | 'suspicious' | 'scam';
export type Source = 'pattern' | 'link' | 'phone' | 'sender' | 'ai';
export type AiState = 'off' | 'pending' | 'done' | 'failed' | 'limit' | 'skipped';
/**
 * ask (default, saves AI credit): photos and PDFs automatically, text only when you tap "Ask the AI".
 * smart: also text when the free checks aren't sure. always / never. Per device, in Settings.
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

/** 0-29 safe, 30-64 suspicious, 65+ likely scam. */
export const verdictOf = (score: number): Verdict => (score >= 65 ? 'scam' : score >= 30 ? 'suspicious' : 'safe');

/** A check you saved (⭐): only the key facts, kept on the server until you delete it. Never the full message or picture. */
export interface SavedItem {
  id: string;
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
}
