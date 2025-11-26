import { NextResponse } from 'next/server';
import { getDatabase } from '@/utils/database';

export async function DELETE(
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
    
    // First, check if the city exists
    const city = db.prepare('SELECT id, name, state FROM cities WHERE id = ?').get(cityId) as 
      { id: number; name: string; state: string } | undefined;
    
    if (!city) {
      return NextResponse.json(
        { error: 'City not found' },
        { status: 404 }
      );
    }

    // Count rainfall data records for this city
    const dataCount = db.prepare('SELECT COUNT(*) as count FROM rainfall_data WHERE city_id = ?')
      .get(cityId) as { count: number };
    
    // Delete the city (CASCADE will automatically delete related rainfall_data)
    db.prepare('DELETE FROM cities WHERE id = ?').run(cityId);

    return NextResponse.json({
      success: true,
      message: `Successfully deleted ${city.name}, ${city.state}`,
      deletedCity: {
        id: cityId,
        name: city.name,
        state: city.state,
        dataRecordsDeleted: dataCount.count
      }
    });
  } catch (error) {
    console.error('Error deleting city:', error);
    return NextResponse.json(
      { error: 'Failed to delete city', details: String(error) },
      { status: 500 }
    );
  }
}

