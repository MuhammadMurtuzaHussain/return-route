@AGENTS.md

# Return Route

A walk that pays. Pick how long you've got; the app plans a loop through the spots where drink cans and bottles get left behind and finishes at a deposit return machine. Back home, one photo of the haul and Gemma counts it; the refund comes from the deposit table. Keep it, or switch to Walk for a cause and give it away.

Entry for the **DEV Hacktoberfest Open-Source AI Challenge, Week 1: Touch Grass** (tag `#hf26challenge`). Solo build by Muhammad Murtuza Hussain (muhammadmurtuza.com). Same stack as the earlier entry Pīzhù (`../pizhu`).

- **Deadline:** Sun 11 Oct 2026 23:59 PDT = **Mon 12 Oct 07:59 Irish time**. The submission is a DEV post.
- **Live:** https://return-route.onrender.com (Render free tier, sleeps when idle)
- **Repo:** https://github.com/MuhammadMurtuzaHussain/return-route (public, MIT)
- **Prize categories in view:** Gemma featured category, plus Render and Mastra.

## Working rules

- Commit and push every change straight to `main`. No branches, no PRs.
- Run `pnpm test`, `pnpm lint` and `npx tsc --noEmit` before each commit.
- Never commit `.env.local` (it holds the AI Studio key). The Sentry DSN in `render.yaml` is fine: a DSN can only send events.
- The name is **Return Route**, never "Re-turn" (that's Ireland's scheme operator). The app is unofficial.
- Copy: plain words, sentence case, no em dashes, no exclamation marks. Money is always a **range** ("€0.88 to €3.15"). The viral 9GAG PS5 story is **unverified**: say so wherever it appears.
- Galway is the home turf: demo start is Terryland Forest Park, where the author volunteers on weekend cleanups.

## Commands

```bash
pnpm dev          # http://localhost:3100
pnpm test         # vitest, 49 tests
pnpm lint
pnpm eval         # haul-reading eval per tier (needs photos in eval/hauls/, currently empty)
pnpm eval:plan    # planner eval: 8 Galway walks, results in eval/results/
pnpm snapshot     # refresh data/galway*.json from OpenStreetMap
```

Laptop tier needs `ollama pull gemma4:e4b`. Cloud tier needs `MODEL_PROVIDER=google` and `GOOGLE_GENERATIVE_AI_API_KEY`. See `.env.example`.

## Gemma, three tiers

| Tier | Model | Code |
| --- | --- | --- |
| Phone (edge) | Gemma 4 E2B, WebGPU via transformers.js, ~3.4 GB download | `src/lib/ai/edge.worker.ts` |
| Laptop (local) | `gemma4:e4b` via Ollama | `src/mastra/model.ts` |
| Cloud | `gemma-4-26b-a4b-it` via Google AI Studio | `src/mastra/model.ts` |

Phones only allow WebGPU on HTTPS, so test the edge tier on the Render URL, over wifi. The author's Mac is short on disk, so don't download the edge weights there.

## The core invariant: Gemma judges, code guarantees

This split lets a 2B model on a phone do the job, and it's the story of the DEV post. Don't weaken it.

- **Stops come only from the map.** Gemma picks from a list of real places; invented stops are dropped and over-long routes trimmed (`src/lib/ai/guard.ts`). For every return point on offer, code precomputes the stops that fit if the walk ends there, and the guard falls back to those.
- **Money is never the model's job.** Gemma reports material, size, deposit mark and crushed or not. Payout comes from `src/lib/countries.ts` (Ireland plus 18 other European schemes; UK not included, its scheme starts Oct 2027). `stripMoney` removes any cash promise.
- **Place names in the spoken briefing come from code** (`composeBriefing` in `src/lib/plan/pipeline.ts`). Gemma only adds what to look for and one safety tip.
- **Titles must name a real place on the route** (`namesAPlace`), otherwise the code falls back to "<place> loop".
- The haul voucher is itemised by `receiptLines` in `guard.ts`.
- Every guard override is a Sentry issue tagged with tier and model.

## Architecture

