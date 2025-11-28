/**
 * Seed Script: Fetch NOAA Atlas 14 data for Texas cities
 * 
 * This script populates the database with rainfall intensity data
 * from NOAA Atlas 14 for approximately 100 Texas cities.
 * 
 * Run with: npx tsx scripts/seedTexasCities.ts
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Texas cities with coordinates (focusing on DFW area first, then major cities statewide)
const TEXAS_CITIES: Array<{ name: string; lat: number; lon: number }> = [
  // DFW Metroplex - Core Cities
  { name: 'Dallas', lat: 32.7767, lon: -96.7970 },
  { name: 'Fort Worth', lat: 32.7555, lon: -97.3308 },
  { name: 'Arlington', lat: 32.7357, lon: -97.1081 },
  { name: 'Plano', lat: 33.0198, lon: -96.6989 },
  { name: 'Irving', lat: 32.8140, lon: -96.9489 },
  { name: 'Garland', lat: 32.9126, lon: -96.6389 },
  { name: 'Frisco', lat: 33.1507, lon: -96.8236 },
  { name: 'McKinney', lat: 33.1972, lon: -96.6397 },
  { name: 'Grand Prairie', lat: 32.7460, lon: -96.9978 },
  { name: 'Denton', lat: 33.2148, lon: -97.1331 },
  
  // DFW Metroplex - Additional Cities
  { name: 'Mesquite', lat: 32.7668, lon: -96.5992 },
  { name: 'Carrollton', lat: 32.9537, lon: -96.8903 },
  { name: 'Richardson', lat: 32.9483, lon: -96.7299 },
  { name: 'Lewisville', lat: 33.0462, lon: -96.9942 },
  { name: 'Allen', lat: 33.1032, lon: -96.6706 },
  { name: 'Flower Mound', lat: 33.0146, lon: -97.0970 },
  { name: 'North Richland Hills', lat: 32.8343, lon: -97.2289 },
  { name: 'Euless', lat: 32.8371, lon: -97.0820 },
  { name: 'Bedford', lat: 32.8440, lon: -97.1431 },
  { name: 'Grapevine', lat: 32.9343, lon: -97.0781 },
  
  // DFW Metroplex - More Cities
  { name: 'Coppell', lat: 32.9546, lon: -97.0150 },
  { name: 'Hurst', lat: 32.8234, lon: -97.1706 },
  { name: 'Cedar Hill', lat: 32.5885, lon: -96.9561 },
  { name: 'Rowlett', lat: 32.9029, lon: -96.5639 },
  { name: 'Wylie', lat: 33.0151, lon: -96.5389 },
  { name: 'DeSoto', lat: 32.5899, lon: -96.8570 },
  { name: 'Burleson', lat: 32.5421, lon: -97.3208 },
  { name: 'Mansfield', lat: 32.5632, lon: -97.1417 },
  { name: 'The Colony', lat: 33.0807, lon: -96.8861 },
  { name: 'Southlake', lat: 32.9412, lon: -97.1342 },
  
  // DFW Metroplex - Outer Ring
  { name: 'Keller', lat: 32.9347, lon: -97.2517 },
  { name: 'Rockwall', lat: 32.9312, lon: -96.4597 },
  { name: 'Waxahachie', lat: 32.3865, lon: -96.8483 },
  { name: 'Weatherford', lat: 32.7593, lon: -97.7972 },
  { name: 'Cleburne', lat: 32.3476, lon: -97.3867 },
  { name: 'Forney', lat: 32.7479, lon: -96.4719 },
  { name: 'Midlothian', lat: 32.4824, lon: -96.9944 },
  { name: 'Little Elm', lat: 33.1626, lon: -96.9375 },
  { name: 'Prosper', lat: 33.2362, lon: -96.8011 },
  { name: 'Celina', lat: 33.3246, lon: -96.7844 },
  
  // Houston Metro
  { name: 'Houston', lat: 29.7604, lon: -95.3698 },
  { name: 'Pasadena', lat: 29.6911, lon: -95.2091 },
  { name: 'Pearland', lat: 29.5636, lon: -95.2860 },
  { name: 'Sugar Land', lat: 29.6197, lon: -95.6349 },
  { name: 'League City', lat: 29.5075, lon: -95.0950 },
  { name: 'The Woodlands', lat: 30.1658, lon: -95.4613 },
  { name: 'Conroe', lat: 30.3119, lon: -95.4561 },
  { name: 'Baytown', lat: 29.7355, lon: -94.9774 },
  { name: 'Missouri City', lat: 29.6186, lon: -95.5377 },
  { name: 'Katy', lat: 29.7858, lon: -95.8245 },
  
  // San Antonio Metro
  { name: 'San Antonio', lat: 29.4241, lon: -98.4936 },
  { name: 'New Braunfels', lat: 29.7030, lon: -98.1245 },
  { name: 'San Marcos', lat: 29.8833, lon: -97.9414 },
  { name: 'Schertz', lat: 29.5522, lon: -98.2697 },
  { name: 'Seguin', lat: 29.5688, lon: -97.9647 },
  
  // Austin Metro
  { name: 'Austin', lat: 30.2672, lon: -97.7431 },
  { name: 'Round Rock', lat: 30.5083, lon: -97.6789 },
  { name: 'Cedar Park', lat: 30.5052, lon: -97.8203 },
  { name: 'Georgetown', lat: 30.6333, lon: -97.6781 },
  { name: 'Pflugerville', lat: 30.4394, lon: -97.6200 },
  { name: 'Kyle', lat: 29.9894, lon: -97.8772 },
  { name: 'Leander', lat: 30.5788, lon: -97.8531 },
  { name: 'Hutto', lat: 30.5427, lon: -97.5467 },
  
  // Other Major Texas Cities
  { name: 'El Paso', lat: 31.7619, lon: -106.4850 },
  { name: 'Corpus Christi', lat: 27.8006, lon: -97.3964 },
  { name: 'Lubbock', lat: 33.5779, lon: -101.8552 },
  { name: 'Laredo', lat: 27.5036, lon: -99.5075 },
  { name: 'Amarillo', lat: 35.2220, lon: -101.8313 },
  { name: 'Brownsville', lat: 25.9017, lon: -97.4975 },
  { name: 'McAllen', lat: 26.2034, lon: -98.2300 },
  { name: 'Killeen', lat: 31.1171, lon: -97.7278 },
  { name: 'Waco', lat: 31.5493, lon: -97.1467 },
  { name: 'Abilene', lat: 32.4487, lon: -99.7331 },
  
  // More Texas Cities
  { name: 'Odessa', lat: 31.8457, lon: -102.3676 },
  { name: 'Midland', lat: 31.9973, lon: -102.0779 },
  { name: 'Beaumont', lat: 30.0802, lon: -94.1266 },
  { name: 'Tyler', lat: 32.3513, lon: -95.3011 },
  { name: 'Longview', lat: 32.5007, lon: -94.7405 },
  { name: 'Wichita Falls', lat: 33.9137, lon: -98.4934 },
  { name: 'College Station', lat: 30.6280, lon: -96.3344 },
  { name: 'Temple', lat: 31.0982, lon: -97.3428 },
  { name: 'Victoria', lat: 28.8053, lon: -97.0036 },
  { name: 'Port Arthur', lat: 29.8850, lon: -93.9400 },
  
  // Additional Cities for 100 total
  { name: 'Galveston', lat: 29.3013, lon: -94.7977 },
  { name: 'Harlingen', lat: 26.1906, lon: -97.6961 },
  { name: 'Edinburg', lat: 26.3017, lon: -98.1633 },
  { name: 'Mission', lat: 26.2159, lon: -98.3253 },
  { name: 'Bryan', lat: 30.6744, lon: -96.3700 },
  { name: 'Pharr', lat: 26.1948, lon: -98.1836 },
  { name: 'San Angelo', lat: 31.4638, lon: -100.4370 },
  { name: 'Texarkana', lat: 33.4418, lon: -94.0477 },
  { name: 'Sherman', lat: 33.6357, lon: -96.6089 },
  { name: 'Lufkin', lat: 31.3382, lon: -94.7291 },
  
  // Final batch to reach ~100
  { name: 'Nacogdoches', lat: 31.6035, lon: -94.6555 },
  { name: 'Huntsville', lat: 30.7235, lon: -95.5508 },
  { name: 'Palestine', lat: 31.7621, lon: -95.6308 },
  { name: 'Paris', lat: 33.6609, lon: -95.5555 },
  { name: 'Greenville', lat: 33.1384, lon: -96.1108 },
  { name: 'Terrell', lat: 32.7360, lon: -96.2753 },
  { name: 'Corsicana', lat: 32.0954, lon: -96.4689 },
  { name: 'Ennis', lat: 32.3293, lon: -96.6253 },
];

// NOAA PFDS base URL - Note: path is /cgi-bin/new/ (not /cgi-bin/hdsc/new/)
const NOAA_PFDS_BASE_URL = 'https://hdsc.nws.noaa.gov/cgi-bin/new/cgi_readH5.py';

// Standard return periods we support
const SUPPORTED_RETURN_PERIODS = ['2yr', '5yr', '10yr', '25yr', '50yr', '100yr'];

// PDS return period indices (0-indexed) in NOAA response quantiles array
// Columns are: 1yr, 2yr, 5yr, 10yr, 25yr, 50yr, 100yr, 200yr, 500yr, 1000yr
const PDS_RETURN_PERIOD_INDICES: Record<string, number> = {
  '2yr': 1,
  '5yr': 2,
  '10yr': 3,
  '25yr': 4,
  '50yr': 5,
  '100yr': 6,
};

// Duration indices (0-indexed) in NOAA response quantiles array
// Rows are: 5min, 10min, 15min, 30min, 60min, 2hr, 3hr, 6hr, 12hr, 24hr, 2day, 3day, 4day, 7day, 10day, 20day, 30day, 45day, 60day
const DURATION_MINUTES: number[] = [
  5, 10, 15, 30, 60,           // sub-hourly
  120, 180, 360, 720, 1440,    // hourly to daily
  2880, 4320, 5760,            // 2-4 days
  10080, 14400, 28800,         // 7-20 days
  43200, 64800, 86400          // 30-60 days
];

/**
 * Extracts a JavaScript variable value from NOAA response text
 */
