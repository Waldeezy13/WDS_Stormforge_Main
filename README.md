# WDS Stormforge

**Professional Civil Engineering Stormwater Pond Design Tool**

WDS Stormforge is a web-based application for designing detention ponds using the Modified Rational Method with NOAA Atlas 14 rainfall data. Built with Next.js 16, React 19, TypeScript, and Tailwind CSS.

## Features

- **Hydrology Tab** - Select location, load NOAA Atlas 14 IDF curves, choose design storm events
  - Direct NOAA Atlas 14 fetch by coordinates
  - Pre-seeded database with 100+ Texas cities
  - Interactive IDF curve visualization
- **Drainage Tab** - Define existing/proposed drainage areas with runoff coefficients and time of concentration
- **Pond Designer Tab** - Calculate required storage volumes using Modified Rational Method
  - **Generic Mode** - Simple rectangular prism geometry (L × W × D)
  - **Custom Mode** - Import stage-storage tables from CAD with end-area method interpolation
  - **3D Visualization** - Interactive pond visualization with water level indicators
  - **Stage-Storage Chart** - SVG chart showing volume vs elevation curve
- **Outfall Designer Tab** - Design orifice plates with hydraulic calculations
- **Reports Tab** - Generate engineering reports
- **Settings Page** - Manage application configuration and data
  - **Engineering Settings** - Configure hydraulic calculation parameters (collapsible)
  - **Saved Locations** - View, edit, and delete cities/rainfall data (collapsible)
  - **Designer Notes** - Add custom notes to each rainfall location for project documentation

