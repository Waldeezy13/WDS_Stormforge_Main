/**
 * NOAA Atlas 14 Client
 * 
 * Fetches precipitation frequency data from NOAA's PFDS (Precipitation Frequency Data Server)
 * for a given latitude/longitude coordinate.
 * 
 * API Documentation: https://hdsc.nws.noaa.gov/hdsc/pfds/
 * 
 * The NOAA PFDS API returns JavaScript variable assignments that we parse:
 * - quantiles: 2D array of values [duration][return_period]
 * - volume, version, region: metadata
 * - Durations: 5-min to 60-day (19 rows)
 * - Return periods for PDS: 1, 2, 5, 10, 25, 50, 100, 200, 500, 1000 years
 */

export type Atlas14Units = 'ENGLISH' | 'METRIC';
export type Atlas14Basis = 'INTENSITY' | 'DEPTH';
export type Atlas14Series = 'PDS' | 'AMS'; // Partial Duration Series vs Annual Maximum Series

export interface Atlas14Options {
  units?: Atlas14Units;      // default: 'ENGLISH'
  basis?: Atlas14Basis;      // default: 'INTENSITY'
  seriesType?: Atlas14Series;  // default: 'PDS'
}

export interface Atlas14Value {
  durationMinutes: number;
  returnPeriod: string; // '2yr', '5yr', etc.
  intensity: number; // in/hr (always in/hr, converted if needed)
}

export interface Atlas14Metadata {
  volume: string;           // e.g., "NOAA Atlas 14 Volume 11 Version 2"
  coordinates: { lat: number; lon: number };
  fetchedAt: string;        // ISO timestamp
  requestUrl: string;
  units: Atlas14Units;
  basis: Atlas14Basis;
  seriesType: Atlas14Series;
  region?: string;          // e.g., "Texas"
}

export interface Atlas14Result {
  metadata: Atlas14Metadata;
  values: Atlas14Value[];
}

export interface Atlas14Error {
  success: false;
  error: string;
  details?: string;
}

export type Atlas14Response = { success: true; data: Atlas14Result } | Atlas14Error;

// NOAA PFDS base URL - Note: path is /cgi-bin/new/ (not /cgi-bin/hdsc/new/)
const NOAA_PFDS_BASE_URL = process.env.NOAA_PFDS_URL || 'https://hdsc.nws.noaa.gov/cgi-bin/new/cgi_readH5.py';

// Standard return periods we support (matching the app's ReturnPeriod type)
const SUPPORTED_RETURN_PERIODS = ['2yr', '5yr', '10yr', '25yr', '50yr', '100yr'];

// PDS return period indices (0-indexed) in NOAA response quantiles array
// Columns are: 1yr, 2yr, 5yr, 10yr, 25yr, 50yr, 100yr, 200yr, 500yr, 1000yr
const PDS_RETURN_PERIOD_INDICES: Record<string, number> = {
  '1yr': 0,
  '2yr': 1,
  '5yr': 2,
  '10yr': 3,
  '25yr': 4,
  '50yr': 5,
  '100yr': 6,
  '200yr': 7,
  '500yr': 8,
  '1000yr': 9,
};

// AMS return period indices (0-indexed) - one less column than PDS
// Columns are: 1/2, 1/5, 1/10, 1/25, 1/50, 1/100, 1/200, 1/500, 1/1000
const AMS_RETURN_PERIOD_INDICES: Record<string, number> = {
  '2yr': 0,
  '5yr': 1,
  '10yr': 2,
  '25yr': 3,
  '50yr': 4,
  '100yr': 5,
  '200yr': 6,
  '500yr': 7,
  '1000yr': 8,
};

// Duration indices (0-indexed) in NOAA response quantiles array
// Rows are: 5min, 10min, 15min, 30min, 60min, 2hr, 3hr, 6hr, 12hr, 24hr, 2day, 3day, 4day, 7day, 10day, 20day, 30day, 45day, 60day
const DURATION_MINUTES: number[] = [
  5, 10, 15, 30, 60,           // sub-hourly
  120, 180, 360, 720, 1440,    // hourly to daily
  2880, 4320, 5760,            // 2-4 days
  10080, 14400, 28800,         // 7-20 days
  43200, 64800, 86400          // 30-60 days
];

