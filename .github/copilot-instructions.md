# WDS Stormforge - AI Agent Instructions

## Project Overview

WDS Stormforge is a **civil engineering stormwater pond design tool** built with Next.js 16 (App Router), React 19, TypeScript, and Tailwind CSS. It helps engineers design detention ponds by calculating required storage volumes using the Modified Rational Method and NOAA Atlas 14 rainfall data.

## Quick Reference

| Aspect | Details |
|--------|---------|
| Framework | Next.js 16 (App Router) |
| UI | React 19 + Tailwind CSS (dark theme) |
| Database | SQLite via better-sqlite3 (server-side only) |
| 3D | React Three Fiber + drei |
| Icons | lucide-react |
| Units | Imperial (feet, acres, cfs, in/hr) |

## Complete Project Structure

```
Waldo_PondDesigner1/
├── .github/
│   └── copilot-instructions.md    # This file - AI agent context
├── data/
│   └── atlas14.db                 # SQLite database (auto-created)
├── scripts/
│   ├── seedTexasCities.ts         # Seed 101 Texas cities from NOAA
│   └── verifyDatabase.ts          # Database verification script
├── src/
│   ├── app/
│   │   ├── globals.css            # Tailwind + CSS variables (dark theme)
│   │   ├── layout.tsx             # Root layout with metadata
│   │   ├── page.tsx               # *** MAIN APP - Global state lives here ***
│   │   ├── api/
│   │   │   └── atlas14/
│   │   │       ├── cities/
│   │   │       │   ├── route.ts           # GET all cities, POST new city
│   │   │       │   ├── [cityId]/
│   │   │       │   │   ├── route.ts       # GET/DELETE single city
│   │   │       │   │   └── refresh/
│   │   │       │   │       └── route.ts   # POST refresh from NOAA API
│   │   │       │   ├── cleanup/
│   │   │       │   │   └── route.ts       # DELETE orphaned rainfall data
│   │   │       │   └── normalize-state/
│   │   │       │       └── route.ts       # POST normalize state abbreviations
│   │   │       ├── clear/
│   │   │       │   └── route.ts           # DELETE all cities & data
│   │   │       ├── data/
│   │   │       │   └── [cityId]/
│   │   │       │       └── route.ts       # GET rainfall data for city
│   │   │       ├── fetch/
│   │   │       │   └── route.ts           # POST fetch new city from NOAA
│   │   │       └── import/
│   │   │           ├── route.ts           # POST import CSV
│   │   │           ├── check/
│   │   │           │   └── route.ts       # GET check for duplicates
│   │   │           ├── preview/
│   │   │           │   └── route.ts       # POST preview CSV import
│   │   │           └── save/
│   │   │               └── route.ts       # POST save previewed data
│   │   ├── components/
│   │   │   ├── Atlas14Import.tsx          # CSV file import UI
│   │   │   ├── Atlas14ImportPreview.tsx   # Modal for import preview
│   │   │   ├── CityStateBar.tsx           # Compact city/state selector
│   │   │   ├── Drainage.tsx               # Drainage area table inputs
│   │   │   ├── Header.tsx                 # App header with logo
│   │   │   ├── Hydrology.tsx              # City selection, IDF chart, NOAA fetch
│   │   │   ├── OutfallDesigner.tsx        # Orifice plate design, 3D view
│   │   │   ├── PondDesigner.tsx           # Pond sizing, stage-storage, 3D
│   │   │   ├── Reports.tsx                # Report generation
│   │   │   └── SettingsMenu.tsx           # Settings dropdown menu
│   │   └── settings/
│   │       └── page.tsx                   # Settings page
│   ├── services/
│   │   └── noaaAtlas14Client.ts           # *** NOAA PFDS API client ***
│   └── utils/
│       ├── atlas14.ts                     # City/rainfall data fetch + cache
│       ├── database.ts                    # SQLite connection, schema, migrations
│       ├── drainageCalculations.ts        # Rational method Q=CiA
│       ├── hydraulics.ts                  # Orifice/weir flow equations
│       ├── hydraulicsConfig.ts            # Hydraulic constants (Cd, regime thresholds)
│       ├── idf.ts                         # IDF interpolation (log-log/linear)
│       ├── rationalMethod.ts              # Modified Rational Method calculator
│       └── stageStorage.ts                # Stage-storage curve utilities
├── eslint.config.mjs
├── next.config.ts
├── package.json
├── postcss.config.mjs
├── tailwind.config.ts
└── tsconfig.json
```

