import PostalMime from 'postal-mime';
import { parse } from 'tldts';
import type { SenderInfo, Signal } from '../src/lib/types';
import { BRANDS, isFreeMail, lookalikeOf, officialBrand } from './domains';

/**
 * A full email (.eml file, or pasted with its headers): the hidden sender details tell a lot —
 * the real sender address, a different Reply-To, and whether the email passed the sender checks (SPF/DKIM/DMARC).
 */
export const looksLikeRawEmail = (s: string) => /^(received|return-path|from|delivered-to|message-id|mime-version|dkim-signature|authentication-results):/im.test(s.slice(0, 4000)) && /\n\s*\n/.test(s);

export interface ParsedEmail { sender: SenderInfo; text: string; links: { href: string; label: string }[]; signals: Signal[] }

const domainOf = (addr?: string) => (addr?.split('@')[1] ?? '').toLowerCase().replace(/>$/, '');

export async function parseEmail(raw: string): Promise<ParsedEmail> {
  const m = await PostalMime.parse(raw);
  const from = m.from && 'address' in m.from ? m.from : undefined;
  const replyTo = m.replyTo?.[0] && 'address' in m.replyTo[0] ? m.replyTo[0].address : undefined;
  const authHeader = m.headers.filter((h) => h.key === 'authentication-results').map((h) => h.value).join(' ');
  const auth = ['spf', 'dkim', 'dmarc'].map((k) => {
    const r = authHeader.match(new RegExp(`\\b${k}=(\\w+)`, 'i'))?.[1]?.toLowerCase();
    return r ? `${k.toUpperCase()} ${r}` : '';
  }).filter(Boolean).join(', ');
  const html = m.html ?? '';
  const links = [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map((x) => ({ href: x[1].trim(), label: x[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() }))
    .filter((l) => /^https?:/i.test(l.href)).slice(0, 30);
  const text = (m.text ?? html.replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ')).replace(/\s+\n/g, '\n').trim();

  const signals: Signal[] = [];
  const add = (s: Omit<Signal, 'source'>) => signals.push({ source: 'sender', ...s });
  const fromDomain = domainOf(from?.address);
  const fromReg = parse(fromDomain).domain ?? fromDomain;
  const nameBrand = from?.name ? BRANDS.find((b) => b.words.some((w) => w.length > 4 && from.name!.toLowerCase().replace(/[^a-z]/g, '').includes(w.replace(/[^a-z]/g, '')))) : undefined;
  if (/dmarc=fail|spf=fail|dkim=fail/i.test(authHeader)) add({ level: 'bad', weight: 22, title: 'The sender check failed', detail: `The email system could not confirm it really comes from ${fromDomain || 'that sender'} (${auth}).` });
  else if (/dmarc=pass/i.test(authHeader) && officialBrand(fromDomain)) add({ level: 'good', weight: -12, title: `Really sent by ${officialBrand(fromDomain)!.name}`, detail: `Sender checks passed (${auth}).` });
  if (fromDomain && isFreeMail(fromDomain) && nameBrand) add({ level: 'bad', weight: 28, title: `Says "${from!.name}" but sent from a free ${fromReg} address`, detail: `${nameBrand.name} never writes from a personal ${fromReg} account.` });
  else if (fromDomain && nameBrand && !officialBrand(fromDomain)) add({ level: 'bad', weight: 28, title: `Says "${from!.name}" but sent from ${fromReg}`, detail: `${nameBrand.name}’s real emails come from ${nameBrand.domains[0]}.` });
  else if (fromDomain && lookalikeOf(fromDomain)) add({ level: 'bad', weight: 30, title: `Sender address imitates ${lookalikeOf(fromDomain)!.name}`, detail: `${fromReg} is not a ${lookalikeOf(fromDomain)!.name} address.` });
  const replyDomain = domainOf(replyTo);
  if (replyDomain && fromDomain && (parse(replyDomain).domain ?? replyDomain) !== fromReg) add({ level: 'warn', weight: 12, title: 'Replies go to a different address', detail: `Sent from ${fromDomain}, but answers go to ${replyDomain}.` });
  // A link whose words show one website but which really goes to another.
  for (const l of links) {
    const shown = l.label.match(/\b((?:[a-z0-9-]+\.)+[a-z]{2,})\b/i)?.[1]?.toLowerCase();
    let real = '';
    try { real = new URL(l.href).hostname.toLowerCase(); } catch { continue; }
    if (shown && (parse(shown).domain ?? shown) !== (parse(real).domain ?? real)) {
      add({ level: 'bad', weight: 25, title: 'A link shows one website but opens another', detail: `It says "${shown}" but goes to ${real}.` });
      break;
    }
  }
  return { sender: { name: from?.name || undefined, address: from?.address, replyTo, subject: m.subject, auth: auth || undefined }, text, links, signals };
}