/**
 * Builds the NOAA PFDS request URL for a given coordinate
 */
export function buildNoaaUrl(
  lat: number,
  lon: number,
  options: Atlas14Options = {}
): string {
  const { units = 'ENGLISH', basis = 'INTENSITY', seriesType = 'PDS' } = options;
  
  const params = new URLSearchParams({
    lat: lat.toFixed(4),
    lon: lon.toFixed(4),
    type: 'pf',
    data: basis.toLowerCase(),
    units: units.toLowerCase(),
    series: seriesType.toLowerCase(),
  });
  
  return `${NOAA_PFDS_BASE_URL}?${params.toString()}`;
}

/**
 * Extracts a JavaScript variable value from NOAA response text
 */
function extractJsVariable(text: string, varName: string): string | null {
  // Match patterns like: varName = 'value'; or varName = "value"; or varName = [[...]]
  const patterns = [
    new RegExp(`${varName}\\s*=\\s*'([^']*)'`, 's'),
    new RegExp(`${varName}\\s*=\\s*"([^"]*)"`, 's'),
    new RegExp(`${varName}\\s*=\\s*(\\[\\[.*?\\]\\])\\s*;`, 's'),
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1];
    }
  }
  
  return null;
}

/**
 * Parses a JavaScript 2D array string like "[['1', '2'], ['3', '4']]"
 */