## Architecture

### Data Flow (Critical Path)
```
NOAA PFDS API → noaaAtlas14Client.ts → API Routes → SQLite → atlas14.ts → Components
      ↓                ↓                   ↓           ↓           ↓
  cgi_readH5.py   Parse JS response   /api/atlas14  atlas14.db  citiesCache
```

### NOAA Atlas 14 Integration

**API Endpoint (IMPORTANT - Updated November 2025)**
```
https://hdsc.nws.noaa.gov/cgi-bin/new/cgi_readH5.py
```

**NOT the old endpoint**: ~~`cgi_readH5_shapefilePF.py`~~ (returns 404)

**Response Format**: JavaScript variable assignments (not CSV)
```javascript
result = 'values';
quantiles = [['5.12', '5.94', ...], ['4.09', '4.75', ...], ...];
volume = '11';
version = '2';
region = 'Texas';
```

**Key Types** (`src/services/noaaAtlas14Client.ts`):
```typescript
type Atlas14Units = 'ENGLISH' | 'METRIC';
type Atlas14Basis = 'INTENSITY' | 'DEPTH';
type Atlas14Series = 'PDS' | 'AMS';

interface Atlas14Value {
  durationMinutes: number;
  returnPeriod: string;  // '2yr', '5yr', etc.
  intensity: number;     // in/hr
}
```

**Return Period Indices (PDS)**:
| Column | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
|--------|---|---|---|---|---|---|---|---|---|---|
| Period | 1yr | 2yr | 5yr | 10yr | 25yr | 50yr | 100yr | 200yr | 500yr | 1000yr |

**Duration Indices (Rows)**:
| Row | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 |
|-----|---|---|---|---|---|---|---|---|---|---|----|----|----|----|----|----|----|----|----|
| Min | 5 | 10 | 15 | 30 | 60 | 120 | 180 | 360 | 720 | 1440 | 2880 | 4320 | 5760 | 10080 | 14400 | 28800 | 43200 | 64800 | 86400 |

### Database Schema

```sql
CREATE TABLE cities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  state TEXT NOT NULL,
  latitude REAL,
  longitude REAL,
  source TEXT,                        -- "NOAA Atlas 14 Volume 11 Version 2"
  source_type TEXT DEFAULT 'CUSTOM',  -- 'CUSTOM' | 'ATLAS14'
  units TEXT DEFAULT 'ENGLISH',       -- 'ENGLISH' | 'METRIC'
  basis TEXT DEFAULT 'INTENSITY',     -- 'INTENSITY' | 'DEPTH'
  series_type TEXT DEFAULT 'PDS',     -- 'PDS' | 'AMS'
  source_metadata TEXT,               -- JSON blob
  notes TEXT,                         -- Designer notes for this location
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT,
  UNIQUE(name, state)
);

CREATE TABLE rainfall_data (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  city_id INTEGER NOT NULL,
  duration_minutes INTEGER NOT NULL,
  return_period TEXT NOT NULL,        -- '2yr', '5yr', '10yr', '25yr', '50yr', '100yr'
  intensity_in_per_hr REAL NOT NULL,
  FOREIGN KEY (city_id) REFERENCES cities(id) ON DELETE CASCADE,
  UNIQUE(city_id, duration_minutes, return_period)
);
```

### Core Engineering Calculations

The calculation pipeline:

1. **Hydrology Tab** → Select city, load Atlas 14 IDF data, choose storm events
2. **Drainage Tab** → Define existing/proposed areas with C-factors and Tc
3. **Pond Designer Tab** → Modified Rational Method calculates storage:
   - `rationalMethod.ts` → `ModifiedRationalMethod.calculateStorage()`
   - `idf.ts` → `getIntensityInPerHr()` (log-log interpolation)
4. **Outfall Designer Tab** → Hydraulic sizing:
   - `hydraulics.ts` → Orifice/weir equations with regime transition

### Key Files by Domain

