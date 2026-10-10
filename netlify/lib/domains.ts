import { parse } from 'tldts';
import type { LinkInfo, Signal } from '../../src/lib/types';

/**
 * Domain reputation, free: lookalike brand names, risky endings, link shorteners, how new the domain is (RDAP),
 * and Google Safe Browsing when GOOGLE_SAFE_BROWSING_KEY is set (free key).
 */

/** Brands scammers copy most, with their real domains (any subdomain of these is real). */
export const BRANDS: { name: string; words: string[]; domains: string[] }[] = [
  { name: 'PayPal', words: ['paypal'], domains: ['paypal.com', 'paypal.me'] },
  { name: 'Amazon', words: ['amazon', 'amzn'], domains: ['amazon.com', 'amazon.co.uk', 'amazon.ca', 'amazon.fr', 'amzn.to', 'amazonaws.com', 'a.co'] },
  { name: 'Apple', words: ['apple', 'icloud', 'itunes'], domains: ['apple.com', 'icloud.com', 'me.com'] },
  { name: 'Microsoft', words: ['microsoft', 'outlook', 'office365', 'onedrive', 'windows'], domains: ['microsoft.com', 'live.com', 'outlook.com', 'office.com', 'office365.com', 'microsoftonline.com', 'onedrive.com', 'windows.com'] },
  { name: 'Netflix', words: ['netflix'], domains: ['netflix.com'] },
  { name: 'USPS', words: ['usps'], domains: ['usps.com', 'usps.gov'] },
  { name: 'UPS', words: ['ups'], domains: ['ups.com'] },
  { name: 'FedEx', words: ['fedex'], domains: ['fedex.com'] },
  { name: 'DHL', words: ['dhl'], domains: ['dhl.com', 'dhl.de'] },
  { name: 'the IRS', words: ['irs'], domains: ['irs.gov'] },
  { name: 'Social Security', words: ['ssa', 'socialsecurity'], domains: ['ssa.gov'] },
  { name: 'Chase', words: ['chase'], domains: ['chase.com', 'jpmorganchase.com'] },
  { name: 'Wells Fargo', words: ['wellsfargo'], domains: ['wellsfargo.com', 'wf.com'] },
  { name: 'Bank of America', words: ['bankofamerica', 'bofa'], domains: ['bankofamerica.com', 'bofa.com'] },
  { name: 'Citi', words: ['citibank'], domains: ['citi.com', 'citibank.com'] },
  { name: 'Capital One', words: ['capitalone'], domains: ['capitalone.com'] },
  { name: 'Fidelity', words: ['fidelity'], domains: ['fidelity.com'] },
  { name: 'Venmo', words: ['venmo'], domains: ['venmo.com'] },
  { name: 'Zelle', words: ['zelle'], domains: ['zellepay.com', 'zelle.com'] },
  { name: 'Cash App', words: ['cashapp'], domains: ['cash.app', 'cash.me', 'squareup.com'] },
  { name: 'Coinbase', words: ['coinbase'], domains: ['coinbase.com'] },
  { name: 'Duke Energy', words: ['dukeenergy', 'duke-energy'], domains: ['duke-energy.com'] },
  { name: 'AT&T', words: ['att'], domains: ['att.com', 'att.net'] },
  { name: 'Verizon', words: ['verizon'], domains: ['verizon.com', 'verizonwireless.com'] },
  { name: 'T-Mobile', words: ['tmobile'], domains: ['t-mobile.com'] },
  { name: 'Spectrum', words: ['spectrum'], domains: ['spectrum.com', 'spectrum.net'] },
  { name: 'Xfinity', words: ['xfinity', 'comcast'], domains: ['xfinity.com', 'comcast.com', 'comcast.net'] },
  { name: 'Walmart', words: ['walmart'], domains: ['walmart.com'] },
  { name: 'Costco', words: ['costco'], domains: ['costco.com'] },
  { name: 'eBay', words: ['ebay'], domains: ['ebay.com'] },
  { name: 'Google', words: ['google', 'gmail'], domains: ['google.com', 'gmail.com', 'goo.gl', 'youtube.com', 'g.co'] },
  { name: 'Facebook / Meta', words: ['facebook', 'meta', 'instagram', 'whatsapp'], domains: ['facebook.com', 'fb.com', 'meta.com', 'instagram.com', 'whatsapp.com', 'fb.me', 'wa.me'] },
  { name: 'TikTok', words: ['tiktok'], domains: ['tiktok.com'] },
  { name: 'E-ZPass', words: ['ezpass', 'e-zpass'], domains: ['e-zpassny.com', 'ezpassoh.com', 'ezpassnj.com', 'ezpassva.com', 'e-zpassiag.com', 'ezpassmd.com', 'paytollo.com'] },
  { name: 'DocuSign', words: ['docusign'], domains: ['docusign.com', 'docusign.net'] },
  { name: 'Geek Squad / Best Buy', words: ['geeksquad', 'bestbuy'], domains: ['bestbuy.com', 'geeksquad.com'] },
  { name: 'Norton', words: ['norton'], domains: ['norton.com'] },
  { name: 'McAfee', words: ['mcafee'], domains: ['mcafee.com'] },
  { name: 'Medicare', words: ['medicare'], domains: ['medicare.gov'] },
];

