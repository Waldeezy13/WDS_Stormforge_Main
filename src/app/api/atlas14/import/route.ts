import { NextResponse } from 'next/server';
import { getDatabase } from '@/utils/database';
import Papa from 'papaparse';

interface CSVRow {
  city: string;
  state: string;
  duration_minutes: string;
  return_period: string;
  intensity: string;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    const text = await file.text();
    
    return new Promise<NextResponse>((resolve) => {
      Papa.parse<CSVRow>(text, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header) => header.trim().toLowerCase(),
        complete: async (results) => {
          if (results.errors.length > 0) {
            return resolve(NextResponse.json(
              { error: 'CSV parsing errors', details: results.errors },
              { status: 400 }
            ));
          }

          const db = getDatabase();
          const insertCity = db.prepare('INSERT OR IGNORE INTO cities (name, state) VALUES (?, ?)');
          const getCityId = db.prepare('SELECT id FROM cities WHERE name = ? AND state = ?');
          const insertRainfall = db.prepare(`
            INSERT OR REPLACE INTO rainfall_data (city_id, duration_minutes, return_period, intensity_in_per_hr)
            VALUES (?, ?, ?, ?)
          `);

          const validReturnPeriods = ['1yr', '2yr', '5yr', '10yr', '25yr', '50yr', '100yr', '500yr'];
          const processedCities = new Set<string>();
          const errors: string[] = [];

          const transaction = db.transaction(() => {
            for (const row of results.data) {
              // Validate required fields
              if (!row.city || !row.state || !row.duration_minutes || !row.return_period || !row.intensity) {
                errors.push(`Missing required fields in row: ${JSON.stringify(row)}`);
                continue;
              }

              const city = row.city.trim();
              const state = row.state.trim().toUpperCase();
              const durationMinutes = parseInt(row.duration_minutes);
              const returnPeriod = row.return_period.trim().toLowerCase();
              const intensity = parseFloat(row.intensity);

              // Validate data types
              if (isNaN(durationMinutes) || durationMinutes <= 0) {
                errors.push(`Invalid duration_minutes: ${row.duration_minutes}`);
                continue;
              }

              if (!validReturnPeriods.includes(returnPeriod)) {
                errors.push(`Invalid return_period: ${returnPeriod}. Must be one of: ${validReturnPeriods.join(', ')}`);
                continue;
              }

              if (isNaN(intensity) || intensity < 0) {
                errors.push(`Invalid intensity: ${row.intensity}`);
                continue;
              }

              // Insert city if needed
              insertCity.run(city, state);
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

              // Insert rainfall data
              insertRainfall.run(cityId, durationMinutes, returnPeriod, intensity);
            }
          });

          try {
            transaction();
          } catch (dbError) {
            return resolve(NextResponse.json(
              { error: 'Database error', details: String(dbError) },
              { status: 500 }
            ));
          }

          if (errors.length > 0) {
            return resolve(NextResponse.json(
              { 
                success: true,
                message: `Import completed with ${errors.length} errors`,
                citiesImported: processedCities.size,
                errors: errors.slice(0, 10) // Limit to first 10 errors
              },
              { status: 200 }
            ));
          }

          resolve(NextResponse.json({
            success: true,
            message: `Successfully imported data for ${processedCities.size} city/cities`,
            citiesImported: processedCities.size,
            rowsProcessed: results.data.length
          }));
        },
        error: (error: Error) => {
          resolve(NextResponse.json(
            { error: 'CSV parsing failed', details: error.message },
            { status: 400 }
          ));
        }
      });
    });
  } catch (error) {
    console.error('Error importing CSV:', error);
    return NextResponse.json(
      { error: 'Failed to import CSV', details: String(error) },
      { status: 500 }
    );
  }
}

