import { z } from 'zod';
import type { AppSettings } from '../src/lib/types.js';
import { Answer, SYSTEM, promptText, type AiAnswer, type AiInput } from './ai.js';

/**
 * Google Gemini (Settings → AI → Gemini): free with a key from Google AI Studio (GEMINI_API_KEY in Vercel), within
 * Google's daily allowance. Same instructions and the same answer shape as Claude, so everything after it
 * (mixing with the free checks, never hiding a strong warning) is unchanged. Plain HTTPS, no extra library.
 */
/** The answer, and the Gemini model that gave it (Flash when Pro's free allowance ran out). */
export type GeminiAnswer = AiAnswer & { model: string; fallback?: string }; // fallback: why Pro wasn't used

export async function askGemini(input: AiInput, cfg: AppSettings['ai']): Promise<GeminiAnswer> {
  try {
    return { ...(await askModel(input, cfg, cfg.geminiModel)), model: cfg.geminiModel };
  } catch (e) {
    // Pro's free allowance is small (or not offered on some accounts): Flash takes over.
    if (!/pro/i.test(cfg.geminiModel) || !(e instanceof GeminiError) || ![429, 403, 404].includes(e.status)) throw e;
    const why = e.status === 429 ? 'its free allowance is used up for now' : e.status === 404 ? 'Google doesn’t offer it under this name' : 'your Google key can’t use it for free';
    return { ...(await askModel(input, cfg, FLASH)), model: FLASH, fallback: why };
  }
}

const FLASH = 'gemini-flash-latest';
class GeminiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

async function askModel(input: AiInput, cfg: AppSettings['ai'], model: string): Promise<AiAnswer> {
  const parts: Record<string, unknown>[] = [];
  if (input.file) parts.push({ inline_data: { mime_type: input.file.mime, data: input.file.data } });
  parts.push({ text: promptText(input, cfg) });
  const schema = z.toJSONSchema(Answer) as Record<string, unknown>;
  delete schema.$schema;
  const body = (withSchema: boolean) => JSON.stringify({
    system_instruction: { parts: [{ text: `${SYSTEM}\n\nAnswer with JSON only.${withSchema ? '' : ` It must match this JSON schema:\n${JSON.stringify(schema)}`}` }] },
    contents: [{ role: 'user', parts }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 4000, responseMimeType: 'application/json', ...(withSchema ? { responseJsonSchema: schema } : {}) },
    // Scam messages talk about money and threats: only block truly harmful answers.
    safetySettings: ['HARM_CATEGORY_HARASSMENT', 'HARM_CATEGORY_HATE_SPEECH', 'HARM_CATEGORY_SEXUALLY_EXPLICIT', 'HARM_CATEGORY_DANGEROUS_CONTENT'].map((category) => ({ category, threshold: 'BLOCK_ONLY_HIGH' })),
  });
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const send = (withSchema: boolean) => fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY!.trim() },
    body: body(withSchema),
    signal: AbortSignal.timeout(50_000),
  });
  let res = await send(true);
  // An older model that doesn't take a schema: ask again with the schema written in the instructions.
  if (res.status === 400 && /schema/i.test(await res.clone().text())) res = await send(false);
  const j = (await res.json().catch(() => ({}))) as { error?: { message?: string; status?: string }; candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[] };
  if (!res.ok) {
    const msg = j.error?.message ?? `HTTP ${res.status}`;
    throw new GeminiError(res.status === 429 ? 'Gemini’s free daily allowance is used up (try again later or tomorrow)' : `Gemini: ${msg.slice(0, 140)}`, res.status);
  }
  const text = (j.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('').trim();
  if (!text) throw new Error(`Gemini gave no answer (${j.candidates?.[0]?.finishReason ?? 'empty'})`);
  let raw: unknown;
  try {
    raw = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ''));
  } catch {
    throw new Error('Gemini’s answer could not be read');
  }
  return loose(raw);
}

/** Gemini's JSON, made safe: anything missing or of the wrong type gets an empty value. */
function loose(raw: unknown): AiAnswer {
  const ok = Answer.safeParse(raw);
  if (ok.success) return ok.data;
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);
  const arr = (v: unknown) => (Array.isArray(v) ? v : []);
  const obj = (v: unknown) => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});
  const verdict = ['safe', 'suspicious', 'scam'].includes(str(o.verdict)) ? (str(o.verdict) as AiAnswer['verdict']) : 'suspicious';
  const brief = obj(o.brief);
  const bill = obj(o.bill);
  return {
    verdict,
    confidence: Math.max(0, Math.min(100, num(o.confidence))),
    summary: str(o.summary),
    redFlags: arr(o.redFlags).map((r) => ({ title: str(obj(r).title), detail: str(obj(r).detail) })).filter((r) => r.title),
    goodSigns: arr(o.goodSigns).map(str).filter(Boolean),
    title: str(o.title),
    impersonating: str(o.impersonating),
    whatToDo: arr(o.whatToDo).map(str).filter(Boolean),
    brief: { whatItIs: str(brief.whatItIs), keyInfo: arr(brief.keyInfo).map((k) => ({ label: str(obj(k).label), value: str(obj(k).value) })), steps: arr(brief.steps).map(str).filter(Boolean) },
    bill: { isBill: bill.isBill === true, company: str(bill.company), amount: num(bill.amount), dueDate: str(bill.dueDate), account: str(bill.account) },
    readText: str(o.readText),
    links: arr(o.links).map(str).filter(Boolean),
    phones: arr(o.phones).map(str).filter(Boolean),
  };
}
