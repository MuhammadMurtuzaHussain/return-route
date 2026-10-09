// Small guard-rails for the hosted demo. Local mode is unlimited.
const hits = new Map<string, number[]>();

export function rateLimited(ip: string, perMinute = 6): boolean {
  if (process.env.MODEL_PROVIDER !== "google") return false;
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > perMinute;
}

export const maxWords = () => Number(process.env.MAX_WORDS) || Infinity;

export const clientIp = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
