import { NextResponse } from 'next/server';
import { getDatabase } from '@/utils/database';

interface RainfallDataToSave {
  city: string;
  state: string;
  durationMinutes: number;
  returnPeriod: string;
  intensity: number;
  source?: string;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const dataToSave: RainfallDataToSave[] = body.data;
    const defaultSource: string | undefined = body.source; // Allow passing a default source

    if (!dataToSave || !Array.isArray(dataToSave) || dataToSave.length === 0) {
      return NextResponse.json(
        { error: 'No data provided to save' },
        { status: 400 }
      );
    }

    const db = getDatabase();
    const insertCity = db.prepare('INSERT OR IGNORE INTO cities (name, state, source) VALUES (?, ?, ?)');
    const getCityId = db.prepare('SELECT id FROM cities WHERE name = ? AND state = ?');
    const updateCityTimestampAndSource = db.prepare('UPDATE cities SET updated_at = CURRENT_TIMESTAMP, source = COALESCE(?, source) WHERE id = ?');
    const insertRainfall = db.prepare(`
      INSERT OR REPLACE INTO rainfall_data (city_id, duration_minutes, return_period, intensity_in_per_hr)
      VALUES (?, ?, ?, ?)
    `);

    const processedCities = new Set<string>();
    const cityIdToSource = new Map<number, string | undefined>();
    const errors: string[] = [];

    const transaction = db.transaction(() => {
      for (const row of dataToSave) {
        const city = row.city.trim();
        const state = row.state.trim().toUpperCase();
        const durationMinutes = row.durationMinutes;
        const returnPeriod = row.returnPeriod.trim().toLowerCase();
        const intensity = row.intensity;
        const source = row.source || defaultSource;

        // Insert city if needed (with source)
        insertCity.run(city, state, source || null);
        const cityResult = getCityId.get(city, state) as { id: number } | undefined;
        
        if (!cityResult) {
          errors.push(`Failed to get city ID for ${city}, ${state}`);
          continue;
        }

        const cityId = cityResult.id;
        const cityKey = `${city}-${state}`;
        if (!processedCities.has(cityKey)) {
          processedCities.add(cityKey);
        }
        
        // Track city IDs with their source for update
        if (!cityIdToSource.has(cityId)) {
          cityIdToSource.set(cityId, source);
        }

        // Insert rainfall data
        insertRainfall.run(cityId, durationMinutes, returnPeriod, intensity);
      }
      
      // Update timestamps and source for all cities that had data imported
      for (const [cityId, source] of cityIdToSource) {
        updateCityTimestampAndSource.run(source || null, cityId);
      }
    });

    try {
      transaction();
    } catch (dbError) {
      return NextResponse.json(
        { error: 'Database error', details: String(dbError) },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Successfully saved data for ${processedCities.size} city/cities`,
      citiesImported: processedCities.size,
      rowsProcessed: dataToSave.length,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Error saving data:', error);
    return NextResponse.json(
      { error: 'Failed to save data', details: String(error) },
      { status: 500 }
    );
  }
}
