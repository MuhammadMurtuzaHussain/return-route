export type LatLng = { lat: number; lon: number };

/** What kind of place a mapped feature is, as far as litter goes. */
export type FeatureKind =
  | "picnic"
  | "bbq"
  | "pitch"
  | "playground"
  | "viewpoint"
  | "beach"
  | "bench"
  | "bin"
  | "skate"
  | "shelter";

/** Places that sell the drinks that end up as litter. They boost nearby hotspots. */
export type SourceKind = "offlicence" | "convenience" | "takeaway" | "pub";

export type Feature = LatLng & { id: string; kind: FeatureKind; name?: string };
export type Source = LatLng & { id: string; kind: SourceKind; name?: string };
export type Park = LatLng & { id: string; name: string };

export type ReturnPoint = LatLng & {
  id: string;
  name: string;
  /** "machine" is a mapped reverse vending machine; "shop" is a supermarket that very likely takes returns. */
  confidence: "machine" | "shop";
};

export type AreaData = {
  center: LatLng;
  radiusM: number;
  features: Feature[];
  sources: Source[];
  parks: Park[];
  returnPoints: ReturnPoint[];
  fetchedAt: string;
  from: "overpass" | "snapshot";
};

/** A cluster of features close enough to count as one stop. */
export type Hotspot = LatLng & {
  id: string;
  label: string;
  kinds: Partial<Record<FeatureKind, number>>;
  nearbySources: number;
  /** Expected deposit containers at this spot today (point estimate). */
  expected: number;
  score: number;
  reasons: string[];
};

export type Weather = {
  /** Yesterday: what decides how much was left behind. */
  yesterdayMaxC: number | null;
  yesterdayRainMm: number | null;
  yesterdaySunHours: number | null;
  /** Right now: what decides whether you want to go. */
  nowC: number | null;
  nowRainMm: number | null;
  summary: string;
};

/** Something on in town (a match, a gig, a festival), placed on the map. */
export type LocalEvent = LatLng & { title: string; venue: string; day: "today" | "yesterday" };

export type Context = {
  weather: Weather | null;
  /** Today's (and, when cached, yesterday's) events near the walk. */
  events?: LocalEvent[];
  /** 0 = Sunday … 6 = Saturday, local time. */
  weekday: number;
  /** id → multiplier learnt from this person's past hauls. */
  history?: Record<string, number>;
};
