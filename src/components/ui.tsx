"use client";

import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { Check } from "@phosphor-icons/react";

// Shape rule: controls 12px, panels 20px, signs are arrows. One accent: waymark yellow.

type Variant = "mark" | "post" | "outline" | "ghost";

const VARIANTS: Record<Variant, string> = {
  mark: "bg-mark text-on-mark hover:brightness-105",
  post: "bg-post text-on-post hover:brightness-125",
  outline: "border border-line text-ink hover:bg-surface",
  ghost: "text-muted hover:text-ink",
};

const BASE =
  "inline-flex min-h-13 items-center justify-center gap-2 rounded-xl px-5 text-[15px] font-semibold transition duration-200 active:translate-y-px active:scale-[0.99] disabled:opacity-45 disabled:active:translate-y-0 disabled:active:scale-100";

export function Button({ variant = "mark", className = "", children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; children: ReactNode }) {
  return (
    <button {...rest} className={`${BASE} ${VARIANTS[variant]} ${className}`}>
      {children}
    </button>
  );
}

export function LinkButton({ variant = "mark", className = "", children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: Variant; children: ReactNode }) {
  return (
    <a {...rest} className={`${BASE} ${VARIANTS[variant]} ${className}`}>
      {children}
    </a>
  );
}

/** A square check chip, used instead of an iOS-style switch. */
export function Chip({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label
      className={`inline-flex min-h-10 cursor-pointer select-none items-center gap-2 rounded-xl border px-3 text-[14px] font-medium transition active:scale-[0.98] ${
        checked ? "border-mark bg-mark/15 text-ink" : "border-line text-muted hover:text-ink"
      }`}
    >
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className={`grid h-4 w-4 place-items-center rounded-[4px] border transition ${checked ? "border-mark bg-mark text-on-mark" : "border-line"}`}>
        {checked && <Check size={11} weight="bold" />}
      </span>
      {children}
    </label>
  );
}

/** Diamond waymark used for stops on the map and in the itinerary. */
export function Waymark({ children, tone = "mark", size = 28 }: { children: ReactNode; tone?: "mark" | "post"; size?: number }) {
  return (
    <span className="relative inline-grid shrink-0 place-items-center" style={{ width: size, height: size }} aria-hidden="true">
      <span className={`absolute inset-[14%] rotate-45 rounded-[4px] ${tone === "mark" ? "bg-mark" : "bg-post"}`} />
      <span className={`relative font-mono text-[12px] font-semibold ${tone === "mark" ? "text-on-mark" : "text-mark"}`}>{children}</span>
    </span>
  );
}
