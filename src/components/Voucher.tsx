"use client";

import { formatMoney } from "@/lib/countries";
import type { Goal, Totals } from "@/lib/client/store";

const CELLS = 24;

/** Running total, printed like a return-machine voucher stub. */
export function VoucherStub({ totals, goal, flash }: { totals: Totals; goal: Goal; flash?: boolean }) {
  const filled = goal.amount > 0 ? Math.round(Math.min(1, totals.earned / goal.amount) * CELLS) : 0;
  const cells = Array.from({ length: CELLS }, (_, i) => i < Math.max(filled, totals.earned > 0 ? 1 : 0));
  return (
    <section aria-label="Your total" className={`voucher px-5 py-6 font-mono text-[13px] transition ${flash ? "ring-2 ring-mark" : ""}`}>
      <div className="flex items-baseline gap-2">
        <span className="uppercase text-muted">Saving for</span>
        <span className="truncate font-medium uppercase">{goal.label || "something good"}</span>
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <span className="tabular text-[28px] font-semibold leading-none tracking-tight">{formatMoney(totals.earned, totals.currency)}</span>
        <span className="tabular pb-0.5 text-muted">of {formatMoney(goal.amount, totals.currency)}</span>
      </div>
      <div className="mt-3 grid grid-cols-[repeat(24,1fr)] gap-[3px]" aria-hidden="true">
        {cells.map((on, i) => (
          <span key={i} className={`h-3 rounded-[2px] ${on ? "bg-mark" : "bg-sunk"}`} />
        ))}
      </div>
      <div className="mt-4 flex justify-between gap-3 text-[12px] uppercase text-muted">
        <span className="tabular">
          {totals.walks} walk{totals.walks === 1 ? "" : "s"}
        </span>
        <span className="tabular">{totals.containers} back in the loop</span>
        <span className="tabular">{formatMoney(totals.donated, totals.currency)} given</span>
      </div>
    </section>
  );
}
