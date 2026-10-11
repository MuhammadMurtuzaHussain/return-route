"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Check, Copy, HandHeart, ImageSquare, Sparkle, XLogo } from "@phosphor-icons/react";
import { formatMoney } from "@/lib/countries";
import type { PostFacts } from "@/lib/ai/prompts";
import { composePost, recycledWeight, shareOrSave, tweetUrl, voucherImage } from "@/lib/client/share";
import type { Goal, Totals } from "@/lib/client/store";
import type { LoggedHaul } from "./HaulScreen";
import { Button } from "./ui";

/** A burst of waymark diamonds. Decorative; skipped for reduced motion. */
function Burst() {
  const bits = Array.from({ length: 16 }, (_, i) => {
    const a = (i / 16) * Math.PI * 2;
    const r = 90 + (i % 3) * 30;
    return { x: Math.cos(a) * r, y: Math.sin(a) * r * 0.7, d: (i % 4) * 0.04, s: 8 + (i % 3) * 3 };
  });
  return (
    <span className="pointer-events-none absolute left-1/2 top-12 h-0 w-0" aria-hidden="true">
      {bits.map((b, i) => (
        <motion.span
          key={i}
          className="absolute rotate-45 rounded-[2px] bg-mark"
          style={{ width: b.s, height: b.s }}
          initial={{ x: 0, y: 0, opacity: 1, scale: 0.4 }}
          animate={{ x: b.x, y: b.y, opacity: 0, scale: 1 }}
          transition={{ duration: 1.1, delay: b.d, ease: [0.16, 1, 0.3, 1] }}
        />
      ))}
    </span>
  );
}

