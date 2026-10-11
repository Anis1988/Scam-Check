import { readUpload } from './api';

/**
 * 📄 Docs: the words are taken out of the file here, on the device, so any AI can read it and big files stay small:
 * PDF (pdf.js, loaded only when needed), Word .docx, OpenDocument .odt, PowerPoint .pptx, and text-like files
 * (.txt, .md, .csv, .html, .rtf, .json, .xml). A scanned PDF (only pictures, no words) is sent as the PDF itself
 * (Claude or Gemini read it; 3 MB max). Photos of paper pages are sent as pictures.
 */
export interface DocInput { name: string; text?: string; pdf?: string; images?: { mime: 'image/jpeg'; data: string }[] }

const ext = (name: string) => name.split('.').pop()?.toLowerCase() ?? '';
export const DOC_ACCEPT = '.pdf,.docx,.odt,.pptx,.txt,.md,.csv,.html,.htm,.rtf,.json,.xml,image/*,application/pdf';

/** The server reads about the first 40 pages; very long text is cut here so it is never refused for its size. */
export async function readDoc(files: File[]): Promise<DocInput> {
  const d = await readDocFull(files);
  return d.text && d.text.length > 390_000 ? { ...d, text: d.text.slice(0, 390_000) } : d;
}

async function readDocFull(files: File[]): Promise<DocInput> {
  // Photos of the pages of one paper document (up to 6), in the order picked.
  if (files.every((f) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif)$/i.test(f.name))) {
    if (files.length > 6) throw new Error('Up to 6 photos (pages) per document.');
    const pics = [];
    for (const f of files) pics.push(await readUpload(f, 1600));
    return { name: files.length > 1 ? `${files.length} photos` : files[0].name, images: pics.map((p) => ({ mime: 'image/jpeg' as const, data: p.data })) };
  }
  if (files.length > 1) throw new Error('One document at a time (or several photos of the pages of one paper).');
  const f = files[0];
  const e = ext(f.name);
  if (f.size > 60_000_000) throw new Error('This file is too big (60 MB max).');
  if (e === 'pdf' || f.type === 'application/pdf') {
    const text = await pdfText(f);
    if (text.replace(/\s+/g, '').length > 80) return { name: f.name, text };
    // Scanned: only pictures of the pages.
    if (f.size > 3 * 1024 * 1024) throw new Error('This PDF is scanned (pictures only) and over 3 MB: take photos of the pages instead (up to 6).');
    return { name: f.name, pdf: await toBase64(f) };
  }
  if (e === 'docx') return { name: f.name, text: xmlText(await unzipOne(f, 'word/document.xml'), 'w:p', 'w:t') };
  if (e === 'odt') return { name: f.name, text: xmlText(await unzipOne(f, 'content.xml'), 'text:p', null) };
  if (e === 'pptx') {
    const slides = await unzipAll(f, /^ppt\/slides\/slide(\d+)\.xml$/);
    return { name: f.name, text: slides.map(([n, x], i) => `--- Slide ${i + 1} (${n}) ---\n${xmlText(x, 'a:p', 'a:t')}`).join('\n\n') };
  }
  if (e === 'doc' || e === 'xls' || e === 'xlsx' || e === 'pages' || e === 'ppt') throw new Error(`.${e} files can’t be read here: save it as PDF (or .docx) and try again.`);
  // RTF and web pages first: some computers call them "text/…", and their code must be cleaned out.
  if (e === 'rtf' || f.type === 'text/rtf' || f.type === 'application/rtf') return { name: f.name, text: rtfText(await f.text()) };
  if (e === 'html' || e === 'htm' || f.type === 'text/html') return { name: f.name, text: htmlText(await f.text()) };
  if (/^(txt|md|csv|tsv|json|xml|log)$/.test(e) || f.type.startsWith('text/')) return { name: f.name, text: await f.text() };
  throw new Error('Choose a PDF, Word (.docx), text file, or photos of the pages.');
}

/** The words of every page, with page marks (pdf.js, loaded only here). */
async function pdfText(f: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  const task = pdfjs.getDocument({ data: new Uint8Array(await f.arrayBuffer()) });
  const pdf = await task.promise;
  const pages: string[] = [];
  let total = 0;
  for (let i = 1; i <= pdf.numPages && total < 400_000; i++) {
    const c = await (await pdf.getPage(i)).getTextContent();
    let line = '';
    const out: string[] = [];
    for (const it of c.items as { str?: string; hasEOL?: boolean }[]) {
      line += it.str ?? '';
      if (it.hasEOL) { out.push(line); line = ''; }
    }
    if (line) out.push(line);
    const t = out.join('\n').replace(/[ \t]+/g, ' ').trim();
    pages.push(`--- Page ${i} ---\n${t}`);
    total += t.length;
  }
  await task.destroy();
  return pages.join('\n\n');
}

