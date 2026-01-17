# WDS Stormforge

WDS Stormforge is a web app for detention pond design using the Modified Rational Method with NOAA Atlas 14 IDF data (Next.js 16 / React 19 / TypeScript / Tailwind).

## Quickstart

```bash
npm install
npm run dev
```

## What it does

- Hydrology: select a saved location or fetch Atlas 14 by lat/lon, then view IDF curves and choose storm events
- Drainage: define existing/proposed drainage areas (C, Tc, acres)
- Pond sizing: storage via Modified Rational Method (generic prism or imported stage-storage)
- Outfall: outlet/orifice sizing and regime checks
- Settings: manage saved locations + engineering constants

## Data + storage

- NOAA Atlas 14 PFDS endpoint: `https://hdsc.nws.noaa.gov/cgi-bin/new/cgi_readH5.py`
- SQLite (server-side) stores cities + rainfall points; UI inputs are persisted in localStorage
- Pre-seeded dataset includes 101 Texas cities (run the verify script to see counts/coverage)

## Useful scripts

```bash
npx tsx scripts/seedTexasCities.ts
npx tsx scripts/verifyDatabase.ts
```

## Deeper docs

- Orifice sizing algorithm notes: [docs/orifice-solver-logic.md](docs/orifice-solver-logic.md)

## License

Proprietary - WDS Engineering