export function Logged({
  haul,
  totals,
  goal,
  rate,
  cause,
  place,
  weather,
  draft,
  onDone,
  autoDraft,
}: {
  haul: LoggedHaul;
  totals: Totals;
  goal: Goal;
  rate: number;
  cause: string | null;
  place: string | null;
  weather: string | null;
  draft: (facts: PostFacts) => Promise<string>;
  onDone: () => void;
  /** The guided demo asks Gemma for the post straight away. */
  autoDraft?: boolean;
}) {
  const reduce = useReducedMotion();
  const money = (n: number) => formatMoney(n, haul.currency);
  const [line, setLine] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const url = typeof window === "undefined" ? "" : window.location.origin;
  const post = composePost({ line, containers: haul.containers, amount: haul.amount, currency: haul.currency, donated: haul.donated, cause, place }, url);
  const [text, setText] = useState(post);
  const edited = useRef(false);

  // Keep the post in step with Gemma's line until the walker edits it themselves.
  useEffect(() => {
    if (!edited.current) setText(post);
  }, [post]);

  const askGemma = useCallback(async () => {
    setDrafting(true);
    setDraftError(false);
    try {
      const l = await draft({ place, containers: haul.containers, donated: haul.donated, cause, weather });
      edited.current = false;
      setLine(l);
    } catch {
      setDraftError(true);
    } finally {
      setDrafting(false);
    }
  }, [draft, place, haul.containers, haul.donated, cause, weather]);

  const asked = useRef(false);
  useEffect(() => {
    if (autoDraft && !asked.current) {
      asked.current = true;
      void askGemma();
    }
  }, [autoDraft, askGemma]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard blocked: the text is still there to select.
    }
  };

  const image = async () => {
    const blob = await voucherImage({ lines: haul.lines, total: money(haul.amount), containers: haul.containers, donated: haul.donated, cause, scheme: haul.scheme });
    const how = await shareOrSave(blob, "return-route-voucher.png", text);
    setSaved(how === "shared" ? "Shared" : "Saved");
    setTimeout(() => setSaved(null), 1800);
  };

  const weight = recycledWeight(haul.containers);
  const toGo = rate > 0 ? Math.max(0, Math.ceil((goal.amount - totals.earned) / rate)) : 0;
  const rise = (i: number) =>
    reduce ? {} : { initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, transition: { delay: 0.1 + 0.08 * i, duration: 0.5, ease: [0.16, 1, 0.3, 1] as const } };

  return (
    <div className="relative flex flex-col gap-8">
      {haul.donated && !reduce && <Burst />}

      <motion.header {...rise(0)} className="flex flex-col items-start gap-3">
        {haul.donated && (
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-mark text-on-mark">
            <HandHeart size={30} weight="fill" />
          </span>
        )}
        <h1 className="sign text-[3.4rem] font-bold uppercase leading-[0.92]">
          {haul.donated ? "Thank you." : "Walk logged."}
          <span className="block text-muted">{haul.donated ? `${money(haul.amount)} for ${cause || "charity"}.` : `${money(haul.amount)} in the bag.`}</span>
        </h1>
        <p className="max-w-[40ch] text-[15px] leading-relaxed text-muted">
          {haul.donated
            ? "You picked up what other people left behind and gave the refund away. That's a good afternoon's work."
            : "Cans out of the grass, money in your pocket. Every walk you log makes the next estimate sharper."}
        </p>
      </motion.header>

      <motion.dl {...rise(1)} className="grid grid-cols-3 gap-2">
        {[
          [String(haul.containers), "picked up"],
          [weight, "recycled"],
          haul.donated ? [money(totals.donated), "given so far"] : [money(totals.earned), "saved so far"],
        ].map(([v, k]) => (
          <div key={k} className="flex flex-col-reverse gap-1 rounded-xl bg-surface p-3">
            <dt className="font-mono text-[11px] uppercase text-muted">{k}</dt>
            <dd className="tabular text-[20px] font-semibold leading-tight">{v}</dd>
          </div>
        ))}
      </motion.dl>

      {!haul.donated && toGo > 0 && (
        <motion.p {...rise(2)} className="-mt-4 text-[14px] leading-relaxed text-muted">
          {goal.label || "Your goal"}: about <span className="tabular font-semibold text-ink">{toGo.toLocaleString("en-IE")}</span> more cans to go. The 9GAG walker needed 2,000.
        </motion.p>
      )}

      <motion.section {...rise(3)} aria-labelledby="share-title" className="flex flex-col gap-3 rounded-[20px] border border-line p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 id="share-title" className="font-semibold">
            {haul.donated ? "Get others walking" : "Tell people"}
          </h2>
          <button
            onClick={askGemma}
            disabled={drafting}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-xl px-2.5 text-[13px] font-medium text-mark-ink hover:bg-surface disabled:opacity-60"
          >
            <Sparkle size={15} weight="fill" />
            {drafting ? "Gemma is writing…" : line ? "Try another" : "Let Gemma write it"}
          </button>
        </div>
        <label htmlFor="post" className="sr-only">
          Your post
        </label>
        <textarea
          id="post"
          value={text}
          onChange={(e) => {
            edited.current = true;
            setText(e.target.value);
          }}
          rows={4}
          className="w-full resize-none rounded-xl border border-line bg-surface px-3 py-2.5 text-[15px] leading-relaxed focus:border-mark focus:outline-none"
        />
        <p className="flex justify-between gap-3 text-[12px] text-muted">
          <span>{draftError ? "Gemma couldn't write one just now. The post above still works." : "The numbers come from your voucher. Gemma only writes the opening line."}</span>
          <span className={`tabular shrink-0 ${text.length > 280 ? "text-mark-ink" : ""}`}>{text.length}/280</span>
        </p>
        <div className="grid grid-cols-3 gap-2">
          <a
            href={tweetUrl(text)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-12 items-center justify-center gap-1.5 rounded-xl bg-post text-[14px] font-semibold text-on-post hover:brightness-125"
          >
            <XLogo size={16} weight="bold" />
            Post
          </a>
          <button onClick={copy} className="inline-flex min-h-12 items-center justify-center gap-1.5 rounded-xl border border-line text-[14px] font-semibold hover:bg-surface">
            {copied ? <Check size={16} weight="bold" /> : <Copy size={16} />}
            {copied ? "Copied" : "Copy"}
          </button>
          <button onClick={image} className="inline-flex min-h-12 items-center justify-center gap-1.5 rounded-xl border border-line text-[14px] font-semibold hover:bg-surface">
            <ImageSquare size={16} />
            {saved ?? "Voucher"}
          </button>
        </div>
      </motion.section>

      <motion.div {...rise(4)}>
        <Button onClick={onDone} className="min-h-14 w-full text-base">
          Done
        </Button>
      </motion.div>
    </div>
  );
}
