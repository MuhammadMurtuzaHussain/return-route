@AGENTS.md

# Return Route

A walk that pays. Pick how long you've got; the app plans a loop through the spots where drink cans and bottles get left behind and finishes at a deposit return machine. Back home, one photo of the haul and Gemma counts it; the refund comes from the deposit table. Keep it, or switch to Walk for a cause and give it away.

Entry for the **DEV Hacktoberfest Open-Source AI Challenge, Week 1: Touch Grass** (tag `#hf26challenge`). Solo build by Muhammad Murtuza Hussain (muhammadmurtuza.com). Same stack as the earlier entry Pīzhù (`../pizhu`).

- **Deadline:** Sun 11 Oct 2026 23:59 PDT = **Mon 12 Oct 07:59 Irish time**. The submission is a DEV post.
- **Live:** https://return-route.onrender.com (Render free tier, sleeps when idle)
- **Repo:** https://github.com/MuhammadMurtuzaHussain/return-route (public, MIT)
- **Prize categories in view:** Gemma and Render (featured), plus Mastra and Sentry Agent Tracing. You can win only once per challenge, so go deep on these four rather than wide.
- **Decided against** (11 Oct, don't reopen without a new reason):
  - **SerpApi**: Google Events, the only engine that fits, isn't on the free plan. Bing and Google Maps returned no usable events or return machines. The code is inert without a paid plan.
  - **Tinker**: it can't fine-tune Gemma, and a fine-tuned model couldn't reach the phone or Ollama before the deadline.
  - **DigitalOcean**: it serves only `gemma-4-31B-it`, with image input unconfirmed. It would only replace AI Studio.
  - **ElevenLabs, MongoDB, Tiger Data**: a closed voice or shared storage would break the "stays on your device" story.

## Working rules

- Commit and push every change straight to `main`. No branches, no PRs.
- Run `pnpm test`, `pnpm lint` and `npx tsc --noEmit` before each commit, and `pnpm build` when config, deps or server code changed.
- Several Claude sessions work in this repo at once. Pull before large edits. Another session's `next dev` usually holds port 3100, so check end to end with the `return-route-prod` launch config (`next start` after `pnpm build`, auto port).
- Never commit `.env.local` (it holds the AI Studio key). The Sentry DSN in `render.yaml` is fine: a DSN can only send events.
- The name is **Return Route**, never "Re-turn" (that's Ireland's scheme operator). The app is unofficial.
- Copy: plain words, sentence case, no em dashes, no exclamation marks. Money is always a **range** ("€0.88 to €3.15"). The viral 9GAG PS5 story is **unverified**: say so wherever it appears.
- Galway is the home turf: demo start is Terryland Forest Park, where the author volunteers on weekend cleanups.

## Commands

```bash
pnpm dev          # http://localhost:3100
pnpm test         # vitest, 54 tests
pnpm lint
pnpm eval         # haul-reading eval per tier (needs photos in eval/hauls/, currently empty)
pnpm eval:plan    # planner eval: 8 Galway walks, results in eval/results/
pnpm snapshot     # refresh data/galway*.json from OpenStreetMap
```

Preview configs live in the parent folder's `.claude/launch.json`: `return-route` (dev, 3100), `return-route-prod` (`next start`, 3101) and `return-route-blocked` (prod with Overpass pointed at an invalid host, to test the map fallbacks).

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
- **Gemma never sends people into bins.** `leaveBins` drops any sentence about bins or the Pfandring unless it says to leave them alone. `walkTitle` rejects generic titles ("Park Waste Collection") and turns "run" into "loop".
- **Posts: Gemma writes one line, code adds the facts.** `/api/post` (or the phone worker) returns a line that `guardPostLine` strips of numbers, money and hashtags. `composePost` in `src/lib/client/share.ts` adds the count, the amount and the cause from the voucher.
- **Haul notes lose the narration.** `cleanNotes` drops "Based on the image, I have identified 7 containers" before the voucher shows them.
- The haul voucher is itemised by `receiptLines` in `guard.ts`.
- Every guard override is a Sentry issue tagged with tier and model.

## Architecture

- **Planning** is a Mastra workflow (`src/mastra/workflows/planWalk.ts`): `place → map ‖ weather ‖ events → assemble → pick → route`. The phone tier runs the first half on the server, then Gemma picks in the worker and the server guards and routes.
- **Map data** (`src/lib/server/area.ts`, `src/lib/plan/tiles.ts`, `overpass.ts`): cache → `data/galway*.json` snapshot → OpenFreeMap vector tiles (plus mapped return machines from Overpass) → full Overpass → browser fetches from the walker's own connection. Public servers refuse Render's shared IPs, so the browser fallbacks matter.
- **Weather**: Open-Meteo, fetched by the browser. **Routing**: Valhalla (FOSSGIS); the real walk time is checked and stops are dropped until it fits.
- **Optional services**, each off until its env var is set: Render Key Value (`REDIS_URL`), Sentry (`SENTRY_DSN`), SerpApi Google Events (`SERPAPI_KEY`; not on SerpApi's free plan, so rejections are cached for an hour).
- **Client state** lives in localStorage (`src/lib/client/store.ts`): totals, goal, hotspot history, settings. There are no accounts.

### Map data details (from debugging the cloud tier, 11 Oct)

- Render's free tier sends traffic from IPs shared with many apps. Overpass, Nominatim and Open-Meteo answer them with 429 or 504, and local runs never show it. Sentry breadcrumbs show which services refused.
- Tiles (`fetchAreaFromTiles`) read OpenFreeMap's z14 POI layer. The URL comes from the TileJSON at `tiles.openfreemap.org/planet` because it changes weekly. There are no benches or return machines; supermarkets become "shop" return points. In tests, a 30-minute area took about 1–2 s in Galway, Berlin, Copenhagen, Amsterdam and Vienna. The live site planned Vienna from tiles.
- Overpass `fetchMachines` has a 6 s budget and runs alongside the tiles. Only CORS-friendly mirrors go in `BROWSER_MIRRORS` (overpass-api.de, lz4, z); private.coffee and kumi fail CORS. Both lists are tried twice.
- Scoring caps street furniture: bins count up to 4 per cell and are only a stop inside a park, named after the park. Cities that map every bin otherwise rank "Bins (4)" first. Pitches for karting, golf and horses don't count.
- Look-alike stops are named "north end of X" or "Pitch, 400 m north" (`distinctLabels`). The briefing uses `spokenNames` so it never says the same park twice.
- Areas are cached for 12 h in Key Value. An area cached by old code keeps its old `areaFrom` until it expires.

## Sentry and Render

- **One Sentry SDK:** `@sentry/nextjs` v11 from the wizard (`sentry.*.config.ts`, `src/instrumentation*.ts`). Don't add `@mastra/sentry`: it pulls in `@sentry/node` v10, and two SDKs fight over OpenTelemetry. Traces and issues come from `src/lib/server/telemetry.ts`:
  - a span per workflow step (map, weather and events overlap, which shows the parallelism);
  - `gen_ai.invoke_agent` and `gen_ai.chat` spans with tokens;
  - `reportGuard`, one issue per rule.
- **Sentry privacy:** no prompts, coordinates, photos or typed text are sent, and Session Replay is removed. `dataCollection` alone didn't do it: Open-Meteo and Nominatim span URLs carried lat/lon, and Redis span descriptions carried cache keys with rounded coordinates and the client IP (rate limiter). `src/lib/privacy.ts` (spread into all three `Sentry.init`s) strips URL query strings and cuts `rr:` keys to their kind. Spans sent before `c914ec5` still hold coordinates until Sentry's retention expires. The DSN comes from `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN`, so forks don't report to our project.
- **Mastra errors:** a failed step's error comes back as a plain object, not an Error. Read it with `failure()`.
- **Render:** Blueprint-managed (`render.yaml`), region oregon, free plan, so a cold start after idle takes about 50 s.
  - Key Value `return-route-cache` (Valkey, free, internal only) feeds `REDIS_URL`.
  - A Blueprint sync never prompts for new `sync: false` secrets. Add them on the service's Environment page.
  - `GET /api/status` → `services: { cache, events, tracing }` shows what's switched on.

## Design system: waymark and voucher

Built on an Irish waymarked trail post (black post, yellow arrow) and a return machine's thermal voucher. Tokens live in `src/app/globals.css`.

- Off-black, paper white and **one accent, waymark yellow** (`--mark`). Cause mode (`data-mode="cause"`) swaps in a green palette.
- Archivo with its width axis (`.sign` = condensed signage, `.semi`), plus IBM Plex Mono for numbers and the voucher. Tabular figures for money.
- Shapes: controls 12px, panels 20px, signs are arrows (`.blade`). Stops are diamond waymarks. Totals are a `.voucher` with torn zigzag edges and `.leader` dotted lines.
- Phosphor icons. Light, dark or system appearance, set in Settings and applied before paint. Respect `prefers-reduced-motion`.
- Avoid generic AI UI: no pill buttons, iOS toggles, gradient cards or progress-bar clichés.

## Gotchas (learned the hard way)

- **MapLibre markers:** never set `position` on a custom marker element. It overrides MapLibre's absolute positioning, and the markers stack down the page (stops 2, 3 and € were drawn 30, 60 and 90px off the route). `RouteMap` also refits when its box resizes.
- **Sideways jump:** `html { scrollbar-gutter: stable }` stops the page shifting when a screen or mode is long enough to need a scrollbar.
- **Before paint:** the inline script in `layout.tsx` sets `data-theme` (the raw `return-route.theme` string, not JSON) and `data-mode="cause"` from saved settings or `?demo`, so there's no flash. `App` keeps `<meta name="theme-color">` in step.
- **Dialogs** use `src/lib/client/useDialog.ts`: Escape closes, Tab stays inside and focus returns afterwards.
- **The demo keeps its own state** (`Demo` in `App.tsx`) and never writes totals, history or the last plan to localStorage. A stale `planSeq` result is ignored, which is how Cancel and Exit demo work.
- **Gemma 4 E4B on haul photos:** it overcounts busy layouts by about one, and it can't confirm the deposit mark unless the logo is clearly visible, so mark calls swing between runs. That's why the sample photo has stickers and the demo uses the checked real-haul reading.
- **Generating images:** the Hugging Face account has no Inference Providers credit (402), but the FLUX.1-dev Space works on the free ZeroGPU quota (300 s a day) through its Gradio API with `hf auth token`. Canva's generate-image only exposes signed thumbnails; a full-size export means saving it into a design.

## Screens (`src/components`)

`App.tsx` shell → `Welcome` (first visit) → `GoScreen` (fingerpost blades for 30 min / 1 hour / 90 min, customise time and direction, `VoucherStub`) → `Planning` (cancellable) → `RouteView` (map, estimate range, stops, briefing quote, sticky Start walking / speak / GPX) → `HaulScreen` (camera, gallery, sample photo or hand count → itemised voucher → Keep / Donate) → `Logged` (thank-you, impact, a post Gemma drafts, shareable voucher image). Also `SettingsSheet`, `DemoBar` and `Footer` (credits plus the challenge link).

**Guided demo:** `/?demo` plans a real walk from Terryland, plays it on the map and shows the real haul from the 11 Oct test walk (`public/demo/real-haul.jpg`). That voucher is checked against what the Re-turn machine at Lidl paid: 2 cans at 15c, €0.30. If Gemma is unreachable it falls back to a labelled recorded plan. It never touches real totals.

- The haul step does **not** call Gemma on that photo. Live reads by `gemma4:e4b` and `gemma-4-26b-a4b-it` both came to €0.00 (marks "no" or "unsure"): the Re-turn logos are too small in a top-down bag shot. So the demo shows the checked reading (`REAL_HAUL` in `src/lib/demo/index.ts`, passed to `HaulScreen` as `known`) and the voucher footer says where it came from. A photo taken in the demo with the camera or gallery still goes to Gemma live.
- "Try a sample photo" outside the demo still uses the FLUX image (`public/demo/haul.jpg`), which has big deposit stickers Gemma can read.

## Progress log

- **9 Oct:** MVP built across all three tiers, plus Render blueprint, deposit table and Galway snapshot. Disk on the Mac cleared to about 2 GB.
- **9–10 Oct:** pushed to GitHub. UI redesigned from the generic look to waymark and voucher. Footer credits added.
- **11 Oct, morning (`d86cfab`, `4fec91d`):** first-user feedback session. Added the welcome popup with the 9GAG story, the guided demo (`/?demo`, 8 captioned steps in `src/lib/demo/index.ts`, map walk-through, recorded plan fallback), Walk for a cause (green theme, giving voucher, Give as the main action), the walk-logged screen (Gemma-drafted post, voucher image via `share.ts`), Customise this walk (20 to 180 min plus direction) and the appearance setting. The audit fixes were marker drift, lowercased titles, nav wrap on phones, bin advice and generic titles, Escape and focus in dialogs, planning Cancel, labelled Briefing and GPX buttons, the sideways jump, the theme flash and the browser bar colour. The Terryland and Donate chips were removed at the author's request; the demo and cause mode cover them. The FLUX sample photo was generated for "Try a sample photo".
- **10–11 Oct:** Sentry agent tracing, SerpApi events, Key Value cache, parallel workflow. Planner eval (before → after): cloud untouched by the guard 7/8 → 8/8, local 6/8 → 7/8; both reached 0 too-long walks and 5/5 finishes where asked. Map data moved to OpenFreeMap tiles, so plans work anywhere in Europe.
- **11 Oct:** test walk in Galway. The real haul was checked at the Lidl machine (€0.30) and is now in the demo (`ce334b6`). Small hauls show grams recycled ("≈32 g") instead of "0 kg". Render deploy live, `/api/status` returns 200.
- **11 Oct, evening:** two videos of the walk made in `../return-route-videos` (see below).
- **11 Oct, late (`3a2118d`, `e364c65`, `097631b`, `c914ec5`):** no stops inside school or childcare grounds or on `access=private` (Overpass `out geom` outlines; tiles use the landuse school/kindergarten polygons, and each POI is now read only from the tile it's in, since a neighbour tile's margin holds only a sliver of the outline). Snapshots refreshed: east Galway lost 17 pitches and 6 picnic tables, the city 51 school pitches and a school playground. Area cache key bumped to `area:v2`. Post images in `docs/post/` (cover, app flow, walk strip, voucher, Sentry and Render shots). Sentry privacy fix. The real walk's estimate was €1.05 to €3.85 (author: a sign the neighbourhood is clean). The college gate was probably Merlin College Secondary School, Doughiska (inferred from the map, not confirmed).
- **DEV post draft:** `../return-route-dev-post.md`. Agent session saved on DEV as id 815 (unpublished), embedded with `{% agent_session 815 %}`. The phone tier is described as untested (no Android phone).

## The test walk and the videos

Footage is in `../Video for return-route/` (Ray-Ban Meta glasses clips plus iPhone clips and photos). The edits live in `../return-route-videos` (Remotion; its README and CLAUDE.md say how to rebuild).

- `out/ReturnRoute-Reel.mp4`: 65 s, 1080×1920, word-by-word captions and motion graphics. For Instagram, X or LinkedIn.
- `out/ReturnRoute-FullWalk.mp4`: 11:54, 1920×1080, 13 chapters with side notes and subtitles, ending with the guided demo recorded on the live site. For YouTube or the DEV post.
- Music in both is original, synthesised with numpy. Sound effects come from the earlier launch-video project and remotion.media.

Facts from the walk, for the post (times are Irish time):

- 17:26 planned at home on the laptop and phone, cloud tier, 90 minutes, 15°C and overcast. Left about 17:30 with no gloves.
- First find was a Monster Ultra can at home. Pickups on camera: a crushed can, a wrapper, a big damaged bottle, a Strong Power can in a hedge ("first score of the day"), a squashed Coca-Cola can and a crumpled carton.
- Stop 1 was a park (very clean). The author found a playground nearby they'd never seen. Stop 2 was a skate park (left alone, kids using it). Left a glass alcohol bottle in a bush.
- **Fail:** Google Maps led to a college campus gate with no way in. The author skipped the last, far stop and headed to Lidl Doughiska, predicting "about 30 cents".
- 18:19 haul photo read by Gemma in the cloud: 2 cans "mark not visible", crushed cans and bottle struck off, so €0.00 for sure and "up to €0.30". The laptop tier failed first because the laptop was at home. The author's own feedback: take the photo closer, labels up. They used + twice, chose charity and posted to X.
- 18:27 Re-turn machine: 2 items. Voucher "2 × Can at 0.15, Amount €0.30". The Monster and Strong Power cans were the only ones that qualified.
- The author has lived in Ireland two years and never used Re-turn before (drinks only water from a flask). Quote: "the open source project that I just made is working very well … we touched grass, I hope that counts."
- Lessons worth a line in the post: photo close with labels up; crushed cans don't pay; bring gloves; the planner should skip stops inside private grounds; clean streets have few cans, while off-licences and busy roads have more.

## Open items (not confirmed done as of 11 Oct)

- [ ] Edge tier on the Android phone over the Render URL: download, plan and haul read, with timings for the post.
- [ ] Haul eval: put real photos and true counts in `eval/hauls/`, then run `pnpm eval` per tier. The test-walk haul (`public/demo/real-haul.jpg`, truth: 2 eligible) is a ready first entry; live reads on 11 Oct scored 0 eligible on it. Then tune and measure before and after:
  - temperature 0 for the haul read (still 0.2 in `src/mastra/gemma.ts`);
  - have Gemma note where each container is before counting;
  - on the cloud tier, read twice and keep the middle count;
  - a "spread them out in one layer" hint on the camera screen.
- [ ] Sentry: resolve the three issues tagged `edge` ("stop that wasn't on the map", "return point…", "none of Gemma's stops…"). They were triggered on purpose as a test on 11 Oct; the `local` and `cloud` ones are real.
- [ ] Cloud tier, not yet checked by hand: the Google Maps hand-off. (The haul photo flow on Render works: sample photo read in 14.6 s on 11 Oct late.)
- [x] Screenshots for the post: in `docs/post/` (Sentry issues, trace, agent view and Overpass breadcrumbs; Render deploys and Blueprint; the Mastra workflow shows in the Sentry trace; the eval is a table in the post). Crop Sentry shots so no IPs or coordinates show.
- [ ] Publish the DEV post (draft in `../return-route-dev-post.md`) (tag `#hf26challenge`, AI disclosure). Lead with the "Gemma judges, code guarantees" split, the eval numbers and the real €0.30 voucher. Embed the full-walk video and use the reel for socials (`../return-route-videos/out/`); the walk facts above have the story.
- [x] Leave out stops inside private grounds (done 11 Oct late, see progress log).
- [ ] The 9GAG copy doesn't follow the "unverified" rule above yet: `Welcome.tsx` ("Someone in Germany posted on 9GAG…"), `Voucher.tsx` and `Logged.tsx` ("The 9GAG walker did 2,000").
- [ ] Housekeeping: delete the merged `demo-and-cause-mode` branch on GitHub, and the scratch Canva design "Photo Collage - Sustainability" left from the image experiments.
- [ ] Decide on the untracked Sentry wizard scaffolding (`src/app/sentry-example-page/`, `src/app/api/sentry-example-api/`, `.mcp.json`). Probably delete or gitignore it rather than ship it.
