# Return Route

**A walk that pays.** Tell it how long you've got. It plans a loop through the spots where drink cans and bottles get left behind (picnic tables, pitches, viewpoints near off-licences) and finishes at a deposit return machine. It gives you an honest estimate of what you'll make, hands the route to Google Maps, and then gets out of your way.

When you're back, take one photo of your haul. Gemma counts the containers, flags the ones the machine will refuse and works out your refund from the deposit table. You can keep the money, or switch to **Walk for a cause** and give it away: the app turns green, counts what you've given, and Gemma drafts a post to get others walking.

Built for the [Hacktoberfest Open-Source AI Challenge, Week 1: Touch Grass](https://dev.to/challenges/hf26). It covers Ireland's Re-turn scheme and 18 other European deposit schemes. Return Route is unofficial and not affiliated with Re-turn or any scheme operator.

## Open AI at the core: Gemma, three ways

The same open-weight Gemma family runs wherever you choose:

| Where | Model | What leaves your device |
| --- | --- | --- |
| **On your phone** | Gemma 4 E2B, in the browser via WebGPU ([transformers.js](https://huggingface.co/onnx-community/gemma-4-E2B-it-ONNX)) | Your location, to fetch map data. **Never your photos.** |
| **On your laptop** | Gemma 4 E4B through [Ollama](https://ollama.com) | Nothing beyond your own machine |
| **In the cloud** | Gemma 4 26B-A4B through Google AI Studio | Location and photo, to Google |

Gemma does the parts that need judgement. It reads what you ask for ("finish at Tesco, stay off the main road"), picks and orders the stops, explains each one in a line, and reads your haul photo. Everything that must be right is plain code that Gemma can't override:

- **Stops come only from the map.** Gemma picks from a list of real places. A stop it invents is dropped, and a route too long for your time is trimmed. ([src/lib/ai/guard.ts](src/lib/ai/guard.ts))
- **Money is never the model's job.** Gemma reports what it sees: material, rough size, whether the deposit mark is visible, crushed or not. The payout comes from the deposit table, and any sentence where Gemma promises cash is stripped. ([src/lib/countries.ts](src/lib/countries.ts))
- **Spoken place names come from the map.** The briefing read aloud before you set off is composed in code. Gemma adds what to look for and one safety tip, so a 2B model can't send you to the wrong park.

That split is what lets a 2B model on a phone do the same job as a 26B model in the cloud.

## How it works

```
Plan:  where you are + how long + what you asked for
  → OpenStreetMap              picnic tables, pitches, playgrounds, off-licences, supermarkets
                               (OpenFreeMap vector tiles; Overpass for mapped return machines)
  → Open-Meteo                 yesterday's weather (a warm evening leaves cans behind)
  → SerpApi (optional)         what's on in town today: a match or a gig leaves cans behind too
  → score                      hotspot priors × weather × day of week × events × your own past hauls
  → Gemma                      picks and orders 2–3 stops, one line each on why
  → guard                      real places only, fits your time
  → Valhalla                   walking route through the stops to the return point
  → estimate                   a range, priced from the deposit table
  → Google Maps link · GPX · spoken briefing
Haul:  photo → Gemma (vision) → items → deposit table → refund
```

On the server, planning is a [Mastra](https://mastra.ai) workflow ([src/mastra/workflows/planWalk.ts](src/mastra/workflows/planWalk.ts)): `place → map ‖ weather ‖ events → assemble → pick → route`, with the map, weather and events fetched in parallel. The phone tier runs the first half of the same workflow on the server, then Gemma picks in a Web Worker on the phone ([src/lib/ai/edge.worker.ts](src/lib/ai/edge.worker.ts)) and the server guards and routes the result.

There is no live litter feed anywhere, so hotspot estimates start as honest priors. Each walk you log shifts the estimate for the stops you visited, and that history stays on your device.

## Works anywhere with a deposit scheme

Public map servers turn busy cloud servers away, so map data comes from OpenFreeMap's vector tiles, served from a CDN, and is cached in Render Key Value per neighbourhood. If the tiles and Overpass both fail, the browser fetches the map from the walker's own connection and plans again. Weather is always fetched by the browser. Planned walks are checked against the real walking path, so a river with one bridge can't turn 30 minutes into 50.

## Optional services

Each one is off until its environment variable is set, and the app works the same without it.

- **Render Key Value** (`REDIS_URL`): one shared cache for Overpass areas, today's events and the rate limits, so a busy Overpass server or a restart doesn't cost a plan. [render.yaml](render.yaml) creates it.
- **Sentry** (`SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`): each plan is a trace with a span per workflow step (map, weather and events overlap because they run in parallel) and a `gen_ai` agent span per Gemma call with the model, tier, latency and tokens. Every time the guard overrules Gemma it's an issue tagged with the tier and model, including the phone's picks, which are guarded on the server. No prompts, coordinates, photos or anything the walker typed are sent, and there is no session replay. ([src/lib/server/telemetry.ts](src/lib/server/telemetry.ts))
- **SerpApi** (`SERPAPI_KEY`, on a plan that includes the Google Events engine): today's events in town from Google Events. Only the town's name is sent. Venues are placed on the map by name against OpenStreetMap, and stops near one get a boost and a reason ("Galway United vs Derry City at Eamonn Deacy Park today"). ([src/lib/server/events.ts](src/lib/server/events.ts))

## Run it

```bash
pnpm install
cp .env.example .env.local     # pick MODEL_PROVIDER=ollama or google
ollama pull gemma4:e4b         # for the laptop tier
pnpm dev                       # http://localhost:3100
```

- **Phone tier:** open the app in Chrome (Android or desktop), go to Settings and choose **On this phone**. The first time, it downloads about 3.4 GB of weights, so use wifi.
- **Guided demo:** open [`/?demo`](http://localhost:3100/?demo), or tap **Watch the demo** on the home screen. It plans a real walk from Terryland Forest Park with Gemma, plays the walk on the map, reads a sample haul photo, gives the refund away and drafts the post. If Gemma can't be reached it shows a recorded plan and reading, and says so. Your real totals are never touched.
- **Tests:** `pnpm test`
- **Haul-reading eval per tier:** add photos and true counts to `eval/hauls/`, then run `pnpm eval`.

## Data and credits

- Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors (ODbL), read from [OpenFreeMap](https://openfreemap.org)'s vector tiles (the same tiles the map draws), with mapped return machines from Overpass.
- Map tiles from [OpenFreeMap](https://openfreemap.org).
- Routing by [Valhalla](https://github.com/valhalla/valhalla) on the FOSSGIS server.
- Weather from [Open-Meteo](https://open-meteo.com).
- Events from Google Events via [SerpApi](https://serpapi.com), when a key is set.
- Deposit rates come from [re-turn.ie](https://re-turn.ie) and TOMRA's 2026 overview.
- `data/galway.json` and `data/galway-east.json` are OpenStreetMap snapshots, so Galway plans instantly and the demo never waits on a map server.
- The demo's sample haul photo (`public/demo/haul.jpg`) was generated with [FLUX.1-dev](https://huggingface.co/black-forest-labs/FLUX.1-dev) on its Hugging Face Space, with deposit-mark stickers added. Swap in a real photo any time.

## Good manners

Pick up litter from the ground only. Leave bins, and in Germany the Pfandring, for the people who rely on them. Wear gloves, leave broken glass alone, and don't crush the cans, because the machines reject crushed ones.

MIT licensed.
# return-route