function parseJs2DArray(arrayStr: string): string[][] | null {
  try {
    // Clean up the string and parse as JSON
    const cleaned = arrayStr
      .replace(/'/g, '"')  // Replace single quotes with double quotes
      .trim();
    
    const parsed = JSON.parse(cleaned);
    
    if (Array.isArray(parsed) && parsed.every(row => Array.isArray(row))) {
      return parsed;
    }
    
    return null;
  } catch {
    return null;
  }
}

/**
 * Parses NOAA Atlas 14 JavaScript response
 * 
 * Response format example:
 * result = 'values';
 * quantiles = [['5.12', '5.94', ...], ['4.09', '4.75', ...], ...];
 * volume = '11';
 * version = '2';
 * region = 'Texas';
 */
function parseNoaaJsResponse(
  responseText: string,
  lat: number,
  lon: number,
  options: Atlas14Options
): Atlas14Response {
  const { units = 'ENGLISH', basis = 'INTENSITY', seriesType = 'PDS' } = options;
  
  // Check for error/none result
  const resultValue = extractJsVariable(responseText, 'result');
  if (resultValue === 'none' || resultValue === 'null') {
    const errorMsg = extractJsVariable(responseText, 'ErrorMsg');
    return {
      success: false,
      error: 'No data available for this location',
      details: errorMsg || 'NOAA Atlas 14 does not have data for these coordinates',
    };
  }
  
  // Extract quantiles array
  const quantilesStr = extractJsVariable(responseText, 'quantiles');
  if (!quantilesStr) {
    return {
      success: false,
      error: 'Could not parse NOAA response',
      details: 'Missing quantiles data in response',
    };
  }
  
  const quantiles = parseJs2DArray(quantilesStr);
  if (!quantiles || quantiles.length === 0) {
    return {
      success: false,
      error: 'Could not parse quantiles data',
      details: 'Invalid quantiles array format',
    };
  }
  
  // Extract metadata
  const volume = extractJsVariable(responseText, 'volume') || '';
  const version = extractJsVariable(responseText, 'version') || '';
  const region = extractJsVariable(responseText, 'region') || '';
  
  const metadata: Atlas14Metadata = {
    volume: `NOAA Atlas 14 Volume ${volume}${version ? ` Version ${version}` : ''}`,
    coordinates: { lat, lon },
    fetchedAt: new Date().toISOString(),
    requestUrl: buildNoaaUrl(lat, lon, options),
    units,
    basis,
    seriesType,
    region: region || undefined,
  };
  
  // Parse values from quantiles array
  const values: Atlas14Value[] = [];
  const returnPeriodIndices = seriesType === 'AMS' ? AMS_RETURN_PERIOD_INDICES : PDS_RETURN_PERIOD_INDICES;
  
  // Iterate through durations (rows)
  for (let durationIdx = 0; durationIdx < Math.min(quantiles.length, DURATION_MINUTES.length); durationIdx++) {
    const durationMinutes = DURATION_MINUTES[durationIdx];
    const row = quantiles[durationIdx];
    
    if (!row || !Array.isArray(row)) continue;
    
    // Only extract supported return periods
    for (const returnPeriod of SUPPORTED_RETURN_PERIODS) {
      const colIndex = returnPeriodIndices[returnPeriod];
      
      if (colIndex === undefined || colIndex >= row.length) continue;
      
      const valueStr = String(row[colIndex]).trim();
      const rawValue = parseFloat(valueStr);
      
      if (!isNaN(rawValue) && rawValue >= 0) {
        // Convert to intensity if data is depth
        const intensity = basis === 'DEPTH'
          ? depthToIntensity(rawValue, durationMinutes)
          : rawValue;
        
        values.push({
          durationMinutes,
          returnPeriod,
          intensity,
        });
      }
    }
  }
  
  if (values.length === 0) {
    return {
      success: false,
      error: 'No valid data values parsed',
      details: `Parsed ${quantiles.length} duration rows but extracted 0 values`,
    };
  }
  
  return {
    success: true,
    data: {
      metadata,
      values,
    },
  };
}

/**
 * Fetches Atlas 14 precipitation frequency data for a coordinate
 */
export async function fetchAtlas14Point(
  lat: number,
  lon: number,
  options: Atlas14Options = {}
): Promise<Atlas14Response> {
  // Validate coordinates
  if (lat < -90 || lat > 90) {
    return {
      success: false,
      error: 'Invalid latitude',
      details: `Latitude must be between -90 and 90, got ${lat}`,
    };
  }
  
  if (lon < -180 || lon > 180) {
    return {
      success: false,
      error: 'Invalid longitude',
      details: `Longitude must be between -180 and 180, got ${lon}`,
    };
  }
  
  // Check if coordinates are within Atlas 14 coverage (continental US, PR, VI, etc.)
  // Rough bounding box for continental US
  const isContiguousUS = lat >= 24 && lat <= 50 && lon >= -125 && lon <= -66;
  const isAlaska = lat >= 51 && lat <= 72 && lon >= -180 && lon <= -129;
  const isPuertoRico = lat >= 17 && lat <= 19 && lon >= -68 && lon <= -65;
  const isHawaii = lat >= 18 && lat <= 23 && lon >= -161 && lon <= -154;
  
  if (!isContiguousUS && !isAlaska && !isPuertoRico && !isHawaii) {
    return {
      success: false,
      error: 'Coordinates outside Atlas 14 coverage',
      details: 'NOAA Atlas 14 covers the United States, Puerto Rico, and US Virgin Islands',
    };
  }
  
  const url = buildNoaaUrl(lat, lon, options);
  
  try {
    console.log(`[Atlas14Client] Fetching: ${url}`);
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'StormForge/1.0 (Stormwater Design Tool)',
        'Accept': 'text/plain, */*',
      },
      // Timeout after 30 seconds
      signal: AbortSignal.timeout(30000),
    });
    
    if (!response.ok) {
      return {
        success: false,
        error: `NOAA server returned HTTP ${response.status}`,
        details: `URL: ${url}`,
      };
    }
    
    const responseText = await response.text();
    
    // Check for empty response
    if (!responseText || responseText.trim().length === 0) {
      return {
        success: false,
        error: 'Empty response from NOAA',
        details: 'The server returned no data',
      };
    }
    
    return parseNoaaJsResponse(responseText, lat, lon, options);
    
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError' || error.name === 'TimeoutError') {
        return {
          success: false,
          error: 'Request timed out',
          details: 'NOAA server did not respond within 30 seconds',
        };
      }
      
      return {
        success: false,
        error: 'Network error',
        details: error.message,
      };
    }
    
    return {
      success: false,
      error: 'Unknown error',
      details: String(error),
    };
  }
}

/**
 * Converts depth values to intensity (in/hr)
 * Used when NOAA returns depth but we need intensity
 */
export function depthToIntensity(depthInches: number, durationMinutes: number): number {
  if (durationMinutes <= 0) return 0;
  return (depthInches / durationMinutes) * 60;
}

/**
 * Converts intensity values to depth (inches)
 */
export function intensityToDepth(intensityInPerHr: number, durationMinutes: number): number {
  return (intensityInPerHr * durationMinutes) / 60;
}
