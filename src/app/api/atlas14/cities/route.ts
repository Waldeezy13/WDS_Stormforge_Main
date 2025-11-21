import { NextResponse } from 'next/server';
import { getDatabase } from '@/utils/database';

export async function GET() {
  try {
    const db = getDatabase();
    const cities = db.prepare(`
      SELECT id, name, state, updated_at 
      FROM cities 
      ORDER BY state, name
    `).all() as Array<{ id: number; name: string; state: string; updated_at: string | null }>;

    // Group cities by state
    const citiesByState: Record<string, Array<{ id: number; name: string; state: string; lastUpdated?: string }>> = {};
    
    for (const city of cities) {
      if (!citiesByState[city.state]) {
        citiesByState[city.state] = [];
      }
      citiesByState[city.state].push({
        id: city.id,
        name: city.name,
        state: city.state,
        lastUpdated: city.updated_at || undefined
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

