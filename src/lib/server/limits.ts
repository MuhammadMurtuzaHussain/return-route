import { kvHit } from "./kv";

// Small guard-rails for the hosted demo. Local mode is unlimited. Counts live
// in the shared Key Value store, so a restart or a second instance doesn't reset them.

export async function rateLimited(ip: string, perMinute = 6, bucket = "api"): Promise<boolean> {
  if (process.env.MODEL_PROVIDER !== "google") return false;
  const minute = Math.floor(Date.now() / 60_000);
  return (await kvHit(`rl:${bucket}:${ip}:${minute}`, 70)) > perMinute;
}

export const maxWords = () => Number(process.env.MAX_WORDS) || Infinity;

export const clientIp = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
