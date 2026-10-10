/** Shared between the app and the server functions (api/). */

export type Kind = 'email' | 'text' | 'bill' | 'screenshot';
export type Verdict = 'safe' | 'suspicious' | 'scam';
export type Source = 'pattern' | 'link' | 'phone' | 'sender' | 'ai';
export type AiState = 'off' | 'pending' | 'done' | 'failed' | 'limit' | 'skipped';
/** Smart: AI only when the free checks aren't already sure. Always / never: per device, in Settings. */
export type AiMode = 'smart' | 'always' | 'never';

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

/** 0-29 safe, 30-64 suspicious, 65+ likely scam. */
export const verdictOf = (score: number): Verdict => (score >= 65 ? 'scam' : score >= 30 ? 'suspicious' : 'safe');
