import { parse } from 'tldts';
import { parsePhoneNumberFromString } from 'libphonenumber-js/max';
import type { CheckResult, ListEntry, ListKind, Signal } from '../src/lib/types.js';
import { verdictOf } from '../src/lib/types.js';
import { defaultSteps } from './analyze.js';

/** "(513) 555-0100", "513.555.0100" -> "+1 513 555 0100"; "https://www.Chase.com/x" -> "chase.com"; emails lowercased. */
export function normalize(raw: string): { kind: ListKind; value: string } | null {
  const v = raw.trim().replace(/^mailto:|^tel:/i, '');
  if (!v || v.length > 200) return null;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return { kind: 'email', value: v.toLowerCase() };
  if (/^[+\d(][\d\s().-]{5,}$/.test(v)) {
    const p = parsePhoneNumberFromString(v, 'US');
    return p ? { kind: 'phone', value: p.formatInternational() } : null;
  }
  const host = (() => { try { return new URL(/^https?:\/\//i.test(v) ? v : `http://${v}`).hostname; } catch { return ''; } })();
  const d = host ? parse(host).domain : null;
  return d ? { kind: 'domain', value: d.toLowerCase() } : null;
}
/** Phones are matched by their digits, so "+1 513 555 0100" and "(513) 555-0100" are the same number. */
export const listKey = (n: { kind: ListKind; value: string }) => `${n.kind}:${n.kind === 'phone' ? n.value.replace(/\D/g, '') : n.value}`;

/**
 * Your ✅ trusted / 🚫 blocked lists, applied to a result every time it is shown (so adding or removing an entry
 * counts at once, also for remembered results). Blocked = likely scam. Trusted lowers the risk a little, but a strong
 * free warning still keeps it at least "suspicious" (a trusted name can be faked).
 */
export function withLists(r: CheckResult, lists: ListEntry[]): CheckResult {
  if (!lists.length) return r;
  const keys = new Map(lists.map((e) => [e.key, e]));
  const found: ListEntry[] = [];
  const look = (raw: string | undefined) => {
    const n = raw ? normalize(raw) : null;
    const e = n && keys.get(listKey(n));
    if (e && !found.includes(e)) found.push(e);
    // An email address also matches its website ("someone@chase.com" -> chase.com).
    if (n?.kind === 'email') look(n.value.split('@')[1]);
  };
  r.links.forEach((l) => look(l.domain));
  r.phones.forEach((p) => look(p.number));
  look(r.sender?.address);
  look(r.sender?.replyTo);
  if (!found.length) return r;

  const blocked = found.filter((e) => e.list === 'blocked');
  const trusted = found.filter((e) => e.list === 'trusted');
  const signals: Signal[] = [
    ...blocked.map((e) => ({ source: 'list' as const, level: 'bad' as const, weight: 60, hard: true, title: `You marked ${e.value} as a scam` })),
    ...trusted.map((e) => ({ source: 'list' as const, level: 'good' as const, weight: -20, title: `${e.value} is on your trusted list` })),
  ];
  const strong = r.signals.some((s) => s.hard || s.weight >= 25);
  const score = blocked.length ? Math.max(r.score, 92) : strong ? Math.max(Math.min(r.score, 35), r.score - 20) : Math.max(0, r.score - 20);
  const verdict = verdictOf(score);
  const changed = verdict !== r.verdict;
  return {
    ...r,
    score, verdict,
    signals: [...r.signals, ...signals],
    summary: blocked.length ? `You marked ${blocked[0].value} as a scam. ${r.verdict === 'scam' ? r.summary : ''}`.trim()
      : changed && verdict === 'safe' ? `${trusted[0].value} is on your trusted list, and nothing else looks wrong.`
      : changed ? `${trusted[0].value} is on your trusted list, but some things still look off. ${r.summary}` : r.summary,
    whatToDo: changed ? defaultSteps(verdict) : r.whatToDo,
    brief: verdict === 'safe' ? r.brief : undefined,
    bill: verdict === 'safe' ? r.bill : undefined,
    aiOffer: verdict === 'suspicious' ? r.aiOffer : undefined,
    briefOffer: verdict === 'safe' ? (r.briefOffer || (changed && r.aiOffer) || undefined) : undefined,
    links: r.links.map((l) => ({ ...l, level: blocked.some((e) => e.value === l.domain) ? 'bad' : trusted.some((e) => e.value === l.domain) && l.level !== 'bad' ? 'good' : l.level })),
  };
}
