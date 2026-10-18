import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Signal } from '../src/lib/types.js';
import { guard, json } from '../server/guard.js';
import { buildResult } from '../server/analyze.js';
import { checkLinks, isFreeMail } from '../server/domains.js';
import { normalize } from '../server/lists.js';
import { checkPhones } from '../server/phones.js';
import { getSettings, saveResult } from '../server/store.js';
import { out } from './check.js';

const Body = z.object({ value: z.string().trim().min(3).max(500) });

/**
 * POST /api/lookup {value} -> ⚡ quick look-up of just a link, phone number or email address. Free checks only,
 * never the AI. The link is only looked up, never opened.
 */
export async function POST(req: Request): Promise<Response> {
  const blocked = guard(req, 'lookup', 30);
  if (blocked) return blocked;
  let value: string;
  try {
    value = Body.parse(await req.json()).value;
  } catch {
    return json({ error: 'Type a link, a phone number or an email address.' }, 400);
  }
  const n = normalize(value);
  if (!n) return json({ error: 'That doesn’t look like a link, a phone number or an email address.' }, 400);
  try {
    const cfg = await getSettings();
    const id = createHash('sha256').update(`lookup:${n.kind}:${value.toLowerCase()}`).digest('hex').slice(0, 32);
    const signals: Signal[] = [];
    let links: Awaited<ReturnType<typeof checkLinks>>['links'] = [];
    let phones: ReturnType<typeof checkPhones>['phones'] = [];
    if (n.kind === 'phone') {
      const p = checkPhones([value], cfg.place.zip);
      phones = p.phones;
      signals.push(...p.signals);
    } else {
      const domain = n.kind === 'email' ? n.value.split('@')[1] : value;
      const l = await checkLinks([domain], cfg.checks);
      links = l.links;
      signals.push(...l.signals);
      if (n.kind === 'email' && isFreeMail(n.value.split('@')[1])) signals.push({ source: 'sender', level: 'info', weight: 0, title: 'A free email address (Gmail, Yahoo…)', detail: 'Anyone can make one. Real companies, banks and agencies write from their own website’s address.' });
    }
    const r = buildResult(id, 'text', value, { text: value, signals, links, phones, sender: n.kind === 'email' ? { address: n.value } : undefined }, 'off');
    r.title = n.value;
    await saveResult(r, cfg.checks.rememberDays).catch(() => undefined);
    return out(r);
  } catch (e) {
    return json({ error: (e instanceof Error ? e.message : String(e)).slice(0, 300) }, 502);
  }
}
