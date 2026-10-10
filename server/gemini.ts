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

/** An AI's JSON, made safe: anything missing or of the wrong type gets an empty value (Gemini, Groq, Mistral…). */
export function loose(raw: unknown): AiAnswer {
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

/** A web page the answer is based on (from Google Search). */
export interface Source { title: string; url: string }

/**
 * Gemini with live Google Search (🎬 Video, 🏢 Look up): the answer is based on today's web, with its sources.
 * parts: a video (file or YouTube link) and/or words. Returns Gemini's text (JSON asked in the instructions),
 * the sources, and the model that answered (Flash takes over when Pro isn't available).
 */
export async function geminiSearch(parts: Record<string, unknown>[], instructions: string, cfg: AppSettings['ai'], video = false): Promise<{ text: string; sources: Source[]; model: string; fallback?: string }> {
  const call = async (model: string) => {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY!.trim() },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: instructions }] },
        contents: [{ role: 'user', parts }],
        tools: [{ google_search: {} }],
        // Videos: fewer details per frame keeps long videos inside the free allowance.
        generationConfig: { temperature: 0.2, maxOutputTokens: 6000, ...(video ? { mediaResolution: 'MEDIA_RESOLUTION_LOW' } : {}) },
      }),
      signal: AbortSignal.timeout(240_000),
    });
    const j = (await res.json().catch(() => ({}))) as {
      error?: { message?: string };
      candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string; groundingMetadata?: { groundingChunks?: { web?: { uri?: string; title?: string } }[] } }[];
    };
    if (!res.ok) throw new GeminiError(res.status === 429 ? 'Gemini’s free daily allowance is used up (try again later or tomorrow)' : `Gemini: ${(j.error?.message ?? `HTTP ${res.status}`).slice(0, 160)}`, res.status);
    const c = j.candidates?.[0];
    const text = (c?.content?.parts ?? []).map((p) => p.text ?? '').join('').trim();
    if (!text) throw new Error(`Gemini gave no answer (${c?.finishReason ?? 'empty'})`);
    const seen = new Set<string>();
    const sources = (c?.groundingMetadata?.groundingChunks ?? [])
      .map((g) => ({ title: (g.web?.title ?? '').slice(0, 120), url: g.web?.uri ?? '' }))
      .filter((s) => /^https:\/\//.test(s.url) && !seen.has(s.title + s.url) && (seen.add(s.title + s.url), true))
      .slice(0, 8);
    return { text, sources };
  };
  try {
    return { ...(await call(cfg.geminiModel)), model: cfg.geminiModel };
  } catch (e) {
    if (!/pro/i.test(cfg.geminiModel) || !(e instanceof GeminiError) || ![429, 403, 404].includes(e.status)) throw e;
    const why = e.status === 429 ? 'its free allowance is used up for now' : e.status === 404 ? 'Google doesn’t offer it under this name' : 'your Google key can’t use it for free';
    return { ...(await call(FLASH)), model: FLASH, fallback: why };
  }
}

/** The JSON object inside an answer (Gemini sometimes wraps it in words or ``` fences). */
export function jsonIn(text: string): Record<string, unknown> {
  const s = text.indexOf('{');
  const e = text.lastIndexOf('}');
  if (s < 0 || e <= s) throw new Error('The answer could not be read');
  return JSON.parse(text.slice(s, e + 1)) as Record<string, unknown>;
}

/** A video uploaded from the phone or computer goes straight to Google (not through Vercel, which takes 4.5 MB max). */
export async function startVideoUpload(mime: string, size: number, name: string): Promise<string> {
  const res = await fetch('https://generativelanguage.googleapis.com/upload/v1beta/files', {
    method: 'POST',
    headers: {
      'x-goog-api-key': process.env.GEMINI_API_KEY!.trim(),
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(size),
      'X-Goog-Upload-Header-Content-Type': mime,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ file: { display_name: name.slice(0, 80) || 'video' } }),
  });
  const url = res.headers.get('x-goog-upload-url');
  if (!res.ok || !url) throw new Error(`Google didn’t accept the upload (HTTP ${res.status})`);
  return url;
}

/** Waits until Google has prepared an uploaded video (a few seconds to a minute). */
export async function waitForVideo(name: string): Promise<{ uri: string; mimeType: string }> {
  for (let i = 0; i < 60; i++) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/${name}`, { headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY!.trim() } });
    const f = (await res.json().catch(() => ({}))) as { uri?: string; mimeType?: string; state?: string };
    if (f.state === 'ACTIVE' && f.uri) return { uri: f.uri, mimeType: f.mimeType ?? 'video/mp4' };
    if (f.state === 'FAILED') throw new Error('Google couldn’t read this video');
    await new Promise((ok) => setTimeout(ok, 3000));
  }
  throw new Error('Google took too long to prepare the video');
}
export const deleteVideo = (name: string) => fetch(`https://generativelanguage.googleapis.com/v1beta/${name}`, { method: 'DELETE', headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY!.trim() } }).catch(() => undefined);
