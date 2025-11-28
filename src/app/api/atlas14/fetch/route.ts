import { NextResponse } from 'next/server';
import { getDatabase, SourceType, DataUnits, DataBasis, SeriesType } from '@/utils/database';
import { 
  fetchAtlas14Point, 
  Atlas14Options,
  Atlas14Units,
  Atlas14Basis,
  Atlas14Series
} from '@/services/noaaAtlas14Client';

interface FetchRequest {
  lat: number;
  lon: number;
  name: string;
  state: string;
  units?: Atlas14Units;
  basis?: Atlas14Basis;
  seriesType?: Atlas14Series;
}

interface FetchResponse {
  success: boolean;
  city?: {
    id: number;
    name: string;
    state: string;
    source: string;
    sourceType: SourceType;
    latitude: number;
    longitude: number;
    units: DataUnits;
    basis: DataBasis;
    seriesType: SeriesType;
  };
  dataCount?: number;
  message: string;
}

export async function POST(request: Request): Promise<NextResponse<FetchResponse>> {
  try {
    const body: FetchRequest = await request.json();
    
    // Validate required fields
    if (typeof body.lat !== 'number' || typeof body.lon !== 'number') {
      return NextResponse.json({
        success: false,
        message: 'Latitude and longitude are required and must be numbers',
      }, { status: 400 });
    }
    
    if (!body.name || typeof body.name !== 'string') {
      return NextResponse.json({
        success: false,
        message: 'Location name is required',
      }, { status: 400 });
    }
    
    if (!body.state || typeof body.state !== 'string') {
      return NextResponse.json({
        success: false,
        message: 'State abbreviation is required',
      }, { status: 400 });
    }

    const { lat, lon, name, state } = body;
    const units = body.units || 'ENGLISH';
    const basis = body.basis || 'INTENSITY';
    const seriesType = body.seriesType || 'PDS';
    
    const locationName = name.trim();
    const locationState = state.trim().toUpperCase();

    // Fetch from NOAA
    const options: Atlas14Options = { units, basis, seriesType };
    console.log(`[Atlas14Fetch] Fetching data for ${locationName}, ${locationState} at (${lat}, ${lon})`);
    
    const result = await fetchAtlas14Point(lat, lon, options);

    if (!result.success) {
      console.error(`[Atlas14Fetch] NOAA fetch failed: ${result.error}`);
      return NextResponse.json({
        success: false,
        message: `Failed to fetch from NOAA: ${result.error}${result.details ? ` - ${result.details}` : ''}`,
      }, { status: 400 });
    }

    const { metadata, values } = result.data;

    // Build source metadata JSON
    const sourceMetadata = JSON.stringify({
      volume: metadata.volume,
      requestUrl: metadata.requestUrl,
      fetchedAt: metadata.fetchedAt,
    });

    const db = getDatabase();

    // Transaction to insert/update city and rainfall data
    const transaction = db.transaction(() => {
      // Upsert city record
      db.prepare(`
        INSERT INTO cities (name, state, latitude, longitude, source, source_type, units, basis, series_type, source_metadata, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
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
      `).run(
        locationName,
        locationState,
        lat,
        lon,
        'NOAA Atlas 14',
        'ATLAS14',
        units,
        basis,
        seriesType,
        sourceMetadata
      );

      // Get the city ID
      const cityRow = db.prepare('SELECT id FROM cities WHERE name = ? AND state = ?')
        .get(locationName, locationState) as { id: number };
      const cityId = cityRow.id;

      // Delete existing rainfall data
      db.prepare('DELETE FROM rainfall_data WHERE city_id = ?').run(cityId);

      // Insert rainfall data
      const insertRainfall = db.prepare(`
        INSERT INTO rainfall_data (city_id, duration_minutes, return_period, intensity_in_per_hr)
        VALUES (?, ?, ?, ?)
      `);

      for (const value of values) {
        insertRainfall.run(cityId, value.durationMinutes, value.returnPeriod, value.intensity);
      }

      return cityId;
    });

    const cityId = transaction();

    console.log(`[Atlas14Fetch] Successfully imported ${values.length} data points for ${locationName}, ${locationState}`);

    return NextResponse.json({
      success: true,
      city: {
        id: cityId,
        name: locationName,
        state: locationState,
        source: 'NOAA Atlas 14',
        sourceType: 'ATLAS14',
        latitude: lat,
        longitude: lon,
        units,
        basis,
        seriesType,
      },
      dataCount: values.length,
      message: `Successfully fetched ${values.length} data points from ${metadata.volume}`,
    });

  } catch (error) {
    console.error('[Atlas14Fetch] Error:', error);
    return NextResponse.json({
      success: false,
      message: error instanceof Error ? error.message : 'An unexpected error occurred',
    }, { status: 500 });
  }
}