| Domain | Files | Purpose |
|--------|-------|---------|
| NOAA API | `src/services/noaaAtlas14Client.ts` | Fetch from PFDS, parse JS response |
| Database | `src/utils/database.ts` | SQLite connection, schema, migrations |
| Rainfall | `src/utils/atlas14.ts`, `src/utils/idf.ts` | Fetch IDF data, interpolation |
| Hydrology | `src/app/components/Hydrology.tsx` | City selection, IDF chart, NOAA fetch UI |
| Drainage | `src/app/components/Drainage.tsx`, `src/utils/drainageCalculations.ts` | Q=CiA |
| Pond | `src/app/components/PondDesigner.tsx`, `src/utils/rationalMethod.ts` | Modified Rational |
| Stage-Storage | `src/utils/stageStorage.ts` | End-area method, CSV parsing |
| Outfall | `src/app/components/OutfallDesigner.tsx`, `src/utils/hydraulics.ts` | Orifice/weir flow |
| Settings | `src/app/settings/page.tsx` | Location management, engineering settings, notes |

## State Management

### Global State (page.tsx)
```typescript
// City selection
const [cityId, setCityId] = useState<number | null>(null);
const [selectedEvents, setSelectedEvents] = useState<ReturnPeriod[]>(['2yr', '10yr', '100yr']);

// Drainage results (passed to PondDesigner)
const [drainageTotals, setDrainageTotals] = useState<DrainageTotals | null>(null);

// Pond configuration
const [pondMode, setPondMode] = useState<'generic' | 'custom'>('generic');
const [pondDims, setPondDims] = useState({ length: 100, width: 50, depth: 6 });
const [stageStorageCurve, setStageStorageCurve] = useState<StageStorageCurve | null>(null);
const [pondInvertElevation, setPondInvertElevation] = useState<number>(100);

// Results
const [pondResults, setPondResults] = useState<PondResults | null>(null);
```

### localStorage Persistence Pattern
```typescript
const [data, setData] = useState<Type[]>(() => {
  if (typeof window === 'undefined') return DEFAULT;
  const stored = localStorage.getItem('key');
  return stored ? JSON.parse(stored) : DEFAULT;
});

useEffect(() => {
  localStorage.setItem('key', JSON.stringify(data));
}, [data]);
```

### Caching Pattern (atlas14.ts)
```typescript
const citiesCache: City[] | null = null;
const rainfallDataCache: Map<number, RainfallDataPoint[]> = new Map();

export function clearAtlas14Cache() {
  citiesCache = null;
  rainfallDataCache.clear();
}
```

## Engineering Constants

### Return Periods
```typescript
type ReturnPeriod = '2yr' | '5yr' | '10yr' | '25yr' | '50yr' | '100yr';
```

### Hydraulic Constants (hydraulicsConfig.ts)
```typescript
const ORIFICE_COEFFICIENT = 0.61;
const WEIR_COEFFICIENT = 3.33;  // for sharp-crested weir
const REGIME_TRANSITION_RATIO = 1.1;  // Head/Height for orifice→weir
```

### Stage-Storage Types
```typescript
interface StageStoragePoint {
  elevation: number;       // ft
  cumulativeVolume: number; // cf
  area: number;            // sf
  perimeter: number;       // ft
}

interface StageStorageCurve {
  name: string;
  invertElevation: number;
  points: StageStoragePoint[];
}
```

## Common Tasks

### Fetching NOAA Data Programmatically
```typescript
import { fetchAtlas14Point } from '@/services/noaaAtlas14Client';

const result = await fetchAtlas14Point(32.7767, -96.7970, {
  units: 'ENGLISH',
  basis: 'INTENSITY',
  seriesType: 'PDS',
});

if (result.success) {
  console.log(result.data.values);  // Array of { durationMinutes, returnPeriod, intensity }
}
```

### Adding a New Storm Event
1. Update `ReturnPeriod` type in `src/utils/atlas14.ts`
2. Add to `AVAILABLE_EVENTS` array in `Hydrology.tsx`
3. Add color mapping in `getEventColor()` functions

### Working with Stage-Storage Curves
```typescript
import { 
  getElevationAtVolume, 
  getVolumeAtElevation,
  validateStageStorageCurve,
  parseStageStorageCSV 
} from '@/utils/stageStorage';

// Parse CSV
const { points, errors } = parseStageStorageCSV(csvText);

// Validate
const validationErrors = validateStageStorageCurve(points);

// Volume → Elevation (binary search)
const wse = getElevationAtVolume(curve, volumeCf);

// Elevation → Volume (end-area method)
const vol = getVolumeAtElevation(curve, elevation);
```

### Modifying Hydraulic Equations
Edit `src/utils/hydraulics.ts`:
- `calculateOrificeFlow()` - Q = C × A × √(2gh)
- `calculateWeirFlow()` - Q = C × L × H^1.5
- `solveStructureSize()` - Iterative solver

