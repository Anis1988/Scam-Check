import type { CheckResult } from '../../src/lib/types';
import { askAi } from '../lib/ai';
import { freeChecks } from '../lib/analyze';
import { mergeAi } from '../lib/merge';
import { readJson, store, writeJson } from '../lib/store';
import type { Job } from './check';

/** Background job (up to 15 minutes): the AI check of one message, then the merged result is saved. */
export default async (req: Request): Promise<void> => {
  if (!process.env.APP_ACCESS_TOKEN || req.headers.get('x-job-key') !== process.env.APP_ACCESS_TOKEN) return;
  const { id } = (await req.json().catch(() => ({}))) as { id?: string };
  if (!id || !/^[a-f0-9]{32}$/.test(id)) return;
  const job = await readJson<Job | null>(`job/${id}`, null);
  if (!job) return;
  let result: CheckResult;
  try {
    const a = await askAi({ kind: job.kind, text: job.text, file: job.file, from: job.from, signals: job.free.signals });
    // A picture or PDF: run the free checks on what the AI read in it (its links and phone numbers too).
    const free = job.text ? job.free : await freeChecks(a.readText, { from: job.from, links: a.links, phones: a.phones });
    result = mergeAi(job.base, free, a);
  } catch (e) {
    result = { ...job.base, ai: 'failed', aiNote: `The AI check failed (${(e instanceof Error ? e.message : String(e)).slice(0, 160)}). The result below is from the free checks.` };
  }
  await writeJson(`result/${id}`, { ...result, savedAt: Date.now() });
  await store().delete(`job/${id}`); // the message itself isn't kept
};
