import { NextResponse } from 'next/server';
import { getDatabase } from '@/utils/database';

export async function POST() {
  try {
    const db = getDatabase();
    
    // Delete all rainfall data
    db.prepare('DELETE FROM rainfall_data').run();
    
    // Optionally delete cities too (uncomment if you want to start fresh)
    // db.prepare('DELETE FROM cities').run();
    
    return NextResponse.json({
      success: true,
      message: 'All rainfall data has been cleared. Cities remain in database.'
    });
  } catch (error) {
    console.error('Error clearing data:', error);
    return NextResponse.json(
      { error: 'Failed to clear data', details: String(error) },
      { status: 500 }
    );
  }
}

