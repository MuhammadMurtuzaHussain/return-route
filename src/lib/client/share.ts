"use client";

import { formatMoney } from "../countries";

// Everything the walker can take away from a walk: a post, a voucher picture,
// and an honest sense of what it added up to.

/** Rough weight of an empty can or bottle in grams, for an "about" figure only. */
const GRAMS_PER_CONTAINER = 16;

export const recycledKg = (containers: number) => Math.round((containers * GRAMS_PER_CONTAINER) / 100) / 10;

/** The recycled weight for display: grams for a small haul, so two cans aren't "0 kg". */
export function recycledWeight(containers: number): string {
  const grams = containers * GRAMS_PER_CONTAINER;
  if (grams <= 0) return "0 kg";
  return grams < 1000 ? `≈${grams} g` : `≈${recycledKg(containers)} kg`;
}

export type PostInput = { line: string; containers: number; amount: number; currency: string; donated: boolean; cause: string | null; place: string | null };

/** The post text. Gemma may supply the opening line; every number comes from the app. */
export function composePost(p: PostInput, url: string): string {
  const what = `${p.containers} dropped can${p.containers === 1 ? "" : "s"} and bottle${p.containers === 1 ? "" : "s"}`;
  const where = p.place ? ` around ${p.place}` : "";
  const money = formatMoney(p.amount, p.currency);
  const fact = p.donated
    ? `Picked up ${what}${where} and gave the ${money} refund to ${p.cause || "charity"}.`
    : `Picked up ${what}${where} and got ${money} back.`;
  return [p.line, fact, `Plan yours: ${url}`, "#TouchGrass #Hacktoberfest"].filter(Boolean).join(" ");
}

export const tweetUrl = (text: string) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;

/** Draw the voucher as a picture, sized for stories and feeds. */
export async function voucherImage(v: {
  lines: { label: string; amount: string; struck: boolean }[];
  total: string;
  containers: number;
  donated: boolean;
  cause: string | null;
  scheme: string;
}): Promise<Blob> {
  const W = 1080;
  const H = 1350;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  const css = getComputedStyle(document.documentElement);
  const v_ = (n: string, f: string) => css.getPropertyValue(n).trim() || f;
  const bg = v_("--post", "#1d1d1a");
  const paper = "#fdfdfb";
  const ink = "#171715";
  const muted = "#62625c";
  const mark = v_("--mark", "#e5b53b");
  const mono = "600 34px ui-monospace, 'IBM Plex Mono', monospace";

  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);

  // The paper, with torn zigzag edges.
  const x0 = 120;
  const x1 = W - 120;
  const y0 = 150;
  const y1 = H - 210;
  const tooth = 18;
  g.fillStyle = paper;
  g.beginPath();
  g.moveTo(x0, y0);
  for (let x = x0; x < x1; x += tooth * 2) {
    g.lineTo(x + tooth, y0 - tooth);
    g.lineTo(x + tooth * 2, y0);
  }
  g.lineTo(x1, y1);
  for (let x = x1; x > x0; x -= tooth * 2) {
    g.lineTo(x - tooth, y1 + tooth);
    g.lineTo(x - tooth * 2, y1);
  }
  g.closePath();
  g.fill();

  g.textAlign = "center";
  g.fillStyle = muted;
  g.font = "500 30px ui-monospace, 'IBM Plex Mono', monospace";
  g.fillText("RETURN ROUTE VOUCHER", W / 2, y0 + 70);
  g.fillText(v.scheme.toUpperCase(), W / 2, y0 + 115);

  g.textAlign = "left";
  let y = y0 + 210;
  for (const l of v.lines.slice(0, 9)) {
    g.font = mono;
    g.fillStyle = l.struck ? muted : ink;
    g.fillText(l.label.toUpperCase(), x0 + 50, y);
    g.textAlign = "right";
    g.fillText(l.amount, x1 - 50, y);
    g.textAlign = "left";
    if (l.struck) {
      g.fillRect(x0 + 50, y - 11, g.measureText(l.label.toUpperCase()).width, 3);
    }
    y += 62;
  }

  g.setLineDash([12, 10]);
  g.strokeStyle = "#d4d4cc";
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(x0 + 50, y);
  g.lineTo(x1 - 50, y);
  g.stroke();
  g.setLineDash([]);

  g.fillStyle = ink;
  g.font = mono;
  g.fillText("TOTAL", x0 + 50, y + 110);
  g.textAlign = "right";
  g.font = "700 110px system-ui, sans-serif";
  g.fillText(v.total, x1 - 50, y + 120);

  g.textAlign = "center";
  g.font = "500 32px system-ui, sans-serif";
  g.fillStyle = muted;
  g.fillText(`${v.containers} back in the loop${v.donated ? ` · given to ${v.cause || "charity"}` : ""}`, W / 2, y1 - 60);

  g.fillStyle = mark;
  g.font = "700 46px system-ui, sans-serif";
  g.fillText(v.donated ? "Walked for a cause." : "A walk that paid.", W / 2, H - 110);
  g.fillStyle = "#ecece6";
  g.font = "500 30px system-ui, sans-serif";
  g.fillText("Return Route", W / 2, H - 60);

  return new Promise((resolve) => c.toBlob((b) => resolve(b!), "image/png"));
}

/** Share a file if the device can, otherwise save it. */
export async function shareOrSave(blob: Blob, name: string, text: string): Promise<"shared" | "saved"> {
  const file = new File([blob], name, { type: blob.type });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text });
      return "shared";
    } catch {
      // Cancelled: fall through to saving.
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return "saved";
}
