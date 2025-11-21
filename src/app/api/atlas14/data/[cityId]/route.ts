import { NextResponse } from 'next/server';
import { getDatabase } from '@/utils/database';
import { ReturnPeriod, RainfallData } from '@/utils/atlas14';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ cityId: string }> }
) {
  try {
    const { cityId: cityIdParam } = await params;
    const cityId = parseInt(cityIdParam);
    
    if (isNaN(cityId)) {
      return NextResponse.json(
        { error: 'Invalid city ID' },
        { status: 400 }
      );
    }

    const db = getDatabase();
    const rows = db.prepare(`
      SELECT duration_minutes, return_period, intensity_in_per_hr
      FROM rainfall_data
      WHERE city_id = ?
      ORDER BY duration_minutes, return_period
    `).all(cityId) as Array<{
      duration_minutes: number;
      return_period: string;
      intensity_in_per_hr: number;
    }>;

    // Group by duration and build RainfallData array
    const dataMap = new Map<number, Record<ReturnPeriod, number>>();
    
    for (const row of rows) {
      if (!dataMap.has(row.duration_minutes)) {
        dataMap.set(row.duration_minutes, {
          '2yr': 0,
          '5yr': 0,
          '10yr': 0,
          '25yr': 0,
          '50yr': 0,
          '100yr': 0,
        } as Record<ReturnPeriod, number>);
      }
      const intensities = dataMap.get(row.duration_minutes)!;
      intensities[row.return_period as ReturnPeriod] = row.intensity_in_per_hr;
    }

    // Standard durations to always return (even if no data)
    const standardDurations = [5, 10, 15, 30, 60, 120, 180, 360, 720, 1440];
    const standardReturnPeriods: ReturnPeriod[] = ['2yr', '5yr', '10yr', '25yr', '50yr', '100yr'];
    
    const rainfallData: RainfallData[] = standardDurations.map(durationMinutes => {
      const intensities = dataMap.get(durationMinutes) || {
        '2yr': 0,
        '5yr': 0,
        '10yr': 0,
        '25yr': 0,
        '50yr': 0,
        '100yr': 0,
      } as Record<ReturnPeriod, number>;
      
      // Ensure all return periods are present (fill with 0 if missing)
      for (const rp of standardReturnPeriods) {
        if (!(rp in intensities)) {
          intensities[rp] = 0;
        }
      }
      
      return {
        durationMinutes,
        intensities,
      };
    });

    return NextResponse.json(rainfallData);
  } catch (error) {
    console.error('Error fetching rainfall data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch rainfall data' },
      { status: 500 }
    );
  }
}

