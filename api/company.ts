import { z } from 'zod';
import type { CompanyInfo } from '../src/lib/types.js';
import { guard, json } from '../server/guard.js';
import { aiName, geminiReady } from '../server/ai.js';
import { checkLinks } from '../server/domains.js';
import { geminiSearch, jsonIn } from '../server/gemini.js';
import { checkPhones } from '../server/phones.js';
import { db, getSettings, takeAi } from '../server/store.js';

/**
 * 🏢 Look up a company: what they do, their real website, customer service phone and email, contact page. Always
 * from a live Google search (Gemini), with sources: never from an AI's memory, because a wrong number could lead
 * to a scammer. The website and phone numbers are then checked by the app's free checks too.
 * Uses 1 Gemini check; the same company is remembered 7 days (free).
 */
const Body = z.object({ name: z.string().trim().min(2).max(120), fresh: z.boolean().optional() });
const KEY = (n: string) => `sc:company:${n.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}`;

const INSTRUCTIONS = `You help one person in the US find a company's REAL, official contact details, so they never call a fake number. Use Google Search and only give details you found on the company's own website or other reliable sources; never guess or invent a phone number, email or website. If unsure, leave it out. Plain, simple English.

Answer with ONE JSON object only:
{"name": "the company's usual name",
 "whatTheyDo": "1 or 2 short sentences: what the company does",
 "website": "the official website address (https://…), or an empty string",
 "phones": [{"label": "e.g. Customer service, Billing, Fraud department", "number": "as written on their site"}] (max 5),
 "emails": [{"label": "e.g. Customer service", "email": "…"}] (max 3; many companies have none: then empty),
 "contactPage": "the official contact-us page address, or an empty string",
 "hours": "customer service hours, short, or an empty string",
 "address": "main mailing address, or an empty string",
 "scamWarning": "one short sentence on common scams that pretend to be this company, or an empty string"}`;

const str = (v: unknown, n = 300) => (typeof v === 'string' ? v.trim().slice(0, n) : '');

export async function POST(req: Request): Promise<Response> {
  const blocked = guard(req, 'company', 20);
  if (blocked) return blocked;
  let b: z.infer<typeof Body>;
  try {
    b = Body.parse(await req.json());
  } catch {
    return json({ error: 'Type a company name.' }, 400);
  }
  if (!geminiReady()) return json({ error: 'Company look-up needs Gemini (free): add GEMINI_API_KEY in Vercel, then redeploy.' }, 503);
  try {
    const cached = b.fresh ? null : await db()?.get<CompanyInfo>(KEY(b.name));
    if (cached) return json({ ...cached, remembered: true });
    if (!(await takeAi('gemini'))) return json({ error: 'Today’s Gemini checks are used up (daily limit in Settings).' }, 429);
    const cfg = await getSettings();
    const g = await geminiSearch([{ text: `Company: ${b.name}` }], INSTRUCTIONS, cfg.ai);
    const o = jsonIn(g.text);
    const arr = (v: unknown) => (Array.isArray(v) ? v : []) as Record<string, unknown>[];
    const phones = arr(o.phones).map((p) => ({ label: str(p.label, 60) || 'Phone', number: str(p.number, 40) })).filter((p) => /\d{3}/.test(p.number)).slice(0, 5);
    const emails = arr(o.emails).map((e) => ({ label: str(e.label, 60) || 'Email', email: str(e.email, 120) })).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.email)).slice(0, 3);
    // The app's own free checks on what was found: is the website the real one, how old, what kind of phone number.
    const site = str(o.website, 200);
    const links = site ? (await checkLinks([site], cfg.checks)).links : [];
    const ph = checkPhones(phones.map((p) => p.number)).phones;
    const by = aiName('gemini', { ...cfg.ai, geminiModel: g.model });
    const info: CompanyInfo = {
      name: str(o.name, 100) || b.name, whatTheyDo: str(o.whatTheyDo, 400),
      website: links[0] ? { url: /^https?:\/\//.test(site) ? site : `https://${site}`, domain: links[0].domain, level: links[0].level, note: links[0].note } : undefined,
      phones: phones.map((p, i) => ({ ...p, note: ph[i]?.note, level: ph[i]?.level })),
      emails, contactPage: /^https?:\/\//.test(str(o.contactPage, 300)) ? str(o.contactPage, 300) : undefined,
      hours: str(o.hours, 160) || undefined, address: str(o.address, 200) || undefined, scamWarning: str(o.scamWarning, 300) || undefined,
      sources: g.sources, aiBy: by, note: g.fallback ? `Gemini Pro wasn’t available (${g.fallback}), so ${by} looked it up.` : undefined,
      checkedAt: new Date().toISOString(),
    };
    await db()?.set(KEY(b.name), info, { ex: 7 * 86400 });
    return json(info);
  } catch (e) {
    return json({ error: (e instanceof Error ? e.message : String(e)).slice(0, 300) }, 502);
  }
}