### Running Database Seeding
```bash
# Seed 101 Texas cities from NOAA Atlas 14
npx tsx scripts/seedTexasCities.ts

# Verify database
npx tsx scripts/verifyDatabase.ts
```

## API Routes Reference

### Cities
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/atlas14/cities` | List all cities (includes notes) |
| POST | `/api/atlas14/cities` | Create city (manual) |
| GET | `/api/atlas14/cities/[cityId]` | Get city by ID (includes notes) |
| PUT | `/api/atlas14/cities/[cityId]` | Update city (name, state, notes, coordinates) |
| DELETE | `/api/atlas14/cities/[cityId]` | Delete city and rainfall data |
| POST | `/api/atlas14/cities/[cityId]/refresh` | Refresh from NOAA |
| DELETE | `/api/atlas14/cities/cleanup` | Delete orphaned data |
| POST | `/api/atlas14/cities/normalize-state` | Fix state abbreviations |

### Data
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/atlas14/data/[cityId]` | Get rainfall data for city |
| DELETE | `/api/atlas14/clear` | Delete all cities and data |

### NOAA Fetch
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/atlas14/fetch` | Fetch new city from NOAA API |

### Import
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/atlas14/import` | Import CSV directly |
| GET | `/api/atlas14/import/check` | Check for duplicates |
| POST | `/api/atlas14/import/preview` | Preview CSV import |
| POST | `/api/atlas14/import/save` | Save previewed data |

## Important Constraints

1. **SQLite is server-side only** - Never import `database.ts` in client components
2. **Calculations must be async** - IDF data comes from API routes
3. **Cache invalidation** - Call `clearAtlas14Cache()` after data changes
4. **Precision** - Hydraulic calcs use 4 decimals, display uses 2
5. **No tests** - Validate changes manually through UI

## Component Patterns

### Settings Page Features
The Settings page (`src/app/settings/page.tsx`) provides:

**Engineering Settings Section (Collapsible)**
- Orifice to Weir Transition Ratio - configures hydraulic regime detection
- Orifice Stacking Offset - default vertical gap for stacked orifices

**Saved Locations Section (Collapsible)**
- Table view of all cities with search, filter, and sort capabilities
- Search by city name, state, or notes
- Filter by state dropdown
- Sort by name, state, data points, or last updated
- Edit button opens modal for:
  - City name (editable)
  - State abbreviation (editable, auto-uppercase)
  - Latitude/Longitude (editable if available)
  - Designer Notes textarea
- Delete button with confirmation modal
- Notes column shows truncated notes with icon indicator

**Designer Notes Feature**
- Stored in `cities.notes` column (TEXT, nullable)
- Use cases: project references, data source documentation, special considerations
- Searchable in the locations filter
- Displayed in table with FileText icon

### Client Component with API Data
```typescript
'use client';
import { useEffect, useState } from 'react';

export default function MyComponent() {
  const [data, setData] = useState<Type | null>(null);
  
  useEffect(() => {
    fetch('/api/atlas14/...')
      .then(r => r.json())
      .then(setData);
  }, []);
  
  if (!data) return <div>Loading...</div>;
  return <div>{/* render data */}</div>;
}
```

### API Route Pattern
```typescript
import { getDatabase } from '@/utils/database';
import { NextResponse } from 'next/server';

export async function GET() {
  const db = getDatabase();
  const result = db.prepare('SELECT ...').all();
  return NextResponse.json(result);
}

export async function POST(request: Request) {
  const body = await request.json();
  const db = getDatabase();
  // ... insert/update
  return NextResponse.json({ success: true });
}
```

## File Naming Conventions

- Components: `PascalCase.tsx` (e.g., `PondDesigner.tsx`)
- Utils: `camelCase.ts` (e.g., `rationalMethod.ts`)
- API routes: `lowercase/route.ts`
- Types: Defined in same file, exported when shared

## Pre-Seeded Data

The database includes **101 Texas cities** from NOAA Atlas 14 Volume 11:
- 40 DFW Metroplex cities
- 10 Houston area cities
- 5 San Antonio area cities
- 8 Austin area cities
- 38 other major Texas cities

Each city has **114 data points** (19 durations × 6 return periods).

## Build & Development

```bash
npm run dev    # Development server at localhost:3000
npm run build  # Production build
npm run lint   # ESLint check
npm run start  # Production server
```
