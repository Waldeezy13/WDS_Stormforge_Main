// Rainfall Data Utilities (Intensity in inches/hour)
// Supports various sources: NOAA Atlas 14, municipal data, custom imports

import { InterpolationMethod, getIntensityInPerHr as getIdfIntensity } from './idf';

export type ReturnPeriod = '1yr' | '2yr' | '5yr' | '10yr' | '25yr' | '50yr' | '100yr' | '500yr';
export type { InterpolationMethod } from './idf';
export type SourceType = 'CUSTOM' | 'ATLAS14';
export type DataUnits = 'ENGLISH' | 'METRIC';
export type DataBasis = 'INTENSITY' | 'DEPTH';
export type SeriesType = 'PDS' | 'AMS';

export interface RainfallData {
  durationMinutes: number;
  intensities: Record<ReturnPeriod, number>;
}

export interface City {
  id: number;
  name: string;
  state: string;
  latitude?: number;
  longitude?: number;
  source?: string;
  sourceType?: SourceType;
  units?: DataUnits;
  basis?: DataBasis;
  seriesType?: SeriesType;
  lastUpdated?: string;
  dataCount?: number;
}

// Cache for API responses
let citiesCache: Record<string, City[]> | null = null;
const rainfallDataCache: Map<number, RainfallData[]> = new Map();

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
 * Gets the intensity for a specific duration and return period.
 * Uses the specified interpolation method (default: 'log-log' for better accuracy).
 * Requires cityId instead of city name.
 * 
 * @param durationMinutes - Duration in minutes
 * @param returnPeriod - Storm frequency
 * @param cityId - City ID
 * @param method - Interpolation method ('linear' or 'log-log'), defaults to 'log-log'
 */
export async function getIntensity(
  durationMinutes: number, 
  returnPeriod: ReturnPeriod, 
  cityId: number,
  method: InterpolationMethod = 'log-log'
): Promise<number> {
  const data = await getRainfallDataByCityId(cityId);
  
  if (data.length === 0) {
    return 0;
  }
  
  // Use the IDF interpolation module
  return getIdfIntensity(data, returnPeriod, durationMinutes, method);
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