const SHORTENERS = new Set(['bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly', 'is.gd', 'cutt.ly', 'rebrand.ly', 's.id', 't.ly', 'shorturl.at', 'rb.gy', 'tiny.cc', 'bl.ink', 'buff.ly', 'lnkd.in', 'short.gy', 'v.gd', 'qrco.de']);
const RISKY_TLDS = new Set(['top', 'xyz', 'click', 'link', 'live', 'icu', 'cfd', 'sbs', 'rest', 'online', 'site', 'buzz', 'monster', 'cyou', 'lol', 'mom', 'vip', 'win', 'bond', 'quest', 'cam', 'shop', 'support', 'help', 'loan', 'work', 'zip', 'mov', 'gq', 'tk', 'ml', 'cf', 'ga']);
const FREE_MAIL = new Set(['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'live.com', 'aol.com', 'icloud.com', 'me.com', 'proton.me', 'protonmail.com', 'gmx.com', 'mail.com', 'yandex.com', 'zoho.com']);

export const isFreeMail = (domain: string) => FREE_MAIL.has(domain.toLowerCase());

/** "paypa1-secure" -> "paypalsecure": undo the usual digit swaps so lookalikes are caught. */
const squash = (s: string) => s.toLowerCase().replace(/0/g, 'o').replace(/1/g, 'l').replace(/3/g, 'e').replace(/5/g, 's').replace(/rn/g, 'm').replace(/[^a-z]/g, '');

export function officialBrand(domain: string) {
  return BRANDS.find((b) => b.domains.some((d) => domain === d || domain.endsWith(`.${d}`)));
}

/** A brand whose name is in this host, while the host isn't one of the brand's real domains. */
export function lookalikeOf(host: string) {
  const reg = parse(host).domain ?? host;
  if (officialBrand(host) || officialBrand(reg)) return undefined;
  const labels = squash(host.replace(/\.[a-z]+$/i, ''));
  return BRANDS.find((b) => b.words.some((w) => {
    const sw = squash(w);
    // Short words (ups, att, irs, ssa) only count as a whole label, so "groups.com" isn't "UPS".
    return sw.length <= 4 ? host.toLowerCase().split(/[.-]/).some((l) => squash(l) === sw) : labels.includes(sw);
  }));
}

/** When the domain was registered (RDAP, free, no key). Undefined if the registry doesn't say. */
async function registeredAt(domain: string): Promise<Date | undefined> {
  try {
    const res = await fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, { headers: { Accept: 'application/rdap+json' }, redirect: 'follow', signal: AbortSignal.timeout(3500) });
    if (!res.ok) return undefined;
    const j = (await res.json()) as { events?: { eventAction?: string; eventDate?: string }[] };
    const d = j.events?.find((e) => e.eventAction === 'registration')?.eventDate;
    return d ? new Date(d) : undefined;
  } catch {
    return undefined;
  }
}

/** Links Google Safe Browsing lists as phishing or malware (empty without a key or on error). */
async function safeBrowsing(urls: string[]): Promise<Set<string>> {
  const key = process.env.GOOGLE_SAFE_BROWSING_KEY;
  if (!key || !urls.length) return new Set();
  try {
    const res = await fetch(`https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client: { clientId: 'scam-check', clientVersion: '1.0' },
        threatInfo: { threatTypes: ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE', 'POTENTIALLY_HARMFUL_APPLICATION'], platformTypes: ['ANY_PLATFORM'], threatEntryTypes: ['URL'], threatEntries: urls.map((url) => ({ url })) },
      }),
      signal: AbortSignal.timeout(3500),
    });
    const j = (await res.json()) as { matches?: { threat?: { url?: string } }[] };
    return new Set((j.matches ?? []).map((m) => m.threat?.url ?? ''));
  } catch {
    return new Set();
  }
}

const ago = (d: Date) => {
  const days = Math.floor((Date.now() - d.getTime()) / 86400_000);
  return days < 1 ? 'today' : days < 60 ? `${days} day${days === 1 ? '' : 's'} ago` : days < 730 ? `${Math.round(days / 30)} months ago` : `in ${d.getUTCFullYear()}`;
};

/** Checks up to 6 links: returns one line per link and the signals they add. */
export async function checkLinks(urls: string[]): Promise<{ links: LinkInfo[]; signals: Signal[] }> {
  const list = [...new Set(urls)].slice(0, 6);
  const parsed = list.map((url) => {
    try {
      const u = new URL(/^https?:\/\//i.test(url) ? url : `http://${url}`);
      return { url, host: u.hostname.toLowerCase().replace(/^www\./, '') };
    } catch {
      return null;
    }
  }).filter((x): x is { url: string; host: string } => !!x && !!x.host);
  const regs = [...new Set(parsed.map((p) => parse(p.host).domain).filter((d): d is string => !!d))];
  const [bad, ages] = await Promise.all([
    safeBrowsing(parsed.map((p) => p.url)),
    Promise.all(regs.slice(0, 5).map(async (d) => [d, await registeredAt(d)] as const)).then((x) => new Map(x)),
  ]);
  const links: LinkInfo[] = [];
  const signals: Signal[] = [];
  const seenHosts = new Set<string>();
  for (const p of parsed) {
    if (seenHosts.has(p.host)) continue; // one line per website
    seenHosts.add(p.host);
    const info = parse(p.host);
    const reg = info.domain ?? p.host;
    const notes: string[] = [];
    let level: Signal['level'] = 'info';
    const add = (s: Omit<Signal, 'source'>) => {
      signals.push({ source: 'link', ...s });
      notes.push(s.title);
      if (s.level === 'bad' || (s.level === 'warn' && level !== 'bad')) level = s.level;
    };
    if (bad.has(p.url)) add({ level: 'bad', weight: 60, hard: true, title: `Google lists ${reg} as dangerous`, detail: 'Google Safe Browsing has this link on its list of phishing or malware sites.' });
    if (info.isIp) add({ level: 'bad', weight: 25, title: 'Link is a bare number address', detail: `${p.host}: real companies use a name, not numbers.` });
    if (p.host.includes('xn--')) add({ level: 'bad', weight: 25, title: 'Disguised letters in the link', detail: 'It uses look-alike letters from other alphabets to imitate a real name.' });
    const fake = lookalikeOf(p.host);
    if (fake) add({ level: 'bad', weight: 35, title: `Pretends to be ${fake.name}`, detail: `${reg} is not ${fake.name}. The real site is ${fake.domains[0]}.` });
    if (SHORTENERS.has(reg) || SHORTENERS.has(p.host)) add({ level: 'warn', weight: 12, title: 'Shortened link', detail: `${p.host} hides where the link really goes.` });
    if (info.publicSuffix && RISKY_TLDS.has(info.publicSuffix.split('.').pop() ?? '')) add({ level: 'warn', weight: 10, title: `Unusual ending ".${info.publicSuffix}"`, detail: 'Cheap domain endings like this are used a lot for scam sites.' });
    if ((p.host.match(/\./g)?.length ?? 0) >= 4 || (p.host.match(/-/g)?.length ?? 0) >= 3) add({ level: 'warn', weight: 6, title: 'Very long, complicated address', detail: p.host });
    const born = ages.get(reg);
    if (born) {
      const days = (Date.now() - born.getTime()) / 86400_000;
      if (days < 30) add({ level: 'bad', weight: 25, title: `${reg} was created ${ago(born)}`, detail: 'Brand-new websites are a strong scam sign: real companies have had theirs for years.' });
      else if (days < 180) add({ level: 'warn', weight: 10, title: `${reg} is only ${ago(born)} old`, detail: 'A young website: be careful.' });
    }
    const real = officialBrand(p.host);
    if (real && !notes.length) { level = 'good'; notes.push(`Real ${real.name} website`); signals.push({ source: 'link', level: 'good', weight: -8, title: `${reg} is ${real.name}’s real website` }); }
    links.push({ url: p.url, domain: reg, level, note: notes.join(' · ') || 'Nothing known against it', age: born ? `registered ${ago(born)}` : undefined });
  }
  return { links, signals };
}
