// Deposit return schemes Return Route knows about.
//
// Rates are what the shopper gets back per container. They decide every € figure
// in the app, so Gemma never does this arithmetic: it only says what it sees
// (material, roughly how many ml, whether the deposit mark is visible) and the
// payout is computed here.
//
// Sources: Ireland from re-turn.ie and launch coverage (Feb 2024); everything
// else from TOMRA's "Which countries have deposit return schemes in 2026?"
// (April 2026). Where a scheme has more size bands than "small/large", the
// table keeps the two that cover cans and plastic bottles.

export type Material = "can" | "pet" | "glass";

export type Scheme = {
  code: string; // ISO 3166-1 alpha-2, lower case
  country: string;
  scheme: string; // what locals call it
  mark: string; // what to look for on the container (fed to the vision prompt)
  currency: string;
  /** Deposit for containers up to and including `smallMaxMl`. */
  small: number;
  /** Deposit for larger containers (up to the scheme's maximum). */
  large: number;
  smallMaxMl: number;
  materials: Material[];
  minMl: number;
  maxMl: number;
  notes: string[];
  source: string;
};

const TOMRA = "https://www.tomra.com/about-tomra/circular-economy/deposit-return-schemes/which-countries-have-deposit-return-scheme";

export const SCHEMES: Record<string, Scheme> = {
  ie: {
    code: "ie",
    country: "Ireland",
    scheme: "Re-turn",
    mark: "the Re-turn logo (a circular arrow with the word Re-turn)",
    currency: "EUR",
    small: 0.15,
    large: 0.25,
    smallMaxMl: 500,
    materials: ["can", "pet"],
    minMl: 150,
    maxMl: 3000,
    notes: [
      "Only containers with the Re-turn logo carry a deposit. Glass and dairy are not in the scheme.",
      "Return them empty and uncrushed, or the machine will reject them.",
      "Some machines now have a charity donate button.",
    ],
    source: "https://re-turn.ie/about-us",
  },
  de: {
    code: "de",
    country: "Germany",
    scheme: "Pfand (DPG)",
    mark: "the DPG Pfand logo (a bottle and can with an arrow)",
    currency: "EUR",
    small: 0.25,
    large: 0.25,
    smallMaxMl: 3000,
    materials: ["can", "pet"],
    minMl: 100,
    maxMl: 3000,
    notes: [
      "Single-use bottles and cans are €0.25 each. Reusable glass is 8 to 15 cents and is not counted here.",
      "Leave anything in a Pfandring for the people who rely on it.",
    ],
    source: TOMRA,
  },
  nl: {
    code: "nl",
    country: "Netherlands",
    scheme: "Statiegeld",
    mark: "the Statiegeld logo",
    currency: "EUR",
    small: 0.15,
    large: 0.25,
    smallMaxMl: 999,
    materials: ["can", "pet"],
    minMl: 100,
    maxMl: 3000,
    notes: ["Cans and bottles under 1 litre are €0.15, 1 litre and over are €0.25."],
    source: TOMRA,
  },
  at: {
    code: "at",
    country: "Austria",
    scheme: "Einwegpfand",
    mark: "the Austrian Pfand logo",
    currency: "EUR",
    small: 0.25,
    large: 0.25,
    smallMaxMl: 3000,
    materials: ["can", "pet"],
    minMl: 100,
    maxMl: 3000,
    notes: ["Plastic bottles and cans from 0.1 to 3 litres, €0.25 each, since January 2025."],
    source: TOMRA,
  },
  sk: {
    code: "sk",
    country: "Slovakia",
    scheme: "Zálohujeme",
    mark: "the Slovak deposit 'Z' logo",
    currency: "EUR",
    small: 0.15,
    large: 0.15,
    smallMaxMl: 3000,
    materials: ["can", "pet"],
    minMl: 100,
    maxMl: 3000,
    notes: [],
    source: TOMRA,
  },
  fi: {
    code: "fi",
    country: "Finland",
    scheme: "Palpa",
    mark: "the Palpa deposit marking",
    currency: "EUR",
    small: 0.1,
    large: 0.1,
    smallMaxMl: 3000,
    materials: ["can", "pet", "glass"],
    minMl: 100,
    maxMl: 3000,
    notes: ["Rates vary by container; the table uses the lowest common value."],
    source: TOMRA,
  },
  lt: { code: "lt", country: "Lithuania", scheme: "Užstatas", mark: "the Lithuanian deposit logo", currency: "EUR", small: 0.1, large: 0.1, smallMaxMl: 3000, materials: ["can", "pet", "glass"], minMl: 100, maxMl: 3000, notes: [], source: TOMRA },
  lv: { code: "lv", country: "Latvia", scheme: "Depozīts", mark: "the Latvian deposit logo", currency: "EUR", small: 0.1, large: 0.1, smallMaxMl: 3000, materials: ["can", "pet", "glass"], minMl: 100, maxMl: 3000, notes: [], source: TOMRA },
  ee: { code: "ee", country: "Estonia", scheme: "Pandipakend", mark: "the Eesti Pandipakend logo", currency: "EUR", small: 0.1, large: 0.1, smallMaxMl: 3000, materials: ["can", "pet", "glass"], minMl: 100, maxMl: 3000, notes: ["Deposits run from €0.10 to €0.40 by size and material; the table uses the lowest."], source: TOMRA },
  mt: { code: "mt", country: "Malta", scheme: "BCRS", mark: "the BCRS deposit logo", currency: "EUR", small: 0.1, large: 0.1, smallMaxMl: 3000, materials: ["can", "pet", "glass"], minMl: 100, maxMl: 3000, notes: [], source: TOMRA },
  hr: { code: "hr", country: "Croatia", scheme: "Povratna naknada", mark: "the Croatian deposit marking", currency: "EUR", small: 0.1, large: 0.1, smallMaxMl: 3000, materials: ["can", "pet", "glass"], minMl: 200, maxMl: 3000, notes: [], source: TOMRA },
  pt: { code: "pt", country: "Portugal", scheme: "SDR", mark: "the Portuguese deposit logo", currency: "EUR", small: 0.1, large: 0.1, smallMaxMl: 3000, materials: ["can", "pet"], minMl: 100, maxMl: 3000, notes: ["The scheme is new in 2026; not every shop takes returns yet."], source: TOMRA },
  dk: { code: "dk", country: "Denmark", scheme: "Pant", mark: "the Dansk Retursystem 'Pant' mark", currency: "DKK", small: 1, large: 3, smallMaxMl: 999, materials: ["can", "pet", "glass"], minMl: 100, maxMl: 20000, notes: ["Pant A/B/C runs from 1 to 3 DKK by size; the table uses the ends of that range."], source: TOMRA },
  se: { code: "se", country: "Sweden", scheme: "Pant", mark: "the Pantamera mark", currency: "SEK", small: 2, large: 3, smallMaxMl: 999, materials: ["can", "pet"], minMl: 150, maxMl: 3000, notes: [], source: TOMRA },
  no: { code: "no", country: "Norway", scheme: "Pant", mark: "the Infinitum pant mark", currency: "NOK", small: 2, large: 3, smallMaxMl: 500, materials: ["can", "pet"], minMl: 125, maxMl: 4900, notes: [], source: TOMRA },
  pl: { code: "pl", country: "Poland", scheme: "System kaucyjny", mark: "the Polish deposit (kaucja) logo", currency: "PLN", small: 0.5, large: 0.5, smallMaxMl: 3000, materials: ["can", "pet"], minMl: 100, maxMl: 3000, notes: ["Shops of 200 m² and up must take returns; smaller shops may not."], source: TOMRA },
  hu: { code: "hu", country: "Hungary", scheme: "REpont", mark: "the REpont deposit logo", currency: "HUF", small: 50, large: 50, smallMaxMl: 3000, materials: ["can", "pet", "glass"], minMl: 100, maxMl: 3000, notes: [], source: TOMRA },
  ro: { code: "ro", country: "Romania", scheme: "RetuRO", mark: "the RetuRO 'SGR' logo", currency: "RON", small: 0.5, large: 0.5, smallMaxMl: 3000, materials: ["can", "pet", "glass"], minMl: 100, maxMl: 3000, notes: [], source: TOMRA },
  is: { code: "is", country: "Iceland", scheme: "Endurvinnslan", mark: "the Icelandic deposit marking", currency: "ISK", small: 20, large: 20, smallMaxMl: 5000, materials: ["can", "pet", "glass"], minMl: 0, maxMl: 5000, notes: [], source: TOMRA },
};

/** Places people ask about that do not have a scheme running yet. */
export const NOT_YET: Record<string, string> = {
  gb: "The UK scheme starts in October 2027 (20p per container in England, Scotland and Northern Ireland). Until then there is nothing to return.",
  es: "Spain has announced a deposit scheme but it is not running yet.",
};

export const DEFAULT_COUNTRY = "ie";

export function getScheme(code: string | null | undefined): Scheme | null {
  return SCHEMES[(code ?? "").toLowerCase()] ?? null;
}

/** Deposit for one container, or 0 if the scheme would not take it. */
export function depositFor(s: Scheme, material: Material, ml: number): number {
  if (!s.materials.includes(material)) return 0;
  if (ml < s.minMl || ml > s.maxMl) return 0;
  return ml <= s.smallMaxMl ? s.small : s.large;
}

/**
 * Average deposit of a "typical" litter container. Litter in parks is mostly
 * cans and small bottles, so assume three small for every large one.
 */
export function typicalDeposit(s: Scheme): number {
  return 0.75 * s.small + 0.25 * s.large;
}

export function formatMoney(amount: number, currency: string, locale = "en-IE"): string {
  const whole = Number.isInteger(amount) || currency === "HUF" || currency === "ISK";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(amount);
}
