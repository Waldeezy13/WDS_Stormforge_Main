import { NextResponse } from 'next/server';
import { getDatabase } from '@/utils/database';

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
    
    const city = db.prepare(`
      SELECT 
        c.id, 
        c.name, 
        c.state,
        c.latitude,
        c.longitude,
        c.source,
        c.source_type,
        c.units,
        c.basis,
        c.series_type,
        c.notes,
        c.updated_at,
        COUNT(rd.id) as data_count
      FROM cities c
      LEFT JOIN rainfall_data rd ON c.id = rd.city_id
      WHERE c.id = ?
      GROUP BY c.id
    `).get(cityId) as { 
      id: number; 
      name: string; 
      state: string;
      latitude: number | null;
      longitude: number | null;
      source: string | null;
      source_type: string | null;
      units: string | null;
      basis: string | null;
      series_type: string | null;
      notes: string | null;
      updated_at: string | null;
      data_count: number;
    } | undefined;
    
    if (!city) {
      return NextResponse.json(
        { error: 'City not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      id: city.id,
      name: city.name,
      state: city.state,
      latitude: city.latitude || undefined,
      longitude: city.longitude || undefined,
      source: city.source || undefined,
      sourceType: city.source_type || undefined,
      units: city.units || undefined,
      basis: city.basis || undefined,
      seriesType: city.series_type || undefined,
      notes: city.notes || undefined,
      lastUpdated: city.updated_at || undefined,
      dataCount: city.data_count
    });
  } catch (error) {
    console.error('Error fetching city:', error);
    return NextResponse.json(
      { error: 'Failed to fetch city' },
      { status: 500 }
    );
  }
}

export async function PUT(
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

    const body = await request.json();
    const { name, state, notes, latitude, longitude } = body;

    const db = getDatabase();
    
    // First, check if the city exists
    const existingCity = db.prepare('SELECT id, name, state FROM cities WHERE id = ?').get(cityId) as 
      { id: number; name: string; state: string } | undefined;
    
    if (!existingCity) {
      return NextResponse.json(
        { error: 'City not found' },
        { status: 404 }
      );
    }

    // Build dynamic update query based on provided fields
    const updates: string[] = [];
    const values: (string | number | null)[] = [];

    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name.trim());
    }
    if (state !== undefined) {
      updates.push('state = ?');
      values.push(state.trim().toUpperCase());
    }
    if (notes !== undefined) {
      updates.push('notes = ?');
      values.push(notes.trim() || null);
    }
    if (latitude !== undefined) {
      updates.push('latitude = ?');
      values.push(latitude);
    }
    if (longitude !== undefined) {
      updates.push('longitude = ?');
      values.push(longitude);
    }

    if (updates.length === 0) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 }
      );
    }

    // Always update the updated_at timestamp
    updates.push('updated_at = ?');
    values.push(new Date().toISOString());
    
    // Add cityId for WHERE clause
    values.push(cityId);

    const query = `UPDATE cities SET ${updates.join(', ')} WHERE id = ?`;
    db.prepare(query).run(...values);

    // Fetch the updated city
    const updatedCity = db.prepare(`
      SELECT 
        c.id, 
        c.name, 
        c.state,
        c.latitude,
        c.longitude,
        c.source,
        c.notes,
        c.updated_at,
        COUNT(rd.id) as data_count
      FROM cities c
      LEFT JOIN rainfall_data rd ON c.id = rd.city_id
      WHERE c.id = ?
      GROUP BY c.id
    `).get(cityId) as { 
      id: number; 
      name: string; 
      state: string;
      latitude: number | null;
      longitude: number | null;
      source: string | null;
      notes: string | null;
      updated_at: string | null;
      data_count: number;
    };

    return NextResponse.json({
      success: true,
      message: `Successfully updated ${updatedCity.name}, ${updatedCity.state}`,
      city: {
        id: updatedCity.id,
        name: updatedCity.name,
        state: updatedCity.state,
        latitude: updatedCity.latitude || undefined,
        longitude: updatedCity.longitude || undefined,
        source: updatedCity.source || undefined,
        notes: updatedCity.notes || undefined,
        lastUpdated: updatedCity.updated_at || undefined,
        dataCount: updatedCity.data_count
      }
    });
  } catch (error) {
    console.error('Error updating city:', error);
    return NextResponse.json(
      { error: 'Failed to update city', details: String(error) },
      { status: 500 }
    );
  }
}

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

