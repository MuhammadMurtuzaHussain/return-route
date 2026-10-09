"use client";

import { Cloud, DeviceMobile, Laptop } from "@phosphor-icons/react";
import type { Tier } from "@/lib/ai/schema";

const ICON = { edge: DeviceMobile, local: Laptop, cloud: Cloud };
const WHERE = { edge: "phone", local: "laptop", cloud: "cloud" };

/** Where Gemma is running right now. Tapping it opens settings. */
export function TierPill({ tier, onClick }: { tier: Tier; onClick: () => void }) {
  const Icon = ICON[tier];
  return (
    <button
      onClick={onClick}
      className="inline-flex min-h-10 items-center gap-2 rounded-xl px-2.5 text-[13px] text-muted transition hover:bg-surface hover:text-ink active:scale-[0.98]"
      aria-label={`Gemma is running on the ${WHERE[tier]}. Open settings.`}
    >
      <Icon size={17} />
      <span className="font-mono uppercase tracking-wide">Gemma · {WHERE[tier]}</span>
    </button>
  );
}
