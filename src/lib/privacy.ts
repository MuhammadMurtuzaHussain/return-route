// What Sentry gets about a walk: timings, model names and which guard fired.
// Not where the walker is. Weather and place lookups carry coordinates in their
// URLs, and our cache keys carry rounded coordinates or the walker's IP (rate
// limits), so both are cut down before anything leaves the server or the browser.
// Spread `privacy` into every Sentry.init.

/** "https://api.open-meteo.com/v1/forecast?latitude=53.28…" → "https://api.open-meteo.com/v1/forecast" */
const URL_QUERY = /(https?:\/\/[^\s?#"]+)\?[^\s#"]*/g;
/** "incr rr:rl:plan:80.233.72.210:29862636" → "incr rr:rl"; "get rr:area:v2:53.28,-9.04,2500" → "get rr:area" */
const CACHE_KEY = /\b(rr:[a-z]+)(?::[^\s"]*)?/g;
/** Attributes that are nothing but a query string. */
const QUERY_ONLY = /^(http\.query|url\.query)$/;

export function scrubText(s: string): string {
  return s.replace(URL_QUERY, "$1").replace(CACHE_KEY, "$1");
}

function scrubValue(v: unknown): unknown {
  if (typeof v === "string") return scrubText(v);
  // Attributes can also come typed: { value, type }.
  if (v && typeof v === "object" && typeof (v as { value?: unknown }).value === "string") {
    return { ...v, value: scrubText((v as { value: string }).value) };
  }
  return v;
}

function scrubRecord(r: Record<string, unknown> | undefined) {
  if (!r) return;
  for (const k of Object.keys(r)) {
    if (QUERY_ONLY.test(k)) delete r[k];
    else r[k] = scrubValue(r[k]);
  }
}

export function scrubSpan<T extends { name: string; attributes?: Record<string, unknown> }>(span: T): T {
  span.name = scrubText(span.name);
  scrubRecord(span.attributes);
  return span;
}

export function scrubBreadcrumb<T extends { message?: string; data?: Record<string, unknown> }>(b: T): T {
  if (b.message) b.message = scrubText(b.message);
  scrubRecord(b.data);
  return b;
}

export function scrubEvent<T extends { message?: string; exception?: { values?: { value?: string }[] }; request?: { url?: string; query_string?: unknown } }>(
  e: T,
): T {
  if (e.message) e.message = scrubText(e.message);
  for (const x of e.exception?.values ?? []) if (x.value) x.value = scrubText(x.value);
  if (e.request) {
    if (e.request.url) e.request.url = scrubText(e.request.url);
    delete e.request.query_string;
  }
  return e;
}

export const privacy = { beforeSendSpan: scrubSpan, beforeBreadcrumb: scrubBreadcrumb, beforeSend: scrubEvent };
