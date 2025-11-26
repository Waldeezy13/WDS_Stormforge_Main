import { NextResponse } from 'next/server';
import { getDatabase } from '@/utils/database';

export async function GET() {
  try {
    const db = getDatabase();
    const cities = db.prepare(`
      SELECT 
        c.id, 
        c.name, 
        c.state, 
        c.updated_at,
        COUNT(rd.id) as data_count
      FROM cities c
      LEFT JOIN rainfall_data rd ON c.id = rd.city_id
      GROUP BY c.id, c.name, c.state, c.updated_at
      ORDER BY c.state, c.name
    `).all() as Array<{ 
      id: number; 
      name: string; 
      state: string; 
      updated_at: string | null;
      data_count: number;
    }>;

    // Group cities by state
    const citiesByState: Record<string, Array<{ 
      id: number; 
      name: string; 
      state: string; 
      lastUpdated?: string;
      dataCount: number;
    }>> = {};
    
    for (const city of cities) {
      if (!citiesByState[city.state]) {
        citiesByState[city.state] = [];
      }
      citiesByState[city.state].push({
        id: city.id,
        name: city.name,
        state: city.state,
        lastUpdated: city.updated_at || undefined,
        dataCount: city.data_count
      });
    }

    return NextResponse.json(citiesByState);
  } catch (error) {
    console.error('Error fetching cities:', error);
    return NextResponse.json(
      { error: 'Failed to fetch cities' },
      { status: 500 }
    );
  }
}

