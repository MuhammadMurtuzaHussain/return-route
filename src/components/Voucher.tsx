"use client";

import { HandHeart } from "@phosphor-icons/react";
import { formatMoney } from "@/lib/countries";
import { recycledKg } from "@/lib/client/share";
import type { Goal, Totals } from "@/lib/client/store";

const CELLS = 24;

/** Running total, printed like a return-machine voucher stub. In cause mode it counts what you've given. */
export function VoucherStub({ totals, goal, flash, cause, rate }: { totals: Totals; goal: Goal; flash?: boolean; cause?: string | null; rate: number }) {
  if (cause !== null && cause !== undefined) return <GivingStub totals={totals} cause={cause} flash={flash} />;

  const filled = goal.amount > 0 ? Math.round(Math.min(1, totals.earned / goal.amount) * CELLS) : 0;
  const cells = Array.from({ length: CELLS }, (_, i) => i < Math.max(filled, totals.earned > 0 ? 1 : 0));
  // The 9GAG maths: how many more containers at this scheme's usual deposit.
  const toGo = rate > 0 ? Math.max(0, Math.ceil((goal.amount - totals.earned) / rate)) : 0;
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
      {toGo > 0 && (
        <p className="mt-3 normal-case text-muted">
          About <span className="tabular font-semibold text-ink">{toGo.toLocaleString("en-IE")}</span> more cans at {formatMoney(rate, totals.currency)} to go. The 9GAG walker did 2,000.
        </p>
      )}
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

function GivingStub({ totals, cause, flash }: { totals: Totals; cause: string; flash?: boolean }) {
  const kg = recycledKg(totals.containers);
  const line =
    totals.walks === 0
      ? "Your first walk starts the count. Every can is one less in the grass."
      : totals.walks < 3
        ? "A good start. People notice when the park gets tidier."
        : "You're making a habit of this. The park is better for it.";
  return (
    <section aria-label="What you've given" className={`voucher px-5 py-6 font-mono text-[13px] transition ${flash ? "ring-2 ring-mark" : ""}`}>
      <div className="flex items-center gap-2">
        <HandHeart size={18} weight="fill" className="shrink-0 text-mark-ink" />
        <span className="uppercase text-muted">Walking for</span>
        <span className="truncate font-medium uppercase">{cause || "a good cause"}</span>
      </div>
      <div className="mt-3 flex items-end gap-2">
        <span className="tabular text-[34px] font-semibold leading-none tracking-tight">{formatMoney(totals.donated, totals.currency)}</span>
        <span className="pb-1 uppercase text-muted">given</span>
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-2 border-y border-dashed border-line py-3 text-center">
        {[
          [String(totals.containers), "picked up"],
          [kg ? `≈${kg} kg` : "0 kg", "recycled"],
          [String(totals.walks), totals.walks === 1 ? "walk" : "walks"],
        ].map(([v, k]) => (
          <div key={k} className="flex flex-col-reverse gap-1">
            <dt className="text-[11px] uppercase text-muted">{k}</dt>
            <dd className="tabular text-[18px] font-semibold text-ink">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 font-sans text-[14px] normal-case leading-relaxed text-muted">{line}</p>
    </section>
  );
}
