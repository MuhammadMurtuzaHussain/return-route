import { describe, expect, it } from "vitest";
import { scrubBreadcrumb, scrubEvent, scrubSpan } from "@/lib/privacy";

// Real span and breadcrumb shapes from our Sentry project before this filter existed.
describe("what Sentry never sees", () => {
  it("drops coordinates from weather and place lookups", () => {
    const span = scrubSpan({
      name: "GET https://api.open-meteo.com/v1/forecast?latitude=53.2845&longitude=-9.0420&past_days=1",
      attributes: {
        "url.full": "https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=53.284&lon=-9.042",
        "http.query": "lat=53.284&lon=-9.042",
        "sentry.op": { value: "http.client", type: "string" },
      },
    });
    expect(span.name).toBe("GET https://api.open-meteo.com/v1/forecast");
    expect(span.attributes["url.full"]).toBe("https://nominatim.openstreetmap.org/reverse");
    expect(span.attributes).not.toHaveProperty("http.query");
    expect(span.attributes["sentry.op"]).toEqual({ value: "http.client", type: "string" });
  });

  it("cuts cache keys down to their kind, so no IP or rounded coordinates", () => {
    const span = scrubSpan({
      name: "incr red-db5pbe7avr4c739juj1g:6379",
      attributes: {
        "db.query.text": "incr rr:rl:plan:80.233.72.210:29862636",
        "sentry.description": { value: "get rr:area:v2:53.28,-9.04,2500", type: "string" },
      },
    });
    expect(span.attributes["db.query.text"]).toBe("incr rr:rl");
    expect(span.attributes["sentry.description"]).toEqual({ value: "get rr:area", type: "string" });
    expect(JSON.stringify(span)).not.toMatch(/80\.233|53\.28/);
  });

  it("cleans breadcrumbs and error messages too", () => {
    const b = scrubBreadcrumb({ category: "fetch", data: { url: "https://api.open-meteo.com/v1/forecast?latitude=53.28&longitude=-9.04", method: "GET" } });
    expect(b.data.url).toBe("https://api.open-meteo.com/v1/forecast");
    const e = scrubEvent({ exception: { values: [{ value: "fetch failed: https://nominatim.openstreetmap.org/reverse?lat=53.28&lon=-9.04" }] }, request: { url: "https://return-route.onrender.com/?demo", query_string: "demo" } });
    expect(e.exception.values[0].value).toBe("fetch failed: https://nominatim.openstreetmap.org/reverse");
    expect(e.request).toEqual({ url: "https://return-route.onrender.com/" });
  });
});
