import type { CheckResult, Signal } from '../src/lib/types.js';
import { verdictOf } from '../src/lib/types.js';
import { aiRisk, type AiAnswer } from './ai.js';
import { defaultSteps, scoreOf, type FreeResult } from './analyze.js';

/** Free checks + the AI's answer -> the final result. The AI weighs more when it is sure, but never hides a certain sign. */
export function mergeAi(base: CheckResult, free: FreeResult, a: AiAnswer): CheckResult {
  const freeScore = scoreOf(free.signals);
  const { risk, weight } = aiRisk(a);
  let score = Math.round(risk * weight + freeScore * (1 - weight));
  if (free.signals.some((s) => s.hard)) score = Math.max(score, 90);
  // A strong free sign (fake company link, gift cards, new website…) keeps it at least "suspicious", whatever the AI says.
  if (freeScore >= 45 || free.signals.some((x) => x.weight >= 25)) score = Math.max(score, 35);
  score = Math.max(0, Math.min(100, score));
  const verdict = verdictOf(score);
  const aiSignals: Signal[] = [
    ...a.redFlags.slice(0, 5).map((r) => ({ source: 'ai' as const, level: 'bad' as const, title: r.title, detail: r.detail, weight: 0 })),
    ...a.goodSigns.slice(0, 3).map((g) => ({ source: 'ai' as const, level: 'good' as const, title: g, weight: 0 })),
  ];
  const steps = a.whatToDo.length ? a.whatToDo.slice(0, 4) : defaultSteps(verdict);
  if (verdict === 'scam' && !steps.some((s) => /report|7726|ftc/i.test(s))) steps.push(defaultSteps('scam')[2]);
  return {
    ...base,
    verdict, score,
    summary: a.summary || base.summary,
    signals: [...free.signals, ...aiSignals],
    links: free.links, phones: free.phones, sender: free.sender ?? base.sender,
    impersonating: a.impersonating.trim() || undefined,
    whatToDo: steps,
    // The short summary is kept only when the final answer is "safe".
    brief: verdict === 'safe' && a.brief.whatItIs.trim() ? { whatItIs: a.brief.whatItIs.trim(), keyInfo: a.brief.keyInfo.filter((k) => k.label.trim() && k.value.trim()).slice(0, 5), steps: a.brief.steps.filter((x) => x.trim()).slice(0, 3) } : undefined,
    ai: 'done', aiNote: undefined, unchecked: undefined, aiOffer: undefined, briefOffer: undefined,
    preview: base.preview || a.readText.replace(/\s+/g, ' ').trim().slice(0, 140),
  };
}