/** Word-style XML -> plain text: one line per paragraph. */
function xmlText(xml: string, para: string, run: string | null): string {
  const unescape = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  const paras = xml.split(new RegExp(`</${para}>`));
  return paras.map((p) => {
    const tabbed = p.replace(/<w:tab\/>|<text:tab\/>/g, '\t').replace(/<w:br\/>|<text:line-break\/>/g, '\n');
    const bits = run ? [...tabbed.matchAll(new RegExp(`<${run}(?:\\s[^>]*)?>([^<]*)</${run}>`, 'g'))].map((m) => m[1]) : [tabbed.replace(/<[^>]+>/g, '')];
    return unescape(bits.join(''));
  }).filter((l) => l.trim()).join('\n');
}
const htmlText = (html: string) => new DOMParser().parseFromString(html, 'text/html').body?.innerText ?? '';
const rtfText = (rtf: string) => rtf.replace(/\\par[d]?/g, '\n').replace(/\{\\\*[^}]*\}|\\[a-z]+-?\d* ?|[{}]/gi, '').replace(/\n{3,}/g, '\n\n').trim();

/** A tiny zip reader (Word, OpenDocument and PowerPoint files are zips), using the browser's own unzip. */
async function entries(f: File): Promise<{ name: string; method: number; size: number; offset: number }[]> {
  const buf = new DataView(await f.slice(Math.max(0, f.size - 66_000)).arrayBuffer());
  let end = -1;
  for (let i = buf.byteLength - 22; i >= 0; i--) if (buf.getUint32(i, true) === 0x06054b50) { end = i; break; }
  if (end < 0) throw new Error('This file looks damaged: save it again as PDF and try again.');
  const count = buf.getUint16(end + 10, true);
  const dirSize = buf.getUint32(end + 12, true);
  const dirOffset = buf.getUint32(end + 16, true);
  const dir = new DataView(await f.slice(dirOffset, dirOffset + dirSize).arrayBuffer());
  const out = [];
  let p = 0;
  for (let i = 0; i < count && p + 46 <= dir.byteLength; i++) {
    const method = dir.getUint16(p + 10, true);
    const size = dir.getUint32(p + 20, true);
    const nameLen = dir.getUint16(p + 28, true);
    const extra = dir.getUint16(p + 30, true);
    const comment = dir.getUint16(p + 32, true);
    const offset = dir.getUint32(p + 42, true);
    const name = new TextDecoder().decode(new Uint8Array(dir.buffer, dir.byteOffset + p + 46, nameLen));
    out.push({ name, method, size, offset });
    p += 46 + nameLen + extra + comment;
  }
  return out;
}
async function inflate(f: File, e: { method: number; size: number; offset: number }): Promise<string> {
  const head = new DataView(await f.slice(e.offset, e.offset + 30).arrayBuffer());
  const start = e.offset + 30 + head.getUint16(26, true) + head.getUint16(28, true);
  const raw = f.slice(start, start + e.size);
  if (e.method === 0) return raw.text();
  if (e.method !== 8) throw new Error('This file uses an unusual format: save it as PDF and try again.');
  return new Response(raw.stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
}
async function unzipOne(f: File, name: string): Promise<string> {
  const e = (await entries(f)).find((x) => x.name === name);
  if (!e) throw new Error('No text was found in this file: save it as PDF and try again.');
  return inflate(f, e);
}
async function unzipAll(f: File, re: RegExp): Promise<[string, string][]> {
  const list = (await entries(f)).filter((x) => re.test(x.name)).sort((a, b) => Number(a.name.match(re)![1]) - Number(b.name.match(re)![1]));
  const out: [string, string][] = [];
  for (const e of list) out.push([e.name.split('/').pop()!, await inflate(f, e)]);
  return out;
}

const toBase64 = (f: File) => new Promise<string>((ok, fail) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result).split(',')[1] ?? '');
  r.onerror = () => fail(new Error('The file could not be read.'));
  r.readAsDataURL(f);
});

/** The same document (same words or file, same mode) gets the same id: it's answered again for free. */
export async function docId(mode: 'analyze' | 'compare', docs: DocInput[]): Promise<string> {
  const raw = JSON.stringify([mode, docs.map((d) => d.text ?? d.pdf ?? d.images?.map((i) => i.data).join('') ?? '')]);
  const h = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw)))].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `d${mode === 'compare' ? 'c' : 'a'}-${h.slice(0, 40)}`;
}
