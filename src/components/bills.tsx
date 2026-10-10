import { money, type BillCompare, type BillFacts } from '../lib/types';

/** "Oct 24" / "Oct 24, 2027" */
export const dueLabel = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(d.slice(0, 4) !== String(new Date().getFullYear()) ? { year: 'numeric' } : {}) });
/** Days from today to the due date (negative = overdue). */
export const daysUntil = (d: string) => Math.round((new Date(`${d}T12:00:00`).getTime() - new Date(new Date().toDateString()).getTime() - 12 * 3600_000) / 86400_000);
export function dueText(d: string): string {
  if (!d) return 'No due date';
  const n = daysUntil(d);
  return n === 0 ? 'due today' : n === 1 ? 'due tomorrow' : n > 1 ? `due in ${n} days` : n === -1 ? 'was due yesterday' : `was due ${-n} days ago`;
}

/** "📈 45% more than last time ($98.20, due Sep 24)" */
export function CompareLine({ c }: { c: BillCompare }) {
  const when = c.prevDue ? `due ${dueLabel(c.prevDue)}` : `checked ${new Date(c.prevCheckedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  const big = c.change >= 50;
  return (
    <p className={`text-sm ${big ? 'text-amber-800' : 'text-stone-700'}`}>
      {c.change === 0 ? '➖ The same as last time' : c.change > 0 ? `📈 ${c.change}% more than last time` : `📉 ${-c.change}% less than last time`} <span className="text-stone-500">({money(c.prevAmount)}, {when})</span>
      {big && <span className="block text-xs">Much higher than usual: check it in the company’s own app or website before paying.</span>}
    </p>
  );
}

/** A safe bill's numbers on a result: amount, due date, compared to last time. */
export function BillStrip({ b, compare }: { b: BillFacts; compare?: BillCompare }) {
  const n = b.dueDate ? daysUntil(b.dueDate) : null;
  return (
    <div className="card space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="label">📅 Added to Bills</p>
        {n !== null && <span className={`chip ${n < 0 ? 'border-amber-200 bg-amber-50 text-amber-800' : n <= 3 ? 'border-teal-200 bg-teal-50 text-teal-800' : 'border-stone-200 bg-white/70 text-stone-600'}`}>{dueText(b.dueDate)}</span>}
      </div>
      <p className="flex flex-wrap items-baseline gap-x-2"><span className="font-display text-xl font-bold text-stone-900">{money(b.amount)}</span><span className="text-sm text-stone-600">{b.company}{b.dueDate ? ` · due ${dueLabel(b.dueDate)}` : ''}{b.account ? ` · •••• ${b.account}` : ''}</span></p>
      {compare ? <CompareLine c={compare} /> : <p className="text-xs text-stone-500">The next {b.company} bill you check will be compared with this one.</p>}
    </div>
  );
}
