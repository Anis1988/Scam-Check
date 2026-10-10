import Anthropic from '@anthropic-ai/sdk';
import type { AppSettings, Provider } from '../src/lib/types.js';
import { modelFor, modelName, providerOf } from '../src/lib/types.js';
import { geminiSearch, type Source } from './gemini.js';

/**
 * 🎬 Video and 🏢 Look up with the AI picked in Settings (or picked just for once), with a live web search:
 * - Gemini: Google Search (and it can watch videos).
 * - Claude: Anthropic's web search (about 1 cent a search, on top of the AI check).
 * - Groq: its free "Compound" model searches the web (text only); pictures go to its picture model, without search.
 * - OpenRouter: its free models can't search: fine for looking at pictures, refused when a search is required.
 * Returns the AI's text (JSON asked in the instructions), the web pages it used, and who answered.
 */
export interface Ask {
  instructions: string;
  text: string;
  images?: { mime: string; data: string }[]; // e.g. pictures taken from a video
  geminiParts?: Record<string, unknown>[]; // Gemini only: a whole video (uploaded file or YouTube link)
  search: boolean; // a web search is needed (true for company look-ups)
  video?: boolean;
}
export interface Answered { text: string; sources: Source[]; by: string; note?: string }

/** This AI can't do what was asked (e.g. search the web for free): pick another one. */
export class CannotDo extends Error {}

export async function askWithSearch(p: Provider, cfg: AppSettings['ai'], a: Ask): Promise<Answered> {
  if (p === 'gemini') {
    const parts = [...(a.geminiParts ?? []), ...(a.images ?? []).map((i) => ({ inline_data: { mime_type: i.mime, data: i.data } })), { text: a.text }];
    const g = await geminiSearch(parts, a.instructions, cfg, a.video);
    const by = modelName('gemini', g.model);
    return { text: g.text, sources: g.sources, by, note: g.fallback ? `Gemini Pro wasn’t available (${g.fallback}), so ${by} answered.` : undefined };
  }
  if (p === 'claude') return askClaude(cfg, a).catch((e) => { throw new Error(claudeError(e)); });
  return askFree(p, cfg, a);
}

/** Claude's errors come as "401 {json}": keep just the readable part. */
function claudeError(e: unknown): string {
  if (e instanceof Anthropic.APIError) {
    if (e.status === 401 || e.status === 403) return 'Claude: the key isn’t valid (ANTHROPIC_API_KEY in Vercel)';
    if (e.status === 429) return 'Claude is busy or over its limit right now: try again, or pick another model';
    const m = /"message"\s*:\s*"([^"]+)"/.exec(e.message);
    return `Claude: ${(m?.[1] ?? e.message).slice(0, 160)}`;
  }
  return e instanceof Error ? e.message : String(e);
}

async function askClaude(cfg: AppSettings['ai'], a: Ask): Promise<Answered> {
  const model = modelFor(cfg, 'claude');
  const client = new Anthropic({ timeout: 240_000, maxRetries: 1 });
  const content: Anthropic.Beta.Messages.BetaContentBlockParam[] = [
    ...(a.images ?? []).map((i) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: i.mime as 'image/jpeg', data: i.data } })),
    { type: 'text', text: a.text },
  ];
  // The newer web search (with filtering) runs on Opus and Sonnet; Haiku uses the basic one.
  const tools = a.search ? ([{ type: /haiku/i.test(model) ? 'web_search_20250305' : 'web_search_20260209', name: 'web_search', max_uses: 5 }] as unknown as Anthropic.Beta.Messages.BetaToolUnion[]) : undefined;
  const messages: Anthropic.Beta.Messages.BetaMessageParam[] = [{ role: 'user', content }];
  const texts: string[] = [];
  const sources: Source[] = [];
  for (let turn = 0; turn < 4; turn++) {
    const res = await client.beta.messages.create({
      model,
      max_tokens: 8000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: a.instructions,
      messages,
      ...(tools ? { tools } : {}),
      ...(/haiku/i.test(model) ? {} : { output_config: { effort: cfg.effort } }),
    } as Anthropic.Beta.Messages.MessageCreateParamsNonStreaming);
    if (res.stop_reason === 'refusal') throw new Error('Claude declined to answer this one: try another model');
    for (const b of res.content as unknown as { type: string; text?: string; content?: unknown }[]) {
      if (b.type === 'text' && b.text) texts.push(b.text);
      // Web search results: a list of pages (an error comes back as an object instead).
      if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) {
        for (const r of b.content as { url?: string; title?: string }[]) if (r.url && !sources.some((s) => s.url === r.url)) sources.push({ title: (r.title ?? r.url).slice(0, 120), url: r.url });
      }
    }
    // A long search can pause: carry on from where it stopped.
    if (res.stop_reason !== 'pause_turn') break;
    messages.push({ role: 'assistant', content: res.content as unknown as Anthropic.Beta.Messages.BetaContentBlockParam[] });
  }
  const text = texts.join('\n').trim();
  if (!text) throw new Error('Claude gave no answer');
  return { text, sources: sources.slice(0, 8), by: modelName('claude', model) };
}

