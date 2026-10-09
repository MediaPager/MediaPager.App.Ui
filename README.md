# MediaPager.App.Ui

The MediaPager **single-page app** — Vue 3 + Quasar 2 + Vite 8, with axios, video.js +
`@videojs/http-streaming` for HLS playback.

## What it is

A data-driven client over `MediaPager.App.Api`. Rather than hard-coding providers, the SPA reads
`GET /sources` and renders navigation, browse screens, detail sheets, and settings
generically from whatever plugins are loaded.

- **`/sources`-driven nav** — the Stream tab bar merges the built-in media kinds with
  provider-contributed `source:{key}` tabs. Left nav = Stream + your library catalogs
  (reorderable).
- **Generic provider screens** — `SourceBrowseGrid` (poster grid + pagination over
  `/sources/{key}/browse`) and `SourceDetailSheet` (backdrop/poster/credits/seasons over
  `/sources/{key}/details/{id}`) render any stream source.
- **Data-driven settings** — one settings tab per plugin that declares a settings schema
  (`IPluginSettingsSchema`), rendered from the schema and read/written through
  `/plugins/{key}/settings`. Secret fields never round-trip.
- **Sandboxed custom UI** — a source with `CustomUi = true` is embedded in a
  `sandbox="allow-scripts"` iframe (`PluginCustomUiFrame`), bridged over `postMessage`; the
  bearer token is attached parent-side and never crosses into the iframe.

## Routing (vue-router 4)

Bookmarkable URLs + back/forward; tab state lives in route params.

| Route | Screen |
|---|---|
| `/` | → `/stream/movies` |
| `/stream/:tab` | a stream sub-tab (`movies`, `tv`, …, `source:{key}`) |
| `/catalog/:name` | a library catalog, keyed by its unique name (`/catalog/My%20Movies`) |
| `/settings/:tab?` | settings (`setup`, `general`, …, `plugin:{id}`) — scope-gated |
| `/profile` | account profile |
| anything else | a retro-TV 404 page (keeps the bad URL visible) |

A global guard blocks every route without a token and redirects `/settings/*` without a
settings-capable scope. The API base URL is resolved before mount
(`loadRuntimeConfig()`), so no request ever races the placeholder base.

## Develop

```sh
npm install
npm run dev        # http://localhost:5173
```

The UI targets the API at `http://localhost:5074` by default. Override with
`VITE_API_BASE_URL`, or serve a `runtime-config.json` next to the built app with
`{ "apiBaseUrl": "http://your-api" }` (loaded before mount).

> **Note:** history routing requires the web host to serve a history fallback (unknown paths
> → `index.html`). The launcher and nginx config do this; a bare static server needs a shim.

## Build

```sh
npm run build      # → dist/
```
