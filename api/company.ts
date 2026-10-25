import { z } from 'zod';
import type { CompanyInfo, ScamNews } from '../src/lib/types.js';
import { guard, json } from '../server/guard.js';
import { ready } from '../server/ai.js';
import { CannotDo, askWithSearch } from '../server/search.js';
import { modelFor, modelName, pickModel, providerOf } from '../src/lib/types.js';
import { checkLinks } from '../server/domains.js';
import { jsonIn } from '../server/gemini.js';
import { checkPhones } from '../server/phones.js';
import { COMPANIES, db, getSettings, syncedDel, syncedList, syncedPut, takeAi } from '../server/store.js';
import { placeWords } from '../src/lib/place.js';

/**
 * 🏢 Look up a company: what they do, their real website, customer service phone and email, contact page. Always
 * from a live web search (the AI picked in Settings, or one picked for this once: Gemini, Claude or Groq), with
 * sources: never from an AI's memory, because a wrong number could lead to a scammer. The website and phone
 * numbers are then checked by the app's free checks too. Uses 1 AI check; remembered 7 days (free).
 */
const Body = z.object({
  name: z.string().trim().min(2).max(120), fresh: z.boolean().optional(),
  model: z.object({ provider: z.enum(['claude', 'gemini', 'groq', 'openrouter']), id: z.string().regex(/^[A-Za-z0-9._:/-]{2,120}$/) }).optional(),
});
const KEY = (n: string) => `sc:company:${n.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}`;
/** The remembered answer: for this name near this 📍 ZIP code (a new ZIP code asks again). */
const CACHE = (n: string, zip: string) => `${KEY(n)}@${zip}`;

const INSTRUCTIONS = `You help one person in the US find a company's REAL, official contact details, so they never call a fake number. Search the web and only give details you found on the company's own website or other reliable sources; never guess or invent a phone number, email or website. If unsure, leave it out. Plain, simple English.

Answer with ONE JSON object only:
{"name": "the company's usual name",
 "whatTheyDo": "1 or 2 short sentences: what the company does",
 "website": "the official website address (https://…), or an empty string",
 "phones": [{"label": "e.g. Customer service, Billing, Fraud department", "number": "as written on their site"}] (max 5),
 "emails": [{"label": "e.g. Customer service", "email": "…"}] (max 3; many companies have none: then empty),
 "contactPage": "the official contact-us page address, or an empty string",
 "hours": "customer service hours, short, or an empty string",
 "address": "main mailing address, or an empty string",
 "nearYou": {"place": "the closest branch, store or local office to the person's ZIP code, with its town", "address": "its street address", "phone": "its own phone number, or an empty string", "hours": "its hours, short, or an empty string"} (only if the company has local places and you found one near that ZIP code; else null)
 "scamWarning": "one short sentence on common scams that pretend to be this company, or an empty string"}`;

const str = (v: unknown, n = 300) => (typeof v === 'string' ? v.trim().slice(0, n) : '');

/** 📍 The closest branch or office to your ZIP code; its number gets the free phone check too. */
function nearYou(v: unknown, zip: string): CompanyInfo['nearYou'] {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  const place = str(o.place, 120), address = str(o.address, 200), phone = str(o.phone, 40);
  if (!place || !address) return undefined;
  const r = /\d{3}/.test(phone) ? checkPhones([phone], zip).phones[0] : undefined;
  return { place, address, phone: r ? phone : undefined, phoneNote: r?.note, phoneLevel: r?.level, hours: str(o.hours, 160) || undefined, zip };
}

/** 🔄 Recent companies, the same on every device (the last 20). */
const recent = (name: string, typed: string) => syncedPut(COMPANIES, KEY(typed), { name, checkedAt: new Date().toISOString() }, 20).catch(() => undefined);

/**
 * 📰 Scams going around now: a short list from this week's news (a live web search, never memory), made only when
 * you ask for it (1 AI check) and kept for everyone's devices; it's offered again after 7 days.
 */
