"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

// Shape rule: interactive controls are full pills; panels are 20px.

type Variant = "primary" | "secondary" | "ghost";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-forest text-on-forest hover:brightness-110",
  secondary: "bg-surface text-ink border border-line hover:bg-sunk",
  ghost: "text-muted hover:text-ink",
};

export function Button({
  variant = "primary",
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; children: ReactNode }) {
  return (
    <button
      {...rest}
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-5 text-[15px] font-medium transition active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 ${VARIANTS[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function LinkButton({
  variant = "primary",
  className = "",
  children,
  ...rest
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: Variant; children: ReactNode }) {
  return (
    <a
      {...rest}
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-5 text-[15px] font-medium transition active:scale-[0.98] ${VARIANTS[variant]} ${className}`}
    >
      {children}
    </a>
  );
}

export function Switch({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 py-1">
      <span className="flex flex-col">
        <span className="text-[15px] font-medium">{label}</span>
        {hint && <span className="text-sm text-muted">{hint}</span>}
      </span>
      <span className="relative inline-flex h-7 w-12 shrink-0 items-center">
        <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="absolute inset-0 rounded-full bg-line transition peer-checked:bg-forest peer-focus-visible:outline-2 peer-focus-visible:outline-forest" />
        <span className="absolute left-1 h-5 w-5 rounded-full bg-surface shadow-sm transition peer-checked:translate-x-5" />
      </span>
    </label>
  );
}
