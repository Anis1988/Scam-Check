import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { money, type Bill } from '../lib/types';
import { useStatus } from '../lib/useStatus';
import { daysUntil, dueLabel, dueText } from '../components/bills';
import { Empty, Rail, Shell, Skeleton, toast } from '../components/ui';

/** One bill: who, how much, when; mark it paid or remove it. */
export function BillRow({ b, onPaid, onDelete, example = false }: { b: Bill; onPaid?: (paid: boolean) => void; onDelete?: () => void; example?: boolean }) {
  const n = b.dueDate ? daysUntil(b.dueDate) : null;
  const late = !b.paid && n !== null && n < 0;
  return (
    <li className={`card flex flex-wrap items-center gap-x-3 gap-y-2 ${b.paid ? 'opacity-70' : ''}`}>
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-base font-semibold text-stone-900">{b.company}</p>
        <p className="text-xs text-stone-500">{b.dueDate ? `Due ${dueLabel(b.dueDate)}` : 'No due date'}{b.account ? ` · •••• ${b.account}` : ''}</p>
        <span className={`chip mt-1 ${b.paid ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : late ? 'border-amber-200 bg-amber-50 text-amber-800' : n !== null && n <= 3 ? 'border-teal-200 bg-teal-50 text-teal-800' : 'border-stone-200 bg-white/70 text-stone-600'}`}>
          {b.paid ? '✓ Paid' : b.dueDate ? dueText(b.dueDate) : 'Not paid yet'}
        </span>
      </div>
      <p className="num text-lg font-semibold text-stone-900">{money(b.amount)}</p>
      <div className="flex w-full gap-2 sm:w-auto">
        <button className="btn flex-1 sm:flex-none" onClick={() => !example && onPaid?.(!b.paid)} tabIndex={example ? -1 : 0}>{b.paid ? '↩ Not paid' : '✓ Paid'}</button>
        <button className="btn" onClick={() => !example && onDelete?.()} aria-label={`Remove the ${b.company} bill`} tabIndex={example ? -1 : 0}>🗑</button>
      </div>
    </li>
  );
}

/** 📅 Bills: safe bills the AI read, with due dates, and each company's amounts over time. */
export function Bills() {
  const st = useStatus();
  const [list, setList] = useState<Bill[] | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => void api.bills().then(setList, (e) => setErr(e instanceof Error ? e.message : String(e))), []);

  const unpaid = useMemo(() => (list ?? []).filter((b) => !b.paid).sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999')), [list]);
  const paid = useMemo(() => (list ?? []).filter((b) => b.paid), [list]);
  const byCompany = useMemo(() => {
    const m = new Map<string, Bill[]>();
    for (const b of list ?? []) m.set(b.company, [...(m.get(b.company) ?? []), b]);
    return [...m.entries()].map(([c, bs]) => [c, bs.sort((a, b) => (b.dueDate || b.checkedAt).localeCompare(a.dueDate || a.checkedAt))] as const).sort((a, b) => b[1].length - a[1].length);
  }, [list]);
  const total = unpaid.reduce((s, b) => s + b.amount, 0);

  const setPaid = async (b: Bill, v: boolean) => {
    try {
      const next = await api.billPaid(b.key, v);
      setList((l) => (l ?? []).map((x) => (x.key === b.key ? next : x)));
    } catch (e) {
      toast('error', e instanceof Error ? e.message : String(e));
    }
  };
  const remove = async (b: Bill) => {
    if (!window.confirm(`Remove the ${b.company} bill of ${money(b.amount)}?`)) return;
    try {
      await api.billDelete(b.key);
      setList((l) => (l ?? []).filter((x) => x.key !== b.key));
    } catch (e) {
      toast('error', e instanceof Error ? e.message : String(e));
    }
  };
  const row = (b: Bill) => <BillRow key={b.key} b={b} onPaid={(v) => void setPaid(b, v)} onDelete={() => void remove(b)} />;

  const history = byCompany.length > 0 && (
    <Rail title="By company">
      <ul className="space-y-3">
        {byCompany.map(([c, bs]) => (
          <li key={c}>
            <p className="text-sm font-semibold text-stone-800">{c}</p>
            <ul className="mt-0.5 space-y-0.5">
              {bs.slice(0, 6).map((b, i) => {
                const prev = bs[i + 1];
                const ch = prev?.amount ? Math.round(((b.amount - prev.amount) / prev.amount) * 100) : null;
                return (
                  <li key={b.key} className="flex justify-between gap-2 text-xs text-stone-600">
                    <span>{b.dueDate ? dueLabel(b.dueDate) : new Date(b.checkedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                    <span className="num">{money(b.amount)}{ch !== null && ch !== 0 && <span className={ch >= 50 ? 'text-amber-700' : 'text-stone-400'}> {ch > 0 ? `▲${ch}%` : `▼${-ch}%`}</span>}</span>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>
    </Rail>
  );

  return (
    <Shell right={
      <>
        <Rail title="To pay">
          <p className="font-display text-3xl font-bold text-stone-900">{money(total)}</p>
          <p className="text-sm text-stone-600">{unpaid.length} bill{unpaid.length === 1 ? '' : 's'} not paid yet</p>
        </Rail>
        {history}
      </>
    }>
      <div>
        <p className="label">Your bills</p>
        <h1 className="text-2xl font-bold">📅 Bills</h1>
        <p className="text-sm text-stone-500">Bills the AI read and found safe, with their due dates. A new bill is compared with the same company’s last one.</p>
      </div>
      {st && !st.settings.bills.track && <p className="panel text-sm text-stone-600">Bill tracking is off (Settings → Saving). New bills aren’t added.</p>}
      {err && <p className="card text-sm text-red-700">{err}</p>}
      {!list && !err && <div className="card space-y-3"><p className="text-sm text-stone-500"><span className="spinner" /> Loading…</p><Skeleton /></div>}
      {list && !list.length && <Empty icon="📅">No bills yet. Check a photo or PDF of a bill: when it looks safe, it shows up here with its due date.</Empty>}
      {list && list.length > 0 && <p className="panel text-sm lg:hidden">To pay: <b className="num">{money(total)}</b> · {unpaid.length} bill{unpaid.length === 1 ? '' : 's'}</p>}
      {unpaid.length > 0 && (
        <section className="space-y-2">
          <p className="label">Not paid yet</p>
          <ul className="space-y-2">{unpaid.map(row)}</ul>
        </section>
      )}
      {paid.length > 0 && (
        <section className="space-y-2">
          <p className="label">Paid</p>
          <ul className="space-y-2">{paid.map(row)}</ul>
        </section>
      )}
      {history && <div className="lg:hidden">{history}</div>}
    </Shell>
  );
}
