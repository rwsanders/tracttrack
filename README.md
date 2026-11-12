# TractTrack

Research any tract of land from the map. Click a parcel and get the owner, appraised value, an estimated tax bill, oil and gas activity, flood exposure, soils and terrain, plus a purchase cost estimator. Everything comes from public records, queried live.

Texas is the first state. The code is organized so the next state is one new provider, not a rewrite.

## Run it

Requires Node 20 or newer.

```bash
npm install
npm run dev        # API on :8787, web app on http://localhost:5173
```

Production:

```bash
npm run build
npm start          # serves the API and the built app on :8787 (set PORT to change)
```

To host it anywhere that runs Node, `npm run package` writes a self-contained `deploy/` folder (bundled server, built app, data; no `node_modules`). Upload that folder and start it with `npm start`; it listens on `PORT`.

Checks:

```bash
npm test           # unit tests (no network needed)
npm run typecheck
```

No API keys or accounts are needed.

## What a report contains

| Section | What it shows | Source |
| --- | --- | --- |
| Overview | Owner, mailing address, site address, legal description, acreage (roll and mapped), land, improvement and market value | County appraisal districts, compiled by the Texas Geographic Information Office (TxGIO StratMap Land Parcels) |
| Taxes | County, school district and city rates applied to market value; special districts in the county listed separately | Texas Comptroller Tax Rates and Levies; Texas Education Agency district boundaries; TxGIO city limits |
| Minerals | Wells on the tract, wells within one mile by status, horizontal well paths beneath it, pipelines crossing it, the original land survey and abstract | Railroad Commission of Texas |
| Flood | FEMA zones on the tract with acres and share of the parcel in each | FEMA National Flood Hazard Layer |
| Land | Elevation range and relief, soil map units with farmland class, drainage and slope, mapped wetlands | USGS 3DEP, USDA NRCS Soil Data Access, USFWS National Wetlands Inventory |
| Costs | Cash to close, monthly carrying cost, loan payment and tax from editable assumptions | Computed in the browser |

Map layers you can switch on: parcel lines, oil and gas wells, pipelines, original surveys, flood zones, wetlands. Basemaps: streets (OpenFreeMap), aerial imagery and topo (USGS The National Map).

Other features: place, address and coordinate search; shareable links (the address bar always points at the current view and tract); tracts saved on the device.

## Known limits

These are limits of the public data, and the app says so where they apply.

- **Mineral ownership is not available.** No statewide database records who owns minerals in Texas; that takes a title search of county deed records. The app shows activity (wells, laterals, pipelines) as a signal of whether minerals are likely leased or severed.
- **Tax figures are estimates.** They apply published rates to market value. Agricultural, wildlife and timber valuations and exemptions can cut the real bill sharply. Special districts are listed but not added in, because their boundaries are not published statewide.
- **No search by owner name or parcel ID yet.** The state's parcel service allows lookups by location only. Owner search needs the parcel data loaded into our own database (see Roadmap).
- **Parcel data is as current as each county's last submission** to TxGIO. The record's collection date is shown on every report. A few counties have gaps.
- **Boundaries are tax parcels, not surveys.**
- **Aerial imagery stops sharpening past zoom 16**, the limit of the free USGS tiles.

## How it is built

```
shared/types.ts          Types used by both server and client
server/
  app.ts                 HTTP routes, caching, error handling
  validate.ts            Input validation for everything the browser sends
  geocode.ts             Place and address search
  lib/                   ArcGIS REST client, geometry helpers, cache, fetch with timeout and retry
  national/              Flood, soils, elevation, wetlands: sources that cover every state
  states/
    types.ts             The StateProvider interface
    registry.ts          The list of enabled states
    tx/                  Texas: parcels, taxes, minerals, map layers, tax rate data
web/
  App.tsx                Selection, URL state, saved tracts
  components/            Map, search, layer controls, report panel and its sections
  lib/                   API client, cost math, formatting, report loading
scripts/
  build-tx-tax-rates.mjs Rebuilds the Texas tax rate file from the Comptroller's workbooks
tests/                   Unit tests
```

The browser draws map layers straight from the agencies' map servers. Everything else goes through the API server, which normalizes each source into the shapes in `shared/types.ts`, caches results for six hours, and lets each report section succeed or fail on its own, so one slow agency never blocks the rest.

### API

| Route | Purpose |
| --- | --- |
| `GET /api/states` | Enabled states with bounds, map layers and available report sections |
| `GET /api/parcels/at?lat=&lng=` | Parcels covering a point |
| `POST /api/report/{taxes,minerals,flood,land}` | One report section for the parcel in the request body |
| `GET /api/geocode?q=` | Place, address or coordinate search |

### Adding a state

1. Create `server/states/<code>/` with a provider that implements `StateProvider` (`server/states/types.ts`): a `config` (bounds, map layers, which sections it supports) and `parcelsAt()`. Add `taxes()` and `minerals()` when the state has usable sources; leave them out and the app shows those sections as unavailable.
2. Register it in `server/states/registry.ts`.
3. Add the state code to `StateCode` in `shared/types.ts` and to the check in `server/validate.ts`.

Flood, soils, elevation and wetlands need no per-state work.

### Updating Texas tax rates

The Comptroller publishes new rate workbooks each year. To refresh:

```bash
npm run data:tx-tax-rates -- 2026
```

This rewrites `server/states/tx/data/tax-rates.json`. The file in the repository holds tax year 2025.

## Roadmap

- Load the statewide parcel file into PostGIS to enable search by owner, parcel ID and legal description, filters (acreage, value, county) and fast vector parcel layers.
- Deed and sales history from county clerk records.
- General Land Office data: state mineral leases and mineral-classified lands.
- Groundwater: Texas Water Development Board well records and aquifers.
- Special district boundaries for complete tax bills; agricultural valuation scenarios.
- Road frontage, utilities and access.
- Accounts, shared tract lists and printable reports.
- More states.

## Data use

Owner names and mailing addresses come from public appraisal rolls. Each source has its own terms; review them before commercial launch, in particular the usage policies of the free geocoder (Photon) and basemap tiles (OpenFreeMap), which are fine for development but should be replaced with a paid or self-hosted service at volume.
