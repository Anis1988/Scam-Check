import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { parse, type HTMLElement } from 'node-html-parser';
import type { SeoReport } from '../src/lib/types.js';

/**
 * 🌐 Website SEO: the ONE place the app opens a web address (owner's OK), and only an address typed into the SEO tool.
 * The page is read as text by the server (nothing runs), safely: http(s) on the usual ports only, never a private or
 * local address (checked again on every redirect), 3 MB and 12 s at most.
 */
const UA = 'Mozilla/5.0 (compatible; ScamCheck-SEO/1.0; +https://scamcheck-anis.vercel.app)';
const MAX_BYTES = 3_000_000;

function privateIp(ip: string): boolean {
  if (isIP(ip) === 6) {
    const x = ip.toLowerCase();
    if (x.startsWith('::ffff:')) return privateIp(x.slice(7));
    return x === '::1' || x === '::' || x.startsWith('fc') || x.startsWith('fd') || x.startsWith('fe80') || x.startsWith('64:ff9b');
  }
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}
async function safeUrl(raw: string): Promise<URL> {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) && !/^https?:\/\//i.test(raw)) throw new Error('Only http and https websites can be read.');
  const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('Only http and https websites can be read.');
  if (u.port && u.port !== '80' && u.port !== '443') throw new Error('Only websites on the usual ports can be read.');
  if (u.username || u.password) throw new Error('Leave out the user name and password from the address.');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (/^(localhost|.*\.local|.*\.internal)$/i.test(host)) throw new Error('This address is not a public website.');
  const ips = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => { throw new Error(`${host} wasn’t found: check the address.`); })).map((x) => x.address);
  if (!ips.length || ips.some(privateIp)) throw new Error('This address is not a public website.');
  return u;
}

