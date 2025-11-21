import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dbPath = path.join(process.cwd(), 'data', 'atlas14.db');

// Ensure data directory exists
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

let db: Database.Database | null = null;

export function getDatabase(): Database.Database {
  if (db) {
    return db;
  }

  db = new Database(dbPath);
  
  // Enable foreign keys
  db.pragma('foreign_keys = ON');
  
  // Create tables if they don't exist
  initializeDatabase(db);
  
  return db;
}

function initializeDatabase(database: Database.Database) {
  // Cities table
  database.exec(`
    CREATE TABLE IF NOT EXISTS cities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      state TEXT NOT NULL,
      latitude REAL,
      longitude REAL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT,
      UNIQUE(name, state)
    )
  `);

  // Add updated_at column if it doesn't exist (migration for existing databases)
  try {
    database.exec(`ALTER TABLE cities ADD COLUMN updated_at TEXT`);
  } catch (error) {
    // Column already exists, ignore error
  }

  // Rainfall data table
  database.exec(`
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

  // Create indexes for performance
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_rainfall_city_id ON rainfall_data(city_id);
    CREATE INDEX IF NOT EXISTS idx_rainfall_duration ON rainfall_data(duration_minutes);
    CREATE INDEX IF NOT EXISTS idx_cities_state ON cities(state);
  `);
}

export interface City {
  id: number;
  name: string;
  state: string;
  latitude?: number;
  longitude?: number;
  lastUpdated?: string;
}

export interface RainfallDataRow {
  id: number;
  city_id: number;
  duration_minutes: number;
  return_period: string;
  intensity_in_per_hr: number;
}

// Seed initial DFW cities (NO rainfall data - that must be imported via CSV)
export function seedInitialData() {
  const database = getDatabase();
  
  // Check if data already exists
  const cityCount = database.prepare('SELECT COUNT(*) as count FROM cities').get() as { count: number };
  if (cityCount.count > 0) {
    return; // Already seeded
  }

  // DFW cities list (NO rainfall data - users must import via CSV)
  const dfwCities = [
    'Dallas', 'Fort Worth', 'Arlington', 'Plano', 'Irving', 'Garland', 
    'Frisco', 'McKinney', 'Carrollton', 'Grand Prairie', 'Mesquite', 
    'Denton', 'Lewisville', 'Allen', 'Richardson', 'Flower Mound', 
    'Euless', 'Bedford', 'Grapevine', 'Coppell'
  ];

  const insertCity = database.prepare('INSERT OR IGNORE INTO cities (name, state) VALUES (?, ?)');

  const transaction = database.transaction(() => {
    for (const cityName of dfwCities) {
      insertCity.run(cityName, 'TX');
    }
  });

  transaction();
}

// Initialize and seed on module load (server-side only)
if (typeof window === 'undefined') {
  seedInitialData();
}
