"use client";

import { Cloud, DeviceMobile, Laptop } from "@phosphor-icons/react";
import type { Tier } from "@/lib/ai/schema";

const ICON = { edge: DeviceMobile, local: Laptop, cloud: Cloud };
const WHERE = { edge: "on this phone", local: "on my laptop", cloud: "in the cloud" };

/** Where Gemma is running right now. Tapping it opens settings. */
export function TierPill({ tier, onClick }: { tier: Tier; onClick: () => void }) {
  const Icon = ICON[tier];
  return (
    <button
      onClick={onClick}
      className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-[13px] text-muted transition hover:text-ink active:scale-[0.98]"
      aria-label={`Gemma is running ${WHERE[tier]}. Change in settings.`}
    >
      <Icon size={16} weight="bold" />
      <span>
        Gemma <span className="text-ink">{WHERE[tier]}</span>
      </span>
    </button>
  );
}
