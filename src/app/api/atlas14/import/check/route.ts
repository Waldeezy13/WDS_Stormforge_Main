import { NextResponse } from 'next/server';
import { getDatabase } from '@/utils/database';

interface CityCheck {
  city: string;
  state: string;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const citiesToCheck: CityCheck[] = body.cities || [];

    if (!citiesToCheck || !Array.isArray(citiesToCheck) || citiesToCheck.length === 0) {
      return NextResponse.json(
        { error: 'No cities provided to check' },
        { status: 400 }
      );
    }

    const db = getDatabase();
    const getCityId = db.prepare('SELECT id FROM cities WHERE name = ? AND state = ?');
    const checkRainfallData = db.prepare('SELECT COUNT(*) as count FROM rainfall_data WHERE city_id = ?');

    const results: Array<{ city: string; state: string; hasData: boolean; recordCount: number }> = [];

    for (const { city, state } of citiesToCheck) {
      const cityName = city.trim();
      const stateName = state.trim().toUpperCase();
      
      const cityResult = getCityId.get(cityName, stateName) as { id: number } | undefined;
      
      if (cityResult) {
        const countResult = checkRainfallData.get(cityResult.id) as { count: number } | undefined;
        const recordCount = countResult?.count || 0;
        results.push({
          city: cityName,
          state: stateName,
          hasData: recordCount > 0,
          recordCount
        });
      } else {
        // City doesn't exist, so no data
        results.push({
          city: cityName,
          state: stateName,
          hasData: false,
          recordCount: 0
        });
      }
    }

    const citiesWithData = results.filter(r => r.hasData);

    return NextResponse.json({
      hasExistingData: citiesWithData.length > 0,
      cities: results,
      citiesWithData: citiesWithData.map(c => `${c.city}, ${c.state}`)
    });
  } catch (error) {
    console.error('Error checking existing data:', error);
    return NextResponse.json(
      { error: 'Failed to check existing data', details: String(error) },
      { status: 500 }
    );
  }
}
