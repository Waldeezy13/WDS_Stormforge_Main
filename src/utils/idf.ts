/**
 * IDF (Intensity-Duration-Frequency) Interpolation Module
 * 
 * Provides interpolation methods for Atlas 14 rainfall data:
 * - Linear interpolation (simple, fast)
 * - Log-log interpolation (more accurate for IDF curves)
 */

import { ReturnPeriod, RainfallData } from './atlas14';

export type InterpolationMethod = 'linear' | 'log-log';

/**
 * Constants for unit conversions
 */
export const CONSTANTS = {
  GRAVITY_FT_PER_S2: 32.2,
  CUBIC_FEET_PER_ACRE_FOOT: 43560,
  SECONDS_PER_MINUTE: 60,
  MINUTES_PER_HOUR: 60,
} as const;

/**
 * Converts rainfall depth (inches) to intensity (in/hr)
 */
export function depthToIntensity(depthInches: number, durationMinutes: number): number {
  if (durationMinutes <= 0) return 0;
  return (depthInches / durationMinutes) * CONSTANTS.MINUTES_PER_HOUR;
}

/**
 * Converts intensity (in/hr) to depth (inches) for a given duration
 */
export function intensityToDepth(intensityInPerHr: number, durationMinutes: number): number {
  return (intensityInPerHr * durationMinutes) / CONSTANTS.MINUTES_PER_HOUR;
}

/**
 * Linear interpolation between two points
 */
function linearInterpolate(
  x: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  if (x2 === x1) return y1;
  const t = (x - x1) / (x2 - x1);
  return y1 + t * (y2 - y1);
}

/**
 * Log-log interpolation between two points
 * Uses: log(y) = log(y1) + (log(y2) - log(y1)) * (log(x) - log(x1)) / (log(x2) - log(x1))
 */
function logLogInterpolate(
  x: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  if (x <= 0 || x1 <= 0 || x2 <= 0 || y1 <= 0 || y2 <= 0) {
    // Fall back to linear if any value is non-positive
    return linearInterpolate(x, x1, y1, x2, y2);
  }
  
  if (x2 === x1) return y1;
  
  const logX = Math.log(x);
  const logX1 = Math.log(x1);
  const logX2 = Math.log(x2);
  const logY1 = Math.log(y1);
  const logY2 = Math.log(y2);
  
  if (logX2 === logX1) return y1;
  
  const t = (logX - logX1) / (logX2 - logX1);
  const logY = logY1 + t * (logY2 - logY1);
  
  return Math.exp(logY);
}

/**
 * Gets intensity for a specific duration and return period using the specified interpolation method
 * 
 * @param rainfallData - Array of RainfallData points from Atlas 14
 * @param returnPeriod - Storm frequency (e.g., '2yr', '10yr', '100yr')
 * @param durationMinutes - Requested duration in minutes
 * @param method - Interpolation method ('linear' or 'log-log')
 * @returns Intensity in inches per hour
 */