## Getting Started

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Open http://localhost:3000
```

## Pre-Seeded Database

The database comes pre-populated with **101 Texas cities** from NOAA Atlas 14 Volume 11:

### DFW Metroplex (40 cities)
Dallas, Fort Worth, Arlington, Plano, Irving, Garland, Frisco, McKinney, Grand Prairie, Denton, Mesquite, Carrollton, Richardson, Lewisville, Allen, Flower Mound, North Richland Hills, Euless, Bedford, Grapevine, Coppell, Hurst, Cedar Hill, Rowlett, Wylie, DeSoto, Burleson, Mansfield, The Colony, Southlake, Keller, Rockwall, Waxahachie, Weatherford, Cleburne, Forney, Midlothian, Little Elm, Prosper, Celina

### Houston Area (10 cities)
Houston, Pasadena, Pearland, Sugar Land, League City, The Woodlands, Conroe, Baytown, Missouri City, Katy

### San Antonio Area (5 cities)
San Antonio, New Braunfels, San Marcos, Schertz, Seguin

### Austin Area (8 cities)
Austin, Round Rock, Cedar Park, Georgetown, Pflugerville, Kyle, Leander, Hutto

### Other Major Texas Cities (38 cities)
El Paso, Corpus Christi, Lubbock, Laredo, Amarillo, Brownsville, McAllen, Killeen, Waco, Abilene, Odessa, Midland, Beaumont, Tyler, Longview, Wichita Falls, College Station, Temple, Victoria, Port Arthur, Galveston, Harlingen, Edinburg, Mission, Bryan, Pharr, San Angelo, Texarkana, Sherman, Lufkin, Nacogdoches, Huntsville, Palestine, Paris, Greenville, Terrell, Corsicana, Ennis

## Application Workflow

### 1. Hydrology
Select a city to load NOAA Atlas 14 IDF data. Choose which storm events to analyze (2yr, 5yr, 10yr, 25yr, 50yr, 100yr). The IDF curve chart shows rainfall intensity vs duration.

**Fetch New Location from NOAA:**
1. Enter latitude and longitude coordinates
2. Enter city name and state
3. Click "Fetch from NOAA" to retrieve data directly from Atlas 14

### 2. Drainage
Define drainage areas for existing and proposed conditions:
- **Area** (acres)
- **Runoff Coefficient (C)** - 0.3 for pervious, 0.9 for impervious
- **Time of Concentration (Tc)** - minutes

### 3. Pond Designer
Calculates required storage volume using the Modified Rational Method:

**Generic Mode (Default)**
- Enter pond dimensions: Length, Width, Depth
- Volume calculated as simple prism: V = L × W × D
- Water depth = Volume / Surface Area

**Custom Mode (Stage-Storage Table)**
1. Click "Custom" mode toggle
2. Enter pond name
3. Paste CSV data or manually enter stage-storage points:
   ```csv
   elevation_ft,volume_cf,area_sf,perimeter_ft
   100.0,0,0,0
   101.0,5000,5000,300
   102.0,15000,10000,420
   103.0,30000,15000,520
   ```
4. Water surface elevations calculated using end-area method:
   - V = (h/3) × (A₁ + A₂ + √(A₁×A₂))

**Stage-Storage CSV Format**
| Column | Description | Units |
|--------|-------------|-------|
| elevation_ft | Water surface elevation | feet |
| volume_cf | Cumulative storage volume | cubic feet |
| area_sf | Water surface area | square feet |
| perimeter_ft | Wetted perimeter | feet |

### 4. Outfall Designer
Design orifice plates to control discharge:
- Define circular or rectangular openings
- Set invert elevations and horizontal offsets
- Automatic orifice/weir flow regime detection
- Size solver to match allowable release rate

### 5. Settings
Access via the gear icon in the header. The Settings page provides:

**Engineering Settings (Collapsible)**
- Orifice to Weir Transition Ratio - Controls when flow transitions from orifice to weir
- Orifice Stacking Offset - Default vertical gap for stacked orifices

**Saved Locations (Collapsible)**
- View all saved cities with rainfall data
- Search by city name, state, or notes
- Filter by state
- Sort by name, state, data points, or last updated
- **Edit** - Modify city name, state, coordinates, and designer notes
- **Delete** - Remove cities and associated rainfall data
- **Designer Notes** - Add project-specific notes, data sources, or design considerations to each location

**Location Notes Use Cases:**
- Document which project uses this rainfall data
- Note special considerations or data source details
- Track municipal vs NOAA data sources
- Add review/approval notes

## Project Structure

```
Waldo_PondDesigner1/
├── .github/
│   └── copilot-instructions.md    # AI agent instructions
├── data/
│   └── atlas14.db                 # SQLite database (cities + rainfall data)
├── scripts/
│   ├── seedTexasCities.ts         # Seed 101 Texas cities from NOAA
│   └── verifyDatabase.ts          # Database verification script
├── src/
│   ├── app/
│   │   ├── globals.css            # Tailwind + custom CSS variables
│   │   ├── layout.tsx             # Root layout
│   │   ├── page.tsx               # Main app with global state
│   │   ├── api/
│   │   │   └── atlas14/
│   │   │       ├── cities/
│   │   │       │   ├── route.ts           # GET/POST cities
│   │   │       │   ├── [cityId]/
│   │   │       │   │   ├── route.ts       # GET/DELETE city
│   │   │       │   │   └── refresh/
│   │   │       │   │       └── route.ts   # POST refresh from NOAA
│   │   │       │   ├── cleanup/
│   │   │       │   │   └── route.ts       # DELETE orphaned data
│   │   │       │   └── normalize-state/
│   │   │       │       └── route.ts       # POST fix state names
│   │   │       ├── clear/
│   │   │       │   └── route.ts           # DELETE all data
│   │   │       ├── data/
│   │   │       │   └── [cityId]/
│   │   │       │       └── route.ts       # GET rainfall data
│   │   │       ├── fetch/
│   │   │       │   └── route.ts           # POST fetch from NOAA API
│   │   │       └── import/
│   │   │           ├── route.ts           # POST import CSV
│   │   │           ├── check/
│   │   │           │   └── route.ts       # GET check duplicates
│   │   │           ├── preview/
│   │   │           │   └── route.ts       # POST preview import
│   │   │           └── save/
│   │   │               └── route.ts       # POST save imported data
│   │   ├── components/
│   │   │   ├── Atlas14Import.tsx          # CSV import UI
│   │   │   ├── Atlas14ImportPreview.tsx   # Import preview modal
│   │   │   ├── CityStateBar.tsx           # City selection bar
│   │   │   ├── Drainage.tsx               # Drainage area inputs
│   │   │   ├── Header.tsx                 # App header
│   │   │   ├── Hydrology.tsx              # IDF curves, city selection, NOAA fetch
│   │   │   ├── OutfallDesigner.tsx        # Orifice plate design
│   │   │   ├── PondDesigner.tsx           # Pond sizing, 3D view
│   │   │   ├── Reports.tsx                # Report generation
│   │   │   └── SettingsMenu.tsx           # Settings dropdown
│   │   └── settings/
│   │       └── page.tsx                   # Settings page
│   ├── services/
│   │   └── noaaAtlas14Client.ts           # NOAA PFDS API client
│   └── utils/
│       ├── atlas14.ts                     # City/rainfall data fetching
│       ├── database.ts                    # SQLite connection & schema
│       ├── drainageCalculations.ts        # Q=CiA calculations
│       ├── hydraulics.ts                  # Orifice/weir flow
│       ├── hydraulicsConfig.ts            # Hydraulic constants
│       ├── idf.ts                         # IDF interpolation
│       ├── rationalMethod.ts              # Modified Rational Method
│       └── stageStorage.ts                # Stage-storage utilities
├── eslint.config.mjs
├── next.config.ts
├── package.json
├── postcss.config.mjs
├── tailwind.config.ts
└── tsconfig.json
```

## NOAA Atlas 14 Integration

### API Endpoint
The application fetches rainfall data directly from NOAA's Precipitation Frequency Data Server (PFDS):
- **Endpoint**: `https://hdsc.nws.noaa.gov/cgi-bin/new/cgi_readH5.py`
- **Parameters**: `lat`, `lon`, `type=pf`, `data=intensity`, `units=english`, `series=pds`