const NEWS = 'sc:news';
const NEWS_RULES = `List the scams going around RIGHT NOW in the United States (the last few weeks), for one ordinary person; also include ones going around in their own state and area (their ZIP code is given). Search the web: FTC consumer alerts, FBI IC3, AARP fraud watch, BBB Scam Tracker, their state attorney general, local news, major news. Only scams you found in recent sources; never invent. Plain, simple, calm everyday English, short.

Answer with ONE JSON object only:
{"items": [{"name": "short name, e.g. 'Fake toll texts'", "how": "what they say or do, one short sentence", "tell": "how to spot it or what to do, one short sentence", "who": "who is targeted, a few words, or an empty string", "local": true if it is going around in their state or area, else false}] (4 to 6, most widespread first)}`;
const NewsBody = z.object({
  news: z.literal(true),
  model: z.object({ provider: z.enum(['claude', 'gemini', 'groq', 'openrouter']), id: z.string().regex(/^[A-Za-z0-9._:/-]{2,120}$/) }).optional(),
});
async function makeNews(b: z.infer<typeof NewsBody>): Promise<Response> {
  const saved = await getSettings();
  const cfg = b.model ? { ...saved, ai: { ...saved.ai, ...pickModel(saved.ai, b.model.provider, b.model.id) } } : saved;
  const p = cfg.ai.provider;
  const tried = modelName(p, modelFor(cfg.ai, p));
  if (!ready(p)) return json({ error: `${providerOf(p).name} isn’t set up (${providerOf(p).env} in Vercel): pick another model.`, tried }, 503);
  if (p === 'openrouter') return json({ error: 'OpenRouter’s free models can’t search the web: pick Gemini, Claude or Groq.', tried }, 400);
  if (!(await takeAi(p))) return json({ error: `Today’s ${providerOf(p).name} checks are used up (daily limit in Settings): pick another model to continue.`, tried }, 429);
  try {
    const g = await askWithSearch(p, cfg.ai, { instructions: NEWS_RULES, text: `Today is ${new Date().toISOString().slice(0, 10)}. The person lives near ${placeWords(cfg.place.zip)}. What scams are going around now?`, search: true });
    const items = (Array.isArray(jsonIn(g.text).items) ? (jsonIn(g.text).items as Record<string, unknown>[]) : []).map((x) => ({ name: str(x.name, 80), how: str(x.how, 300), tell: str(x.tell, 300), who: str(x.who, 80) || undefined, local: x.local === true || undefined })).filter((x) => x.name && x.how).slice(0, 6);
    if (!items.length) throw new Error('No list came back: try again, or pick another model');
    const news: ScamNews = { items, sources: g.sources, aiBy: g.by, zip: cfg.place.zip, checkedAt: new Date().toISOString() };
    await db()?.set(NEWS, news, { ex: 60 * 86400 });
    return json(news);
  } catch (e) {
    return json({ error: (e instanceof Error ? e.message : String(e)).slice(0, 300), tried }, e instanceof CannotDo ? 400 : 502);
  }
}

/** GET /api/company -> your recent companies (newest first); GET /api/company?news=1 -> 📰 the last scam news list. */
export async function GET(req: Request): Promise<Response> {
  const blocked = guard(req, 'company', 60);
  if (blocked) return blocked;
  if (new URL(req.url).searchParams.get('news')) return json({ news: (await db()?.get<ScamNews>(NEWS).catch(() => null)) ?? null });
  const list = await syncedList<{ name: string; checkedAt: string }>(COMPANIES).catch(() => []);
  return json({ synced: !!db(), names: list.map(([, x]) => x.name) });
}

/** PUT /api/company {names} -> once per device: its recent companies (newest first) join the shared list. */
export async function PUT(req: Request): Promise<Response> {
  const blocked = guard(req, 'company', 10);
  if (blocked) return blocked;
  const b = z.object({ names: z.array(z.string().trim().min(2).max(120)).max(20) }).safeParse(await req.json().catch(() => null));
  if (!b.success) return json({ error: 'Bad names.' }, 400);
  const have = new Set((await syncedList<{ name: string; checkedAt: string }>(COMPANIES).catch(() => [])).map(([k]) => k));
  // Older than anything new, keeping their order.
  const base = Date.now() - 86400_000;
  for (const [i, name] of b.data.names.entries()) {
    if (!have.has(KEY(name))) await syncedPut(COMPANIES, KEY(name), { name, checkedAt: new Date(base - i * 1000).toISOString() }, 20);
  }
  return json({ synced: !!db() });
}

