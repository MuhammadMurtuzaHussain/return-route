"use client";

import { CaretDown, Cloud, DeviceMobile, Laptop } from "@phosphor-icons/react";
import type { Tier } from "@/lib/ai/schema";

const ICON = { edge: DeviceMobile, local: Laptop, cloud: Cloud };
const WHERE = { edge: "phone", local: "laptop", cloud: "cloud" };

/** Where Gemma is running right now. Tapping it opens settings. */
export function TierPill({ tier, onClick }: { tier: Tier; onClick: () => void }) {
  const Icon = ICON[tier];
  return (
    <button
      onClick={onClick}
      className="inline-flex min-h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border border-line bg-surface px-3 text-[13px] text-ink transition hover:border-mark active:scale-[0.98]"
      aria-label={`Gemma is running on the ${WHERE[tier]}. Choose where Gemma runs.`}
    >
      <Icon size={17} />
      <span className="font-mono uppercase tracking-wide">
        <span className="hidden min-[420px]:inline">Gemma · </span>
        {WHERE[tier]}
      </span>
      <CaretDown size={12} weight="bold" className="text-muted" />
    </button>
  );
}