/** GET a public page as text (following up to 5 redirects, each checked). */
export async function fetchPage(raw: string): Promise<{ url: string; status: number; html: string; ms: number; bytes: number; type: string }> {
  let u = await safeUrl(raw);
  const t0 = Date.now();
  for (let hop = 0; hop < 6; hop++) {
    const res = await fetch(u, { redirect: 'manual', headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,text/plain;q=0.8,*/*;q=0.5' }, signal: AbortSignal.timeout(12_000) })
      .catch(() => { throw new Error(`${u.hostname} didn’t answer (it may be down or block robots).`); });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      u = await safeUrl(new URL(res.headers.get('location')!, u).toString());
      continue;
    }
    const type = res.headers.get('content-type') ?? '';
    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > MAX_BYTES) { void reader.cancel(); break; }
      chunks.push(value);
    }
    const html = new TextDecoder().decode(Buffer.concat(chunks));
    return { url: u.toString(), status: res.status, html, ms: Date.now() - t0, bytes, type };
  }
  throw new Error('Too many redirects.');
}

/** robots.txt and the sitemap: there or not (and the sitemap address robots.txt gives). */
async function siteFiles(base: URL): Promise<{ robotsTxt: boolean; sitemap: boolean; blocksAll: boolean }> {
  const get = async (path: string) => {
    try {
      const r = await fetchPage(new URL(path, base).toString());
      return r.status === 200 && !/text\/html/i.test(r.type) ? r.html : '';
    } catch { return ''; }
  };
  const robots = await get('/robots.txt');
  const smUrl = robots.match(/^\s*sitemap:\s*(\S+)/im)?.[1];
  const sitemap = await get(smUrl && /^https?:\/\//i.test(smUrl) ? smUrl : '/sitemap.xml');
  const blocksAll = /user-agent:\s*\*\s*[\r\n]+(?:[^\r\n]*[\r\n]+)*?\s*disallow:\s*\/\s*$/im.test(robots);
  return { robotsTxt: !!robots, sitemap: /<(urlset|sitemapindex)/i.test(sitemap), blocksAll };
}

const clean = (s: string | undefined, n = 300) => (s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

/** Everything the free checks read on the page, the issues they find, a score, and text for the AI. */
export async function auditPage(raw: string, withFiles = true): Promise<{ report: SeoReport; text: string }> {
  const page = await fetchPage(raw);
  if (page.status >= 400) throw new Error(`The website answered “${page.status}”: the page couldn’t be read (check the address).`);
  if (!/html|xml|text\/plain/i.test(page.type) && page.type) throw new Error(`This address isn’t a web page (${page.type.split(';')[0]}).`);
  const url = new URL(page.url);
  const root = parse(page.html, { comment: false, blockTextElements: { script: true, style: true, noscript: false, pre: true } });
  const meta = (sel: string) => root.querySelector(sel)?.getAttribute('content')?.trim();
  const title = clean(root.querySelector('title')?.text, 200);
  const description = clean(meta('meta[name="description" i]') ?? meta('meta[name=description]'), 400);
  const schema = root.querySelectorAll('script[type="application/ld+json"]').flatMap((s) => {
    try {
      const j = JSON.parse(s.text) as unknown;
      const list = (Array.isArray(j) ? j : [j]) as Record<string, unknown>[];
      return list.flatMap((x) => (Array.isArray(x['@graph']) ? (x['@graph'] as Record<string, unknown>[]) : [x])).map((x) => String(x['@type'] ?? '')).filter(Boolean);
    } catch { return []; }
  }).slice(0, 10);
  const headings = root.querySelectorAll('h1, h2, h3').map((h) => ({ level: Number(h.tagName[1]), text: clean(h.text, 140) })).filter((h) => h.text).slice(0, 60);
  for (const el of root.querySelectorAll('script, style, noscript, svg, template')) el.remove();
  const body = (root.querySelector('main') ?? root.querySelector('body') ?? root) as HTMLElement;
  const text = clean(body.structuredText, 60_000);
  const words = text ? text.split(/\s+/).length : 0;
  const imgs = root.querySelectorAll('img');
  const links = root.querySelectorAll('a[href]').map((a) => a.getAttribute('href') ?? '').filter((h) => h && !/^(#|javascript:|mailto:|tel:)/i.test(h));
  const internal = links.filter((h) => { try { return new URL(h, url).hostname === url.hostname; } catch { return false; } }).length;
  const files = withFiles ? await siteFiles(url) : { robotsTxt: true, sitemap: true, blocksAll: false };

  const report: SeoReport = {
    url: page.url, score: 0, fetchedMs: page.ms, sizeKb: Math.round(page.bytes / 1024),
    meta: {
      title, description,
      canonical: root.querySelector('link[rel="canonical"]')?.getAttribute('href') || undefined,
      robots: meta('meta[name="robots"]'),
      viewport: !!root.querySelector('meta[name="viewport"]'),
      lang: root.querySelector('html')?.getAttribute('lang') || undefined,
      ogTitle: meta('meta[property="og:title"]'), ogDescription: meta('meta[property="og:description"]'), ogImage: meta('meta[property="og:image"]'),
      twitterCard: meta('meta[name="twitter:card"]'),
      schema,
      favicon: !!root.querySelector('link[rel~="icon"]'),
    },
    headings,
    stats: { words, images: imgs.length, imagesNoAlt: imgs.filter((i) => !(i.getAttribute('alt') ?? '').trim()).length, linksInternal: internal, linksExternal: links.length - internal, https: url.protocol === 'https:', robotsTxt: files.robotsTxt, sitemap: files.sitemap },
    issues: [],
  };

  // The free checks: each issue costs points (high 12, medium 6, low 2).
  const add = (level: 'high' | 'medium' | 'low', what: string, fix: string) => report.issues.push({ level, what, fix });
  const h1 = headings.filter((h) => h.level === 1).length;
  if (!report.stats.https) add('high', 'The site isn’t on https (not secure)', 'Turn on https (free with most hosts) and redirect http to https.');
  if (/noindex/i.test(report.meta.robots ?? '')) add('high', 'The page tells Google not to list it (noindex)', 'Remove “noindex” from the robots meta tag if you want it found.');
  if (files.blocksAll) add('high', 'robots.txt blocks the whole site', 'Change “Disallow: /” in robots.txt so search engines can read the site.');
  if (!title) add('high', 'No page title', 'Add a <title> of 30–60 characters with the main keyword first.');
  else if (title.length < 30) add('medium', `The title is short (${title.length} characters)`, 'Use 30–60 characters: main keyword + what you offer + brand.');
  else if (title.length > 60) add('low', `The title is long (${title.length} characters) and may be cut in Google`, 'Keep it under 60 characters.');
  if (!description) add('high', 'No meta description', 'Add a 70–160 character description that makes people want to click.');
  else if (description.length < 70) add('medium', `The meta description is short (${description.length} characters)`, 'Use 70–160 characters.');
  else if (description.length > 160) add('low', `The meta description is long (${description.length} characters)`, 'Keep it under 160 characters.');
  if (!h1) add('high', 'No main heading (H1)', 'Add one H1 that says what the page is about.');
  else if (h1 > 1) add('low', `${h1} main headings (H1)`, 'Use one H1 per page, then H2s for sections.');
  if (!headings.some((h) => h.level === 2)) add('low', 'No section headings (H2)', 'Break the page into sections with H2 headings.');
  if (words < 300) add('medium', `Little text on the page (${words} words)`, 'Pages with 300+ useful words usually rank better.');
  if (!report.meta.viewport) add('high', 'Not set up for phones (no viewport tag)', 'Add <meta name="viewport" content="width=device-width, initial-scale=1">.');
  if (report.stats.imagesNoAlt) add(report.stats.imagesNoAlt > 5 ? 'medium' : 'low', `${report.stats.imagesNoAlt} of ${imgs.length} images have no description (alt text)`, 'Describe each image in its alt text: it helps Google Images and blind visitors.');
  if (!report.meta.canonical) add('low', 'No canonical address', 'Add <link rel="canonical"> with the page’s main address to avoid duplicates.');
  if (!report.meta.ogTitle || !report.meta.ogImage) add('low', 'Missing social sharing tags (og:title / og:image)', 'Add Open Graph tags so links look good on Facebook, WhatsApp and LinkedIn.');
  if (!schema.length) add('low', 'No structured data (schema.org)', 'Add JSON-LD (Organization, LocalBusiness, Product, Article…) for richer Google results.');
  if (!files.sitemap) add('medium', 'No sitemap found', 'Create sitemap.xml and add it in Google Search Console and robots.txt.');
  if (!files.robotsTxt) add('low', 'No robots.txt', 'Add a simple robots.txt with your sitemap address.');
  if (!report.meta.lang) add('low', 'The page language isn’t set', 'Add lang="en" (or your language) to the <html> tag.');
  if (page.ms > 3000) add('medium', `The page was slow to load (${(page.ms / 1000).toFixed(1)} s)`, 'Compress images, use caching and a CDN.');
  if (report.sizeKb > 1500) add('low', `The page is heavy (${report.sizeKb} KB of HTML)`, 'Trim inline code and scripts.');
  if (!report.meta.favicon) add('low', 'No site icon (favicon)', 'Add a favicon: it shows in Google’s mobile results.');
  const order = { high: 0, medium: 1, low: 2 } as const;
  report.issues.sort((a, b) => order[a.level] - order[b.level]);
  report.score = Math.max(0, 100 - report.issues.reduce((n, i) => n + (i.level === 'high' ? 12 : i.level === 'medium' ? 6 : 2), 0));

  const outline = headings.map((h) => `${'  '.repeat(h.level - 1)}H${h.level}: ${h.text}`).join('\n');
  const forAi = `URL: ${page.url}\nTITLE: ${title}\nDESCRIPTION: ${description}\nHEADINGS:\n${outline}\nWORDS: ${words}\nPAGE TEXT (start):\n${text.slice(0, 12_000)}`;
  return { report, text: forAi };
}

/** A competitor's page, briefly (title, description, headings, words) for the comparison; null when it can't be read. */
export async function competitorBrief(raw: string): Promise<string | null> {
  try {
    const { report } = await auditPage(raw, false);
    return `COMPETITOR ${report.url}\nTITLE: ${report.meta.title}\nDESCRIPTION: ${report.meta.description}\nWORDS: ${report.stats.words}\nHEADINGS: ${report.headings.filter((h) => h.level <= 2).map((h) => h.text).join(' | ').slice(0, 1500)}`;
  } catch {
    return null;
  }
}