- **Planning** is a Mastra workflow (`src/mastra/workflows/planWalk.ts`): `place → map ‖ weather ‖ events → assemble → pick → route`. The phone tier runs the first half on the server, then Gemma picks in the worker and the server guards and routes.
- **Map data** (`src/lib/server/area.ts`, `src/lib/plan/tiles.ts`, `overpass.ts`): cache → `data/galway*.json` snapshot → OpenFreeMap vector tiles (plus mapped return machines from Overpass) → full Overpass → browser fetches from the walker's own connection. Public servers refuse Render's shared IPs, so the browser fallbacks matter.
- **Weather**: Open-Meteo, fetched by the browser. **Routing**: Valhalla (FOSSGIS); the real walk time is checked and stops are dropped until it fits.
- **Optional services**, each off until its env var is set: Render Key Value (`REDIS_URL`), Sentry (`SENTRY_DSN`), SerpApi Google Events (`SERPAPI_KEY`; not on SerpApi's free plan, so rejections are cached for an hour).
- **Client state** lives in localStorage (`src/lib/client/store.ts`): totals, goal, hotspot history, settings. There are no accounts.

## Design system: waymark and voucher

Built on an Irish waymarked trail post (black post, yellow arrow) and a return machine's thermal voucher. Tokens live in `src/app/globals.css`.

- Off-black, paper white and **one accent, waymark yellow** (`--mark`). Cause mode (`data-mode="cause"`) swaps in a green palette.
- Archivo with its width axis (`.sign` = condensed signage, `.semi`), plus IBM Plex Mono for numbers and the voucher. Tabular figures for money.
- Shapes: controls 12px, panels 20px, signs are arrows (`.blade`). Stops are diamond waymarks. Totals are a `.voucher` with torn zigzag edges and `.leader` dotted lines.
- Phosphor icons. Light, dark or system appearance, set in Settings and applied before paint. Respect `prefers-reduced-motion`.
- Avoid generic AI UI: no pill buttons, iOS toggles, gradient cards or progress-bar clichés.

## Screens (`src/components`)

`App.tsx` shell → `Welcome` (first visit) → `GoScreen` (fingerpost blades for 30 min / 1 hour / 90 min, customise time and direction, `VoucherStub`) → `Planning` (cancellable) → `RouteView` (map, estimate range, stops, briefing quote, sticky Start walking / speak / GPX) → `HaulScreen` (camera, gallery, sample photo or hand count → itemised voucher → Keep / Donate) → `Logged` (thank-you, impact, a post Gemma drafts, shareable voucher image). Also `SettingsSheet`, `DemoBar` and `Footer` (credits plus the challenge link).

**Guided demo:** `/?demo` plans a real walk from Terryland, plays it on the map and shows the real haul from the 11 Oct test walk (`public/demo/real-haul.jpg`). That voucher is checked against what the Re-turn machine at Lidl paid: 2 cans at 15c, €0.30. If Gemma is unreachable it falls back to a labelled recorded plan. It never touches real totals.

## Progress log

- **9 Oct:** MVP built across all three tiers, plus Render blueprint, deposit table and Galway snapshot. Disk on the Mac cleared to about 2 GB.
- **10 Oct:** pushed to GitHub. UI redesigned from the generic look to waymark and voucher. Footer credits added. Guided demo, cause mode, welcome screen, walk-logged screen and the appearance setting added.
- **10–11 Oct:** Sentry agent tracing, SerpApi events, Key Value cache, parallel workflow. Planner eval (before → after): cloud untouched by the guard 7/8 → 8/8, local 6/8 → 7/8; both reached 0 too-long walks and 5/5 finishes where asked. Map data moved to OpenFreeMap tiles, so plans work anywhere in Europe.
- **11 Oct:** test walk in Galway. The real haul was checked at the Lidl machine (€0.30) and is now in the demo. Render deploy live, `/api/status` returns 200.

## Open items (not confirmed done as of 11 Oct)

- [ ] Edge tier on the Android phone over the Render URL: download, plan and haul read, with timings for the post.
- [ ] Haul eval: put real photos and true counts in `eval/hauls/`, then run `pnpm eval` per tier.
- [ ] Write the DEV post (tag `#hf26challenge`, AI disclosure). Lead with the "Gemma judges, code guarantees" split, the eval numbers and the real €0.30 voucher. Footage is in `../Video for return-route/`.
- [ ] Decide on the untracked Sentry wizard scaffolding (`src/app/sentry-example-page/`, `src/app/api/sentry-example-api/`, `.mcp.json`). Probably delete or gitignore it rather than ship it.
