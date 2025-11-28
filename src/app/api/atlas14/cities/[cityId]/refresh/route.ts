import { NextResponse } from 'next/server';
import { getDatabase, SourceType, DataUnits, DataBasis, SeriesType } from '@/utils/database';
import { 
  fetchAtlas14Point, 
  Atlas14Options,
  Atlas14Units,
  Atlas14Basis,
  Atlas14Series
} from '@/services/noaaAtlas14Client';

interface RefreshResponse {
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

/**
 * POST /api/atlas14/cities/[cityId]/refresh
 * Re-fetches rainfall data from NOAA Atlas 14 for an existing city
 * Only works for cities with source_type = 'ATLAS14' that have stored coordinates
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ cityId: string }> }
): Promise<NextResponse<RefreshResponse>> {
  try {
    const { cityId: cityIdParam } = await params;
    const cityId = parseInt(cityIdParam);
    
    if (isNaN(cityId)) {
      return NextResponse.json({
        success: false,
        message: 'Invalid city ID',
      }, { status: 400 });
    }

    const db = getDatabase();
    
    // Get the city record
    const city = db.prepare(`
      SELECT id, name, state, latitude, longitude, source_type, units, basis, series_type
      FROM cities 
      WHERE id = ?
    `).get(cityId) as {
      id: number;
      name: string;
      state: string;
      latitude: number | null;
      longitude: number | null;
      source_type: string | null;
      units: string | null;
      basis: string | null;
      series_type: string | null;
    } | undefined;
    
    if (!city) {
      return NextResponse.json({
        success: false,
        message: 'City not found',
      }, { status: 404 });
    }
    
    // Check if this is an Atlas 14 source
    if (city.source_type !== 'ATLAS14') {
      return NextResponse.json({
        success: false,
        message: 'This city was not imported from NOAA Atlas 14. Cannot refresh.',
      }, { status: 400 });
    }
    
    // Check if we have stored coordinates
    if (city.latitude === null || city.longitude === null) {
      return NextResponse.json({
        success: false,
        message: 'This city does not have stored coordinates. Cannot refresh.',
      }, { status: 400 });
    }

    // Use stored options or defaults
    const units = (city.units as Atlas14Units) || 'ENGLISH';
    const basis = (city.basis as Atlas14Basis) || 'INTENSITY';
    const seriesType = (city.series_type as Atlas14Series) || 'PDS';

    // Fetch from NOAA
    const options: Atlas14Options = { units, basis, seriesType };
    console.log(`[Atlas14Refresh] Refreshing data for ${city.name}, ${city.state} at (${city.latitude}, ${city.longitude})`);
    
    const result = await fetchAtlas14Point(city.latitude, city.longitude, options);

    if (!result.success) {
      console.error(`[Atlas14Refresh] NOAA fetch failed: ${result.error}`);
      return NextResponse.json({
        success: false,
        message: `Failed to refresh from NOAA: ${result.error}${result.details ? ` - ${result.details}` : ''}`,
      }, { status: 400 });
    }

    const { metadata, values } = result.data;

    // Build source metadata JSON
    const sourceMetadata = JSON.stringify({
      volume: metadata.volume,
      requestUrl: metadata.requestUrl,
      fetchedAt: metadata.fetchedAt,
    });

    // Transaction to update city and replace rainfall data
    const transaction = db.transaction(() => {
      // Update city metadata
      db.prepare(`
        UPDATE cities 
        SET source_metadata = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(sourceMetadata, cityId);

      // Delete existing rainfall data
      db.prepare('DELETE FROM rainfall_data WHERE city_id = ?').run(cityId);

      // Insert new rainfall data
      const insertRainfall = db.prepare(`
        INSERT INTO rainfall_data (city_id, duration_minutes, return_period, intensity_in_per_hr)
        VALUES (?, ?, ?, ?)
      `);

      for (const value of values) {
        insertRainfall.run(cityId, value.durationMinutes, value.returnPeriod, value.intensity);
      }
    });

    transaction();

    console.log(`[Atlas14Refresh] Successfully refreshed ${values.length} data points for ${city.name}, ${city.state}`);

    return NextResponse.json({
      success: true,
      city: {
        id: cityId,
        name: city.name,
        state: city.state,
        source: 'NOAA Atlas 14',
        sourceType: 'ATLAS14',
        latitude: city.latitude,
        longitude: city.longitude,
        units: units as DataUnits,
        basis: basis as DataBasis,
        seriesType: seriesType as SeriesType,
      },
      dataCount: values.length,
      message: `Successfully refreshed ${values.length} data points from ${metadata.volume}`,
    });

  } catch (error) {
    console.error('[Atlas14Refresh] Error:', error);
    return NextResponse.json({
      success: false,
      message: error instanceof Error ? error.message : 'An unexpected error occurred',
    }, { status: 500 });
  }
}
