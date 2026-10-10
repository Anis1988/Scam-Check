import { z } from 'zod';
import type { AppSettings, FreeProvider } from '../src/lib/types.js';
import { modelFor, modelName, providerOf } from '../src/lib/types.js';
import { Answer, SYSTEM, promptText, type AiAnswer, type AiInput } from './ai.js';
import { loose } from './gemini.js';

/**
 * The other free AIs (Settings → AI model): Groq and OpenRouter. They all speak the OpenAI way, so one
 * small client serves them all (plain HTTPS, no extra library). Same instructions and answer shape as Claude, so
 * everything after it (mixing with the free checks, never hiding a strong warning) is unchanged.
 */
const BASE: Record<FreeProvider, string> = {
  groq: 'https://api.groq.com/openai/v1',
  openrouter: 'https://openrouter.ai/api/v1',
};

export async function askOpenAI(p: FreeProvider, input: AiInput, cfg: AppSettings['ai']): Promise<AiAnswer & { by: string; note?: string }> {
  const pr = providerOf(p);
  let model = modelFor(cfg, p);
  let note: string | undefined;
  // A picture with a model that can't see: the same AI's picture-reading model reads it.
  const info = pr.models.find((m) => m.id === model);
  if (input.file && info && !info.pictures) {
    const v = pr.models.find((m) => m.pictures);
    if (v) {
      note = `${info.name} can’t read pictures, so ${v.name} read it.`;
      model = v.id;
    }
  }
  const schema = z.toJSONSchema(Answer) as Record<string, unknown>;
  delete schema.$schema;
  const text = promptText(input, cfg);
  const url = input.file ? `data:${input.file.mime};base64,${input.file.data}` : '';
  const content = input.file
    ? [{ type: 'image_url', image_url: { url } }, { type: 'text', text }]
    : text;
  const body = (json: boolean) => JSON.stringify({
    model,
    temperature: 0.2,
    max_tokens: 3000,
    messages: [
      { role: 'system', content: `${SYSTEM}\n\nAnswer with ONE JSON object only (no other text), matching this JSON schema:\n${JSON.stringify(schema)}` },
      { role: 'user', content },
    ],
    ...(json ? { response_format: { type: 'json_object' } } : {}),
  });
  const send = (json: boolean) => fetch(`${BASE[p]}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env[pr.env]!.trim()}`,
      ...(p === 'openrouter' ? { 'HTTP-Referer': 'https://scamcheck.app', 'X-Title': 'Scam Check' } : {}),
    },
    body: body(json),
    signal: AbortSignal.timeout(50_000),
  });
  let res = await send(true).catch((e: unknown) => {
    throw new Error(`${pr.name} couldn’t be reached (${e instanceof Error && e.name === 'TimeoutError' ? 'it took too long' : 'network problem'}): try again, or pick another AI`);
  });
  // Some models don't take "JSON only" mode: ask again without it (the instructions still say JSON).
  if (res.status === 400 && /response_format|json/i.test(await res.clone().text())) res = await send(false);
  const j = (await res.json().catch(() => ({}))) as { error?: { message?: string } | string; message?: string; choices?: { message?: { content?: string | { text?: string }[] } }[] };
  if (!res.ok) {
    const msg = (typeof j.error === 'string' ? j.error : j.error?.message) ?? j.message ?? `HTTP ${res.status}`;
    if (res.status === 401 || res.status === 403) throw new Error(`${pr.name}: the key isn’t valid (${pr.env} in Vercel)`);
    if (res.status === 429) throw new Error(`${pr.name}’s free allowance is used up for now (try again later, or pick another AI)`);
    if (res.status === 404) throw new Error(`${pr.name} doesn’t offer “${model}” any more: pick another model`);
    throw new Error(`${pr.name}: ${String(msg).slice(0, 140)}`);
  }
  const c = j.choices?.[0]?.message?.content;
  const out = (Array.isArray(c) ? c.map((x) => x.text ?? '').join('') : c ?? '').trim();
  if (!out) throw new Error(`${pr.name} gave no answer`);
  let raw: unknown;
  try {
    raw = JSON.parse(out.replace(/^[\s\S]*?(\{)/, '$1').replace(/\}[^}]*$/, '}'));
  } catch {
    throw new Error(`${pr.name}’s answer could not be read`);
  }
  return { ...loose(raw), by: modelName(p, model), note };
}
