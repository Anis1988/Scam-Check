import type { DocResult } from './types';
import { downloadFile } from './api';

/**
 * 🌐 The SEO report as a PDF, made on the device (jsPDF, loaded only when asked): score, fix-first list, meta tags,
 * headings, content, keywords, competitors and gaps, every issue with its fix. Saved as "SEO - example.com - date.pdf"
 * (in the Android app: the Share menu, to save or send it).
 */
const latin = (s: string) => s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[–—]/g, '-').replace(/…/g, '...').replace(/→/g, '->').replace(/[^\x20-\x7E\xA0-\xFF\n]/g, '').trim();

export async function downloadSeoPdf(r: DocResult): Promise<void> {
  const s = r.seo;
  if (!s) return;
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();
  const M = 48;
  let y = M;
  const teal: [number, number, number] = [49, 106, 114];
  const grey: [number, number, number] = [107, 120, 130];
  const ink: [number, number, number] = [27, 34, 39];
  const room = (h: number) => { if (y + h > H - M) { pdf.addPage(); y = M; } };
  const text = (t: string, o: { size?: number; bold?: boolean; color?: [number, number, number]; indent?: number; gap?: number } = {}) => {
    const size = o.size ?? 10.5;
    pdf.setFont('helvetica', o.bold ? 'bold' : 'normal').setFontSize(size).setTextColor(...(o.color ?? ink));
    const lines = pdf.splitTextToSize(latin(t), W - 2 * M - (o.indent ?? 0)) as string[];
    for (const line of lines) { room(size * 1.35); pdf.text(line, M + (o.indent ?? 0), y + size); y += size * 1.35; }
    y += o.gap ?? 3;
  };
  const heading = (t: string) => { y += 8; room(40); text(t.toUpperCase(), { size: 9, bold: true, color: teal, gap: 2 }); pdf.setDrawColor(...teal).setLineWidth(0.6).line(M, y, W - M, y); y += 8; };
  const bullet = (t: string, mark = '-') => text(`${mark}  ${t}`, { indent: 8 });

  const content = s.content?.score;
  const overall = content !== undefined && s.content?.summary ? Math.round(0.6 * s.score + 0.4 * content) : s.score;
  const date = new Date(r.checkedAt);
  text('Website SEO report', { size: 20, bold: true });
  text(s.url, { size: 11, color: teal });
  text(`${date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}${r.aiBy ? `  |  AI: ${r.aiBy}` : ''}  |  Scam Check`, { size: 9, color: grey, gap: 10 });
  text(`Overall score: ${overall} / 100`, { size: 16, bold: true, color: overall >= 80 ? [77, 118, 91] : overall >= 50 ? [135, 109, 61] : [138, 86, 78] });
  text(`Technical (free checks): ${s.score} / 100${content !== undefined && s.content?.summary ? `   |   Content (AI): ${content} / 100` : ''}`, { size: 10, color: grey, gap: 6 });
  if (r.summary) text(r.summary, { gap: 6 });

  if (s.topFixes?.length) { heading('Fix these first'); s.topFixes.forEach((f, i) => bullet(f, `${i + 1}.`)); }
  heading('Issues found (free checks)');
  if (!s.issues.length) text('No technical issues found.');
  for (const i of s.issues) {
    text(`[${i.level === 'high' ? 'HIGH' : i.level === 'medium' ? 'MEDIUM' : 'LOW'}] ${i.what}`, { bold: true, gap: 0 });
    text(`Fix: ${i.fix}`, { indent: 12, color: grey, gap: 5 });
  }

  heading('Meta tags');
  const m = s.meta;
  const row = (k: string, v?: string | boolean) => text(`${k}: ${v === true ? 'yes' : v === false || v === undefined || v === '' ? 'missing' : v}`, { indent: 4, gap: 1 });
  row(`Title (${m.title.length} chars)`, m.title);
  row(`Description (${m.description.length} chars)`, m.description);
  row('Canonical', m.canonical); row('Robots', m.robots ?? 'index (default)'); row('Phone-ready (viewport)', m.viewport); row('Language', m.lang);
  row('og:title', m.ogTitle); row('og:image', m.ogImage); row('Twitter card', m.twitterCard); row('Structured data', m.schema.join(', ') || undefined); row('Favicon', m.favicon);

  heading('Page facts');
  const st = s.stats;
  row('https', st.https); row('Words', String(st.words)); row('Images', `${st.images} (${st.imagesNoAlt} without alt text)`);
  row('Links', `${st.linksInternal} internal, ${st.linksExternal} external`); row('robots.txt', st.robotsTxt); row('Sitemap', st.sitemap);
  row('Load time', `${(s.fetchedMs / 1000).toFixed(1)} s`); row('HTML size', `${s.sizeKb} KB`);

  heading('Headings');
  if (!s.headings.length) text('No headings found.');
  for (const h of s.headings.slice(0, 40)) text(`H${h.level}  ${h.text}`, { indent: 4 + (h.level - 1) * 14, gap: 0 });

  if (s.content?.summary) {
    heading('Content quality');
    text(s.content.summary, { gap: 4 });
    s.content.strengths.forEach((x) => bullet(x, '+'));
    s.content.weaknesses.forEach((x) => bullet(x, '-'));
  }
  if (s.keywords?.length) {
    heading('Keyword opportunities');
    for (const k of s.keywords) { text(k.keyword, { bold: true, gap: 0 }); text(`${k.why}  ->  ${k.where}`, { indent: 12, color: grey, gap: 5 }); }
  }
  if (s.competitors?.length) { heading('Competitors'); s.competitors.forEach((c) => bullet(`${c.site}: ${c.note}`)); }
  if (s.gaps?.length) {
    heading('Competitor gaps');
    for (const g of s.gaps) { text(g.gap, { bold: true, gap: 0 }); text(`Add: ${g.action}`, { indent: 12, color: grey, gap: 5 }); }
  }
  if (r.note) { heading('Note'); text(r.note, { color: grey }); }

  const pages = pdf.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    pdf.setPage(i).setFont('helvetica', 'normal').setFontSize(8).setTextColor(...grey);
    pdf.text(`${latin(s.url).slice(0, 80)}  |  page ${i} of ${pages}`, M, H - 24);
  }
  const host = (() => { try { return new URL(s.url).hostname.replace(/^www\./, ''); } catch { return 'website'; } })();
  const data = pdf.output('datauristring').split(',')[1] ?? '';
  await downloadFile({ mime: 'application/pdf', name: `SEO - ${host} - ${date.toISOString().slice(0, 10)}.pdf`, data });
}
