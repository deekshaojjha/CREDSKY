# SkyNI

Live weather for any city. Plain HTML, CSS and vanilla JavaScript on top of [WeatherAPI.com](https://www.weatherapi.com/), with a dark, Cred-inspired UI.

## Run locally

```bash
cp .env.example .env        # then put your WeatherAPI key in WEATHER_API_KEY
npm start                   # builds js/config.js from .env and serves on http://localhost:3000
npm test                    # 25 logic tests (personality, API errors, stale-response guard)
```

The app uses ES modules, so open it through a server (`npm start`), not by double-clicking `index.html`.

## Deploy (Vercel)

Add an environment variable `WEATHER_API_KEY` in the Vercel project. `vercel.json` runs `node scripts/build-config.cjs` at build time, which writes `js/config.js` from it.

## Security note

There is no backend (out of scope in the PRD), so the key is delivered to the browser and **is not a secret**. In the WeatherAPI dashboard, use a key you can rotate. `.env` and the generated `js/config.js` are git-ignored so the key stays out of the repo.

## Structure

```
index.html            markup
css/styles.css        styles
js/api.js             WeatherAPI client + error classification
js/personality.js     weather mood rules and thresholds (FR-05)
js/guard.js           stale-response guard (FR-08)
js/ui.js              DOM rendering, JSON viewer
js/app.js             controller
scripts/build-config.cjs   .env -> js/config.js
tests/logic.test.js   unit tests
```

## Weather mood rules (FR-05)

First match wins:

| # | Condition | Mood |
|---|-----------|------|
| 1 | Rain, drizzle or thunder code | Rain Check |
| 2 | Temp ≤ 5 °C, or snow/ice code | Freeze Frame |
| 3 | Temp ≥ 35 °C | Sun Alert |
| 4 | Wind ≥ 30 km/h | Breezy Mode |
| 5 | 18–30 °C | Perfect Day |
| 6 | Otherwise | Easy Going |

## Requirement checklist

**Verified** = covered by an automated check that passed (`npm test`, plus a jsdom smoke run of the real UI code against a stubbed `fetch`). **Not verified** = needs a real browser or a live API call, which I could not do in the build sandbox (outbound requests to api.weatherapi.com were blocked).

| Req | Status | Notes |
|-----|--------|-------|
| FR-01 Mumbai default, auto-fetch, loading, success, error | Verified (stubbed API) | One request on load; input shows Mumbai |
| FR-02 Search, button, Enter, empty validation, failure | Verified (stubbed API) | Enter uses native form submit; the real keypress was not simulated |
| FR-03 Ten popular chips, sync input, highlight | Verified (stubbed API) | |
| FR-04 Card values, °C, km/h, icon, local time | Verified for population; **not verified** against live data | Local time uses `Intl` with the API's `tz_id` |
| FR-05 Weather mood with priority order | Verified | Thresholds in `personality.js` |
| FR-06 Primary and secondary metrics | Verified (stubbed API) | |
| FR-07 Formatted/raw JSON, tabs, copy, scroll | Verified except scroll | Scroll is CSS (`max-height` + `overflow:auto`), not tested; real clipboard not tested |
| FR-08 Error handling, retry, stale-response guard | Verified (stubbed API) | Error codes mapped from WeatherAPI docs, **not** checked against live error bodies |
| FR-09 Responsive, no mobile overflow | **Not verified** | CSS written for it; needs a check in real browsers/devices |
| FR-10 WeatherAPI integration | URL and params verified; **live call not verified** | Endpoint `/v1/current.json?key=…&q=…` |
| Visual fidelity to the reference screenshot | **Not verified** | No screenshot was attached; design is my Cred-style interpretation |
| Accessibility | Partly | Labels, roles and live regions added; no screen-reader or axe audit run |
| Cross-browser (Chrome/Safari/Firefox/Edge) | **Not verified** | Uses `color-mix()`, which needs recent browsers |

## Out of scope (per PRD)

Auth, database, profiles, history, forecasting, push notifications, payments, admin dashboard, backend.