const BASE = { groq: 'https://api.groq.com/openai/v1', openrouter: 'https://openrouter.ai/api/v1' } as const;

async function askFree(p: 'groq' | 'openrouter', cfg: AppSettings['ai'], a: Ask): Promise<Answered> {
  const pr = providerOf(p);
  const hasImages = !!a.images?.length;
  let model = modelFor(cfg, p);
  let note: string | undefined;
  if (a.search && !hasImages) {
    // Groq's "Compound" model searches the web by itself (free). OpenRouter's free models can't.
    if (p === 'openrouter') throw new CannotDo('OpenRouter’s free models can’t search the web, and contact details must come from a live search: pick Gemini, Claude or Groq');
    model = 'groq/compound';
  } else if (hasImages) {
    const info = pr.models.find((m) => m.id === model);
    if (!info?.pictures) model = pr.models.find((m) => m.pictures)?.id ?? model;
    if (a.search) note = `${pr.name} can’t search the web while looking at pictures: this answer comes from what’s in the video, not from a web search.`;
  }
  // Groq takes at most 5 pictures at once.
  const images = (a.images ?? []).slice(0, 5);
  const content = hasImages ? [...images.map((i) => ({ type: 'image_url', image_url: { url: `data:${i.mime};base64,${i.data}` } })), { type: 'text', text: a.text }] : a.text;
  const res = await fetch(`${BASE[p]}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env[pr.env]!.trim()}`, ...(p === 'openrouter' ? { 'HTTP-Referer': 'https://scamcheck.app', 'X-Title': 'Scam Check' } : {}) },
    body: JSON.stringify({ model, temperature: 0.2, max_tokens: 4000, messages: [{ role: 'system', content: a.instructions }, { role: 'user', content }] }),
    signal: AbortSignal.timeout(120_000),
  }).catch(() => { throw new Error(`${pr.name} couldn’t be reached: try again, or pick another AI`); });
  const j = (await res.json().catch(() => ({}))) as {
    error?: { message?: string } | string;
    choices?: { message?: { content?: string; executed_tools?: { search_results?: { results?: { title?: string; url?: string }[] } }[] } }[];
  };
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw new Error(`${pr.name}: the key isn’t valid (${pr.env} in Vercel)`);
    if (res.status === 429) throw new Error(`${pr.name}’s free allowance is used up for now: pick another AI`);
    if (res.status === 404) throw new Error(`${pr.name} doesn’t offer “${model}” any more: pick another model`);
    throw new Error(`${pr.name}: ${String((typeof j.error === 'string' ? j.error : j.error?.message) ?? `HTTP ${res.status}`).slice(0, 140)}`);
  }
  const m = j.choices?.[0]?.message;
  const text = (m?.content ?? '').trim();
  if (!text) throw new Error(`${pr.name} gave no answer`);
  const sources: Source[] = [];
  for (const t of m?.executed_tools ?? []) for (const r of t.search_results?.results ?? []) if (r.url && !sources.some((s) => s.url === r.url)) sources.push({ title: (r.title ?? r.url).slice(0, 120), url: r.url });
  return { text, sources: sources.slice(0, 8), by: model === 'groq/compound' ? 'Groq Compound (free, web search)' : modelName(p, model), note };
}