export function getIntensityInPerHr(
  rainfallData: RainfallData[],
  returnPeriod: ReturnPeriod,
  durationMinutes: number,
  method: InterpolationMethod = 'log-log'
): number {
  if (rainfallData.length === 0) {
    console.warn('No rainfall data provided');
    return 0;
  }

  // For duration 0 or negative, use a very small positive duration for extrapolation
  // This allows the IDF curve to extrapolate to near-zero durations
  if (durationMinutes <= 0) {
    // Use 0.1 minutes as minimum practical duration for extrapolation
    durationMinutes = 0.1;
  }

  // Filter to only data points that have valid intensity for this return period
  const validData = rainfallData
    .filter(d => d.intensities[returnPeriod] > 0)
    .sort((a, b) => a.durationMinutes - b.durationMinutes);

  if (validData.length === 0) {
    console.warn(`No valid data for return period ${returnPeriod}`);
    return 0;
  }

  // Exact match - check for exact duration match first
  const exactMatch = validData.find(d => d.durationMinutes === durationMinutes);
  if (exactMatch) {
    return exactMatch.intensities[returnPeriod];
  }

  // Find bounding points
  const lower = validData
    .slice()
    .reverse()
    .find(d => d.durationMinutes <= durationMinutes);
  const upper = validData.find(d => d.durationMinutes >= durationMinutes);

  // Extrapolation cases
  if (!lower && !upper) {
    console.warn(`No data points found for duration ${durationMinutes} minutes`);
    return 0;
  }

  if (!lower) {
    // Below minimum duration - extrapolate from first two points
    const first = validData[0];
    const second = validData[1];
    if (!second) return first.intensities[returnPeriod];
    
    const extrapolated = method === 'log-log'
      ? logLogInterpolate(
          durationMinutes,
          first.durationMinutes,
          first.intensities[returnPeriod],
          second.durationMinutes,
          second.intensities[returnPeriod]
        )
      : linearInterpolate(
          durationMinutes,
          first.durationMinutes,
          first.intensities[returnPeriod],
          second.durationMinutes,
          second.intensities[returnPeriod]
        );
    
    if (durationMinutes < first.durationMinutes * 0.5) {
      console.warn(
        `Extrapolating significantly below minimum duration: ${durationMinutes} min (min: ${first.durationMinutes} min)`
      );
    }
    return Math.max(0, extrapolated);
  }

  if (!upper) {
    // Above maximum duration - extrapolate from last two points
    const last = validData[validData.length - 1];
    const secondLast = validData[validData.length - 2];
    if (!secondLast) return last.intensities[returnPeriod];
    
    const extrapolated = method === 'log-log'
      ? logLogInterpolate(
          durationMinutes,
          secondLast.durationMinutes,
          secondLast.intensities[returnPeriod],
          last.durationMinutes,
          last.intensities[returnPeriod]
        )
      : linearInterpolate(
          durationMinutes,
          secondLast.durationMinutes,
          secondLast.intensities[returnPeriod],
          last.durationMinutes,
          last.intensities[returnPeriod]
        );
    
    if (durationMinutes > last.durationMinutes * 2) {
      console.warn(
        `Extrapolating significantly above maximum duration: ${durationMinutes} min (max: ${last.durationMinutes} min)`
      );
    }
    return Math.max(0, extrapolated);
  }

  // Interpolation between two points
  if (lower.durationMinutes === upper.durationMinutes) {
    return lower.intensities[returnPeriod];
  }

  return method === 'log-log'
    ? logLogInterpolate(
        durationMinutes,
        lower.durationMinutes,
        lower.intensities[returnPeriod],
        upper.durationMinutes,
        upper.intensities[returnPeriod]
      )
    : linearInterpolate(
        durationMinutes,
        lower.durationMinutes,
        lower.intensities[returnPeriod],
        upper.durationMinutes,
        upper.intensities[returnPeriod]
      );
}

/**
 * Builds an IDF curve for a specific return period with specified step size
 * 
 * @param rainfallData - Array of RainfallData points from Atlas 14
 * @param returnPeriod - Storm frequency
 * @param minDurationMinutes - Minimum duration (default: 1)
 * @param maxDurationMinutes - Maximum duration (default: 1440 = 24 hours)
 * @param stepMinutes - Step size in minutes (default: 1)
 * @param method - Interpolation method
 * @returns Array of { durationMinutes, intensityInPerHr } points
 */
export function buildIdfCurve(
  rainfallData: RainfallData[],
  returnPeriod: ReturnPeriod,
  minDurationMinutes: number = 1,
  maxDurationMinutes: number = 1440,
  stepMinutes: number = 1,
  method: InterpolationMethod = 'log-log'
): Array<{ durationMinutes: number; intensityInPerHr: number }> {
  const curve: Array<{ durationMinutes: number; intensityInPerHr: number }> = [];
  
  for (let duration = minDurationMinutes; duration <= maxDurationMinutes; duration += stepMinutes) {
    const intensity = getIntensityInPerHr(rainfallData, returnPeriod, duration, method);
    curve.push({
      durationMinutes: duration,
      intensityInPerHr: intensity,
    });
  }
  
  return curve;
}

/**
 * Converts RainfallData format to Atlas14Table format (for compatibility)
 */
export function convertToAtlas14Table(
  rainfallData: RainfallData[]
): Record<ReturnPeriod, Array<{ durationMinutes: number; depthInches: number }>> {
  const table: Record<ReturnPeriod, Array<{ durationMinutes: number; depthInches: number }>> = {
    '2yr': [],
    '5yr': [],
    '10yr': [],
    '25yr': [],
    '50yr': [],
    '100yr': [],
  };

  const returnPeriods: ReturnPeriod[] = ['2yr', '5yr', '10yr', '25yr', '50yr', '100yr'];

  for (const data of rainfallData) {
    for (const rp of returnPeriods) {
      if (data.intensities[rp] > 0) {
        const depthInches = intensityToDepth(data.intensities[rp], data.durationMinutes);
        table[rp].push({
          durationMinutes: data.durationMinutes,
          depthInches,
        });
      }
    }
  }

  // Sort each return period by duration
  for (const rp of returnPeriods) {
    table[rp].sort((a, b) => a.durationMinutes - b.durationMinutes);
  }

  return table;
}