function extractJsVariable(text: string, varName: string): string | null {
  const patterns = [
    new RegExp(`${varName}\\s*=\\s*'([^']*)'`, 's'),
    new RegExp(`${varName}\\s*=\\s*"([^"]*)"`, 's'),
    new RegExp(`${varName}\\s*=\\s*(\\[\\[.*?\\]\\])\\s*;`, 's'),
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1];
  }
  return null;
}

/**
 * Parses a JavaScript 2D array string like "[['1', '2'], ['3', '4']]"
 */
function parseJs2DArray(arrayStr: string): string[][] | null {
  try {
    const cleaned = arrayStr.replace(/'/g, '"').trim();
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed) && parsed.every((row: unknown) => Array.isArray(row))) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

interface RainfallValue {
  durationMinutes: number;
  returnPeriod: string;
  intensity: number;
}

async function fetchNoaaData(lat: number, lon: number): Promise<{ values: RainfallValue[]; volume: string } | null> {
  const url = `${NOAA_PFDS_BASE_URL}?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}&type=pf&data=intensity&units=english&series=pds`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'StormForge/1.0 (Stormwater Design Tool)',
        'Accept': 'text/plain, */*',
      },
      signal: AbortSignal.timeout(30000),
    });
    
    if (!response.ok) {
      console.error(`  HTTP ${response.status} for ${lat}, ${lon}`);
      return null;
    }
    
    const responseText = await response.text();
    
    if (!responseText || responseText.trim().length === 0) {
      console.error(`  Empty response`);
      return null;
    }
    
    // Check for error/none result
    const resultValue = extractJsVariable(responseText, 'result');
    if (resultValue === 'none' || resultValue === 'null') {
      console.error(`  No data available`);
      return null;
    }
    
    // Extract quantiles array
    const quantilesStr = extractJsVariable(responseText, 'quantiles');
    if (!quantilesStr) {
      console.error(`  Missing quantiles data`);
      return null;
    }
    
    const quantiles = parseJs2DArray(quantilesStr);
    if (!quantiles || quantiles.length === 0) {
      console.error(`  Invalid quantiles format`);
      return null;
    }
    
    // Extract metadata
    const volumeNum = extractJsVariable(responseText, 'volume') || '';
    const versionNum = extractJsVariable(responseText, 'version') || '';
    const volume = `NOAA Atlas 14 Volume ${volumeNum}${versionNum ? ` Version ${versionNum}` : ''}`;
    
    // Parse values from quantiles array
    const values: RainfallValue[] = [];
    
    // Iterate through durations (rows)
    for (let durationIdx = 0; durationIdx < Math.min(quantiles.length, DURATION_MINUTES.length); durationIdx++) {
      const durationMinutes = DURATION_MINUTES[durationIdx];
      const row = quantiles[durationIdx];
      
      if (!row || !Array.isArray(row)) continue;
      
      // Only extract supported return periods
      for (const returnPeriod of SUPPORTED_RETURN_PERIODS) {
        const colIndex = PDS_RETURN_PERIOD_INDICES[returnPeriod];
        
        if (colIndex === undefined || colIndex >= row.length) continue;
        
        const valueStr = String(row[colIndex]).trim();
        const intensity = parseFloat(valueStr);
        
        if (!isNaN(intensity) && intensity >= 0) {
          values.push({ durationMinutes, returnPeriod, intensity });
        }
      }
    }
    
    return values.length > 0 ? { values, volume } : null;
    
  } catch (error) {
    console.error(`  Fetch error: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('Texas Cities NOAA Atlas 14 Seeder');
  console.log('='.repeat(60));
  console.log(`\nTotal cities to process: ${TEXAS_CITIES.length}\n`);
  
  // Setup database
  const dbPath = path.join(process.cwd(), 'data', 'atlas14.db');
  const dataDir = path.dirname(dbPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');
  
  // Ensure tables exist with all columns
  db.exec(`
    CREATE TABLE IF NOT EXISTS cities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      state TEXT NOT NULL,
      latitude REAL,
      longitude REAL,
      source TEXT,
      source_type TEXT DEFAULT 'CUSTOM',
      units TEXT DEFAULT 'ENGLISH',
      basis TEXT DEFAULT 'INTENSITY',
      series_type TEXT DEFAULT 'PDS',
      source_metadata TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT,
      UNIQUE(name, state)
    )
  `);
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS rainfall_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      city_id INTEGER NOT NULL,
      duration_minutes INTEGER NOT NULL,
      return_period TEXT NOT NULL,
      intensity_in_per_hr REAL NOT NULL,
      FOREIGN KEY (city_id) REFERENCES cities(id) ON DELETE CASCADE,
      UNIQUE(city_id, duration_minutes, return_period)
    )
  `);
  
  // Add missing columns if they don't exist
  const addColumnIfNotExists = (column: string, definition: string) => {
    try {
      db.exec(`ALTER TABLE cities ADD COLUMN ${column} ${definition}`);
    } catch {
      // Column already exists - ignore error
    }
  };
  
  addColumnIfNotExists('source_type', "TEXT DEFAULT 'CUSTOM'");
  addColumnIfNotExists('units', "TEXT DEFAULT 'ENGLISH'");
  addColumnIfNotExists('basis', "TEXT DEFAULT 'INTENSITY'");
  addColumnIfNotExists('series_type', "TEXT DEFAULT 'PDS'");
  addColumnIfNotExists('source_metadata', 'TEXT');
  
  // Prepare statements
  const upsertCity = db.prepare(`
    INSERT INTO cities (name, state, latitude, longitude, source, source_type, units, basis, series_type, source_metadata, updated_at)
    VALUES (?, 'TX', ?, ?, ?, 'ATLAS14', 'ENGLISH', 'INTENSITY', 'PDS', ?, datetime('now'))
    ON CONFLICT(name, state) DO UPDATE SET
      latitude = excluded.latitude,
      longitude = excluded.longitude,
      source = excluded.source,
      source_type = excluded.source_type,
      units = excluded.units,
      basis = excluded.basis,
      series_type = excluded.series_type,
      source_metadata = excluded.source_metadata,
      updated_at = datetime('now')
  `);
  
  const getCityId = db.prepare('SELECT id FROM cities WHERE name = ? AND state = ?');
  const deleteRainfallData = db.prepare('DELETE FROM rainfall_data WHERE city_id = ?');
  const insertRainfall = db.prepare(`
    INSERT INTO rainfall_data (city_id, duration_minutes, return_period, intensity_in_per_hr)
    VALUES (?, ?, ?, ?)
  `);
  
  let successCount = 0;
  let failCount = 0;
  
  for (let i = 0; i < TEXAS_CITIES.length; i++) {
    const city = TEXAS_CITIES[i];
    const progress = `[${i + 1}/${TEXAS_CITIES.length}]`;
    
    process.stdout.write(`${progress} ${city.name}, TX (${city.lat}, ${city.lon})... `);
    
    const result = await fetchNoaaData(city.lat, city.lon);
    
    if (!result) {
      console.log('FAILED');
      failCount++;
      continue;
    }
    
    // Store in database
    const sourceMetadata = JSON.stringify({
      volume: result.volume,
      fetchedAt: new Date().toISOString(),
      coordinates: { lat: city.lat, lon: city.lon },
    });
    
    const transaction = db.transaction(() => {
      upsertCity.run(city.name, city.lat, city.lon, result.volume, sourceMetadata);
      
      const cityRow = getCityId.get(city.name, 'TX') as { id: number };
      const cityId = cityRow.id;
      
      deleteRainfallData.run(cityId);
      
      for (const value of result.values) {
        insertRainfall.run(cityId, value.durationMinutes, value.returnPeriod, value.intensity);
      }
      
      return cityId;
    });
    
    transaction();
    
    console.log(`OK (${result.values.length} data points)`);
    successCount++;
    
    // Small delay to be nice to NOAA servers
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  db.close();
  
  console.log('\n' + '='.repeat(60));
  console.log('Seeding Complete!');
  console.log('='.repeat(60));
  console.log(`  Success: ${successCount} cities`);
  console.log(`  Failed:  ${failCount} cities`);
  console.log(`  Total:   ${TEXAS_CITIES.length} cities`);
  console.log('='.repeat(60));
}

main().catch(console.error);
