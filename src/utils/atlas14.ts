// Atlas 14 Rainfall Data (Intensity in inches/hour)
// Source: NOAA Atlas 14 Point Precipitation Frequency Estimates

export type ReturnPeriod = '2yr' | '5yr' | '10yr' | '25yr' | '50yr' | '100yr';

export interface RainfallData {
  durationMinutes: number;
  intensities: Record<ReturnPeriod, number>;
}

export interface City {
  id: number;
  name: string;
  state: string;
  lastUpdated?: string;
}

// Cache for API responses
let citiesCache: Record<string, City[]> | null = null;
let rainfallDataCache: Map<number, RainfallData[]> = new Map();

/**
 * Fetches all cities grouped by state from the API
 */
export async function getCitiesByState(): Promise<Record<string, City[]>> {
  if (citiesCache) {
    return citiesCache;
  }

  try {
    const response = await fetch('/api/atlas14/cities');
    if (!response.ok) {
      throw new Error('Failed to fetch cities');
    }
    const data = await response.json() as Record<string, City[]>;
    citiesCache = data;
    return data;
  } catch (error) {
    console.error('Error fetching cities:', error);
    return {};
  }
}

/**
 * Fetches rainfall data for a specific city by ID
 */
export async function getRainfallDataByCityId(cityId: number): Promise<RainfallData[]> {
  if (rainfallDataCache.has(cityId)) {
    return rainfallDataCache.get(cityId)!;
  }

  try {
    const response = await fetch(`/api/atlas14/data/${cityId}`);
    if (!response.ok) {
      throw new Error('Failed to fetch rainfall data');
    }
    const data = await response.json() as RainfallData[];
    rainfallDataCache.set(cityId, data);
    return data;
  } catch (error) {
    console.error('Error fetching rainfall data:', error);
    return [];
  }
}

/**
 * Gets the intensity for a specific duration and return period using linear interpolation.
 * Requires cityId instead of city name.
 */
export async function getIntensity(
  durationMinutes: number, 
  returnPeriod: ReturnPeriod, 
  cityId: number
): Promise<number> {
  const data = await getRainfallDataByCityId(cityId);
  
  if (data.length === 0) {
    return 0;
  }
  
  // Find the two data points surrounding the requested duration
  const lower = data.slice().reverse().find(d => d.durationMinutes <= durationMinutes);
  const upper = data.find(d => d.durationMinutes >= durationMinutes);

  if (!lower && !upper) return 0;
  if (!lower) return upper!.intensities[returnPeriod];
  if (!upper) return lower!.intensities[returnPeriod];
  if (lower.durationMinutes === upper.durationMinutes) return lower.intensities[returnPeriod];

  // Linear Interpolation
  const t = (durationMinutes - lower.durationMinutes) / (upper.durationMinutes - lower.durationMinutes);
  return lower.intensities[returnPeriod] + t * (upper.intensities[returnPeriod] - lower.intensities[returnPeriod]);
}

/**
 * Get raw data table for a city by ID
 */
export async function getRainfallData(cityId: number): Promise<RainfallData[]> {
  return getRainfallDataByCityId(cityId);
}

/**
 * Clear caches (useful after importing new data)
 */
export function clearAtlas14Cache() {
  citiesCache = null;
  rainfallDataCache.clear();
}