/** DELETE /api/company?name=… -> 🗑 forgets a company look-up (the next search starts fresh). */
export async function DELETE(req: Request): Promise<Response> {
  const blocked = guard(req, 'company', 30);
  if (blocked) return blocked;
  const name = (new URL(req.url).searchParams.get('name') ?? '').trim().slice(0, 120);
  if (name.length < 2) return json({ error: 'Bad name.' }, 400);
  await db()?.del(CACHE(name, (await getSettings()).place.zip)).catch(() => undefined);
  // Typed differently ("chase" / "Chase Bank"): every recent entry with this name goes.
  const list = await syncedList<{ name: string; checkedAt: string }>(COMPANIES).catch(() => []);
  await syncedDel(COMPANIES, [KEY(name), ...list.filter(([, x]) => x.name.toLowerCase() === name.toLowerCase()).map(([k]) => k)]).catch(() => undefined);
  return json({ deleted: 1 });
}

export async function POST(req: Request): Promise<Response> {
  const blocked = guard(req, 'company', 20);
  if (blocked) return blocked;
  let b: z.infer<typeof Body>;
  try {
    const raw = await req.json();
    const n = NewsBody.safeParse(raw);
    if (n.success) return await makeNews(n.data);
    b = Body.parse(raw);
  } catch {
    return json({ error: 'Type a company name.' }, 400);
  }
  try {
    const saved = await getSettings();
    const zip = saved.place.zip;
    const cached = b.fresh || b.model ? null : await db()?.get<CompanyInfo>(CACHE(b.name, zip));
    if (cached) {
      await recent(cached.name, b.name);
      return json({ ...cached, remembered: true });
    }
    // The AI picked in Settings, or the one picked just for this look-up.
    const cfg = b.model ? { ...saved, ai: { ...saved.ai, ...pickModel(saved.ai, b.model.provider, b.model.id) } } : saved;
    const p = cfg.ai.provider;
    if (!ready(p)) return json({ error: `${providerOf(p).name} isn’t set up (${providerOf(p).env} in Vercel): pick another model.` }, 503);
    if (p === 'openrouter') return json({ error: 'OpenRouter’s free models can’t search the web, and contact details must come from a live search: pick Gemini, Claude or Groq.' }, 400);
    if (!(await takeAi(p))) return json({ error: `Today’s ${providerOf(p).name} checks are used up (daily limit in Settings): pick another model to continue.` }, 429);
    const g = await askWithSearch(p, cfg.ai, { instructions: INSTRUCTIONS, text: `Company: ${b.name}\nThe person lives near ${placeWords(zip)}.`, search: true });
    const o = jsonIn(g.text);
    const arr = (v: unknown) => (Array.isArray(v) ? v : []) as Record<string, unknown>[];
    const phones = arr(o.phones).map((p) => ({ label: str(p.label, 60) || 'Phone', number: str(p.number, 40) })).filter((p) => /\d{3}/.test(p.number)).slice(0, 5);
    const emails = arr(o.emails).map((e) => ({ label: str(e.label, 60) || 'Email', email: str(e.email, 120) })).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.email)).slice(0, 3);
    // The app's own free checks on what was found: is the website the real one, how old, what kind of phone number.
    const site = str(o.website, 200);
    const links = site ? (await checkLinks([site], cfg.checks)).links : [];
    const by = g.by;
    const info: CompanyInfo = {
      name: str(o.name, 100) || b.name, whatTheyDo: str(o.whatTheyDo, 400),
      website: links[0] ? { url: /^https?:\/\//.test(site) ? site : `https://${site}`, domain: links[0].domain, level: links[0].level, note: links[0].note } : undefined,
      // One number at a time, so a number that can't be read never shifts the notes onto the wrong number.
      phones: phones.map((p) => { const r = checkPhones([p.number], zip).phones[0]; return { ...p, note: r?.note, level: r?.level }; }),
      emails, contactPage: /^https?:\/\//.test(str(o.contactPage, 300)) ? str(o.contactPage, 300) : undefined,
      hours: str(o.hours, 160) || undefined, address: str(o.address, 200) || undefined, scamWarning: str(o.scamWarning, 300) || undefined,
      nearYou: nearYou(o.nearYou, zip),
      sources: g.sources, aiBy: by, note: g.note,
      checkedAt: new Date().toISOString(),
    };
    await db()?.set(CACHE(b.name, zip), info, { ex: 7 * 86400 });
    await recent(info.name, b.name);
    return json(info);
  } catch (e) {
    return json({ error: (e instanceof Error ? e.message : String(e)).slice(0, 300) }, e instanceof CannotDo ? 400 : 502);
  }
}