### Data Coverage
- **Durations**: 5min, 10min, 15min, 30min, 60min, 2hr, 3hr, 6hr, 12hr, 24hr, 2-day to 60-day
- **Return Periods**: 1yr, 2yr, 5yr, 10yr, 25yr, 50yr, 100yr, 200yr, 500yr, 1000yr
- **Supported Return Periods in App**: 2yr, 5yr, 10yr, 25yr, 50yr, 100yr

### Database Schema
```sql
-- Cities table
CREATE TABLE cities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  state TEXT NOT NULL,
  latitude REAL,
  longitude REAL,
  source TEXT,                    -- "NOAA Atlas 14 Volume 11 Version 2"
  source_type TEXT DEFAULT 'CUSTOM',  -- 'CUSTOM' | 'ATLAS14'
  units TEXT DEFAULT 'ENGLISH',
  basis TEXT DEFAULT 'INTENSITY',
  series_type TEXT DEFAULT 'PDS',
  source_metadata TEXT,           -- JSON with fetch details
  notes TEXT,                     -- Designer notes for this location
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT,
  UNIQUE(name, state)
);

-- Rainfall data table
CREATE TABLE rainfall_data (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  city_id INTEGER NOT NULL,
  duration_minutes INTEGER NOT NULL,
  return_period TEXT NOT NULL,    -- '2yr', '5yr', etc.
  intensity_in_per_hr REAL NOT NULL,
  FOREIGN KEY (city_id) REFERENCES cities(id) ON DELETE CASCADE,
  UNIQUE(city_id, duration_minutes, return_period)
);
```

## Key Technologies

- **Next.js 16** - App Router, API routes
- **React 19** - Components with hooks
- **TypeScript** - Type safety
- **Tailwind CSS** - Dark theme styling
- **SQLite (better-sqlite3)** - Local database for rainfall data
- **React Three Fiber** - 3D pond visualization
- **PapaParse** - CSV parsing
- **Lucide React** - Icons

## Engineering Methods

### Modified Rational Method
Iterates through storm durations to find critical storage:
1. Calculate allowable release rate from pre-development peak flow
2. For each duration from Tc to 24 hours:
   - Get intensity from IDF curve
   - Calculate peak inflow: Q = C × i × A
   - Calculate storage: V = (Qpost - Qallowable) × duration
3. Critical duration = duration with maximum storage

### End-Area (Prismoidal) Method
For stage-storage interpolation:
- V = (h/3) × (A₁ + A₂ + √(A₁×A₂))
- More accurate than average-end-area for irregular pond shapes
- Binary search for inverse interpolation (volume → elevation)

### Hydraulic Calculations
- **Orifice Flow**: Q = C × A × √(2gh)
- **Weir Flow**: Q = C × L × H^1.5
- Automatic regime transition based on head/height ratio

## API Routes Reference

### Cities
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/atlas14/cities` | List all cities with notes |
| POST | `/api/atlas14/cities` | Create city (manual) |
| GET | `/api/atlas14/cities/[cityId]` | Get city by ID with notes |
| PUT | `/api/atlas14/cities/[cityId]` | Update city (name, state, notes, coordinates) |
| DELETE | `/api/atlas14/cities/[cityId]` | Delete city and rainfall data |
| POST | `/api/atlas14/cities/[cityId]/refresh` | Refresh from NOAA |

## Scripts

### Seed Texas Cities
```bash
npx tsx scripts/seedTexasCities.ts
```
Fetches NOAA Atlas 14 data for 101 Texas cities and populates the database.

### Verify Database
```bash
npx tsx scripts/verifyDatabase.ts
```
Displays database statistics and sample data.

## Data Persistence

- **SQLite Database** - Cities and rainfall data (server-side only)
- **localStorage** - User inputs (drainage areas, pond geometry, outfall structures)

## Build & Deploy

```bash
npm run build   # Production build
npm run start   # Production server
npm run lint    # ESLint check
```

## Environment Variables (Optional)

```env
NOAA_PFDS_URL=https://hdsc.nws.noaa.gov/cgi-bin/new/cgi_readH5.py
```

## License

Proprietary - WDS Engineering
