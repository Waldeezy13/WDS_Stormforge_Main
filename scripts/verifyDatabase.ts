/**
 * Quick test to verify database seeding
 */

import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'data', 'atlas14.db');
const db = new Database(dbPath);

// Count cities
const cityCount = db.prepare('SELECT COUNT(*) as cnt FROM cities').get() as { cnt: number };
console.log(`Total cities: ${cityCount.cnt}`);

// Count rainfall records
const rainfallCount = db.prepare('SELECT COUNT(*) as cnt FROM rainfall_data').get() as { cnt: number };
console.log(`Total rainfall records: ${rainfallCount.cnt}`);

// Sample cities
console.log('\nSample cities:');
const cities = db.prepare(`
  SELECT id, name, state, source_type, latitude, longitude 
  FROM cities 
  ORDER BY name 
  LIMIT 10
`).all() as Array<{ id: number; name: string; state: string; source_type: string; latitude: number; longitude: number }>;

for (const city of cities) {
  console.log(`  ${city.id}: ${city.name}, ${city.state} (${city.source_type}) - ${city.latitude}, ${city.longitude}`);
}

// Sample rainfall data for Dallas
console.log('\nDallas rainfall data (sample):');
const dallasData = db.prepare(`
  SELECT rd.duration_minutes, rd.return_period, rd.intensity_in_per_hr
  FROM rainfall_data rd
  JOIN cities c ON rd.city_id = c.id
  WHERE c.name = 'Dallas'
  ORDER BY rd.duration_minutes, rd.return_period
  LIMIT 12
`).all() as Array<{ duration_minutes: number; return_period: string; intensity_in_per_hr: number }>;

for (const row of dallasData) {
  console.log(`  ${row.duration_minutes} min, ${row.return_period}: ${row.intensity_in_per_hr} in/hr`);
}

db.close();
