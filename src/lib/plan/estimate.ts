import { typicalDeposit, type Scheme } from "../countries";
import type { Hotspot } from "./types";

// What a walk might pay. Always a range: litter is luck, and promising someone
// €10 and handing them €2 is how you lose them after one walk.

export type Estimate = {
  containersLow: number;
  containersHigh: number;
  moneyLow: number;
  moneyHigh: number;
  currency: string;
};

/** You also pick things up between stops: about this many containers per km. */
export const ALONG_THE_WAY_PER_KM = 0.6;

export function estimate(stops: Hotspot[], walkKm: number, scheme: Scheme): Estimate {
  const mid = stops.reduce((s, h) => s + h.expected, 0) + ALONG_THE_WAY_PER_KM * walkKm;
  const containersLow = Math.max(0, Math.floor(mid * 0.5));
  const containersHigh = Math.max(containersLow + 1, Math.ceil(mid * 1.6));
  const per = typicalDeposit(scheme);
  return {
    containersLow,
    containersHigh,
    moneyLow: roundMoney(containersLow * per),
    moneyHigh: roundMoney(containersHigh * per),
    currency: scheme.currency,
  };
}

const roundMoney = (n: number) => Math.round(n * 100) / 100;
