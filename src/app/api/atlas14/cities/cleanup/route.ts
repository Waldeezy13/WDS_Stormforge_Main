import { NextResponse } from 'next/server';
import { getDatabase } from '@/utils/database';

export async function POST() {
  try {
    const db = getDatabase();
    
    // Find cities that don't have any rainfall data
    const citiesWithoutData = db.prepare(`
      SELECT c.id, c.name, c.state
      FROM cities c
      LEFT JOIN rainfall_data rd ON c.id = rd.city_id
      WHERE rd.id IS NULL
    `).all() as Array<{ id: number; name: string; state: string }>;

    if (citiesWithoutData.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No placeholder cities found to delete',
        deletedCount: 0
      });
    }

    // Delete cities without rainfall data
    // The CASCADE foreign key will automatically delete any related rainfall_data
    const deleteCity = db.prepare('DELETE FROM cities WHERE id = ?');
    
    const transaction = db.transaction(() => {
      for (const city of citiesWithoutData) {
        deleteCity.run(city.id);
      }
    });

    transaction();

    return NextResponse.json({
      success: true,
      message: `Deleted ${citiesWithoutData.length} placeholder city/cities`,
      deletedCount: citiesWithoutData.length,
      deletedCities: citiesWithoutData.map(c => `${c.name}, ${c.state}`)
    });
  } catch (error) {
    console.error('Error cleaning up placeholder cities:', error);
    return NextResponse.json(
      { error: 'Failed to cleanup placeholder cities', details: String(error) },
      { status: 500 }
    );
  }
}







