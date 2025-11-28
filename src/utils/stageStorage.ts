/**
 * Stage-Storage Curve Utilities
 * 
 * Provides interpolation functions for pond stage-storage relationships
 * using the end-area (prismoidal) method for accurate volume calculations.
 * 
 * CSV Format: elevation_ft,volume_cf,area_sf,perimeter_ft
 */

export interface StageStoragePoint {
  elevation: number;      // Stage elevation (ft)
  cumulativeVolume: number;  // Cumulative storage volume at this elevation (cf)
  area: number;           // Water surface area at this elevation (sf)
  perimeter: number;      // Perimeter at this elevation (ft)
}

export interface StageStorageCurve {
  name: string;           // Pond name for identification
  invertElevation: number; // Bottom of pond elevation (ft)
  points: StageStoragePoint[];
}

export interface ValidationError {
  row: number;
  field: string;
  message: string;
}

/**
 * Validate stage-storage curve data
 * - Elevations must be monotonically increasing
 * - Cumulative volumes must be non-decreasing (can be equal for flat sections)
 * - All values must be non-negative numbers
 */
export function validateStageStorageCurve(points: StageStoragePoint[]): ValidationError[] {
  const errors: ValidationError[] = [];

  if (points.length < 2) {
    errors.push({ row: 0, field: 'general', message: 'At least 2 data points are required' });
    return errors;
  }

  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    
    // Check for valid numbers
    if (isNaN(point.elevation) || point.elevation === null) {
      errors.push({ row: i, field: 'elevation', message: 'Elevation must be a valid number' });
    }
    if (isNaN(point.cumulativeVolume) || point.cumulativeVolume === null) {
      errors.push({ row: i, field: 'cumulativeVolume', message: 'Volume must be a valid number' });
    }
    if (isNaN(point.area) || point.area === null) {
      errors.push({ row: i, field: 'area', message: 'Area must be a valid number' });
    }
    if (isNaN(point.perimeter) || point.perimeter === null) {
      errors.push({ row: i, field: 'perimeter', message: 'Perimeter must be a valid number' });
    }

    // Check for non-negative values
    if (point.cumulativeVolume < 0) {
      errors.push({ row: i, field: 'cumulativeVolume', message: 'Volume cannot be negative' });
    }
    if (point.area < 0) {
      errors.push({ row: i, field: 'area', message: 'Area cannot be negative' });
    }
    if (point.perimeter < 0) {
      errors.push({ row: i, field: 'perimeter', message: 'Perimeter cannot be negative' });
    }

    // Check monotonically increasing elevation
    if (i > 0 && point.elevation <= points[i - 1].elevation) {
      errors.push({ 
        row: i, 
        field: 'elevation', 
        message: `Elevation must be greater than previous row (${points[i - 1].elevation} ft)` 
      });
    }

    // Check non-decreasing cumulative volume
    if (i > 0 && point.cumulativeVolume < points[i - 1].cumulativeVolume) {
      errors.push({ 
        row: i, 
        field: 'cumulativeVolume', 
        message: `Cumulative volume cannot decrease (previous: ${points[i - 1].cumulativeVolume} cf)` 
      });
    }
  }

  return errors;
}

/**
 * Get volume at a given elevation using end-area (prismoidal) method
 * V = (h/3) × (A1 + A2 + √(A1×A2)) for each segment
 * 
 * @param curve - The stage-storage curve
 * @param elevation - Target elevation (ft)
 * @returns Cumulative volume at the elevation (cf)
 */
export function getVolumeAtElevation(curve: StageStorageCurve, elevation: number): number {
  const { points } = curve;
  
  if (points.length === 0) return 0;
  
  // Below the first point
  if (elevation <= points[0].elevation) {
    return points[0].cumulativeVolume;
  }
  
  // Above the last point - extrapolate using last segment slope
  if (elevation >= points[points.length - 1].elevation) {
    const lastPoint = points[points.length - 1];
    if (points.length < 2) return lastPoint.cumulativeVolume;
    
    const _prevPoint = points[points.length - 2];
    const h = elevation - lastPoint.elevation;
    
    // Use end-area method with last known area (assumes area stays constant for extrapolation)
    const extraVolume = h * lastPoint.area;
    return lastPoint.cumulativeVolume + extraVolume;
  }
  
  // Find bracketing points
  let lowerIdx = 0;
  for (let i = 0; i < points.length - 1; i++) {
    if (elevation >= points[i].elevation && elevation < points[i + 1].elevation) {
      lowerIdx = i;
      break;
    }
  }
  
  const lower = points[lowerIdx];
  const upper = points[lowerIdx + 1];
  
  // Interpolate area at the target elevation (linear interpolation)
  const t = (elevation - lower.elevation) / (upper.elevation - lower.elevation);
  const areaAtElevation = lower.area + t * (upper.area - lower.area);
  
  // Calculate volume from lower point to target elevation using end-area method
  const h = elevation - lower.elevation;
  const endAreaVolume = (h / 3) * (lower.area + areaAtElevation + Math.sqrt(lower.area * areaAtElevation));
  
  return lower.cumulativeVolume + endAreaVolume;
}

/**
 * Get elevation at a given cumulative volume using inverse interpolation
 * Uses the end-area method to accurately solve for elevation
 * 
 * @param curve - The stage-storage curve
 * @param volume - Target cumulative volume (cf)
 * @returns Elevation at the volume (ft)
 */
export function getElevationAtVolume(curve: StageStorageCurve, volume: number): number {
  const { points } = curve;
  
  if (points.length === 0) return curve.invertElevation;
  
  // Below the first point's volume
  if (volume <= points[0].cumulativeVolume) {
    return points[0].elevation;
  }
  
  // Above the last point's volume - extrapolate
  if (volume >= points[points.length - 1].cumulativeVolume) {
    const lastPoint = points[points.length - 1];
    if (lastPoint.area <= 0) return lastPoint.elevation;
    
    // Simple extrapolation: assume constant area at top
    const extraVolume = volume - lastPoint.cumulativeVolume;
    const extraHeight = extraVolume / lastPoint.area;
    return lastPoint.elevation + extraHeight;
  }
  
  // Find bracketing points by volume
  let lowerIdx = 0;
  for (let i = 0; i < points.length - 1; i++) {
    if (volume >= points[i].cumulativeVolume && volume < points[i + 1].cumulativeVolume) {
      lowerIdx = i;
      break;
    }
  }
  
  const lower = points[lowerIdx];
  const upper = points[lowerIdx + 1];
  
  // For end-area method, we need to solve for h in:
  // V = V_lower + (h/3) × (A_lower + A(h) + √(A_lower × A(h)))
  // where A(h) is linearly interpolated between A_lower and A_upper
  
  // This is a complex equation, so we use iterative bisection method
  const targetVolume = volume - lower.cumulativeVolume;
  const totalH = upper.elevation - lower.elevation;
  
  // Binary search for the correct height
  let hLow = 0;
  let hHigh = totalH;
  const tolerance = 0.0001; // ft precision
  const maxIterations = 50;
  
  for (let iter = 0; iter < maxIterations; iter++) {
    const hMid = (hLow + hHigh) / 2;
    
    // Interpolate area at hMid
    const t = hMid / totalH;
    const areaMid = lower.area + t * (upper.area - lower.area);
    
    // Calculate volume using end-area method
    const volMid = (hMid / 3) * (lower.area + areaMid + Math.sqrt(lower.area * areaMid));
    
    if (Math.abs(volMid - targetVolume) < tolerance) {
      return lower.elevation + hMid;
    }
    
    if (volMid < targetVolume) {
      hLow = hMid;
    } else {
      hHigh = hMid;
    }
  }
  
  // Return best estimate
  return lower.elevation + (hLow + hHigh) / 2;
}

/**
 * Get area at a given elevation using linear interpolation
 * 
 * @param curve - The stage-storage curve
 * @param elevation - Target elevation (ft)
 * @returns Surface area at the elevation (sf)
 */
export function getAreaAtElevation(curve: StageStorageCurve, elevation: number): number {
  const { points } = curve;
  
  if (points.length === 0) return 0;
  
  if (elevation <= points[0].elevation) {
    return points[0].area;
  }
  
  if (elevation >= points[points.length - 1].elevation) {
    return points[points.length - 1].area;
  }
  
  // Find bracketing points
  for (let i = 0; i < points.length - 1; i++) {
    if (elevation >= points[i].elevation && elevation < points[i + 1].elevation) {
      const lower = points[i];
      const upper = points[i + 1];
      const t = (elevation - lower.elevation) / (upper.elevation - lower.elevation);
      return lower.area + t * (upper.area - lower.area);
    }
  }
  
  return points[points.length - 1].area;
}

/**
 * Get perimeter at a given elevation using linear interpolation
 * 
 * @param curve - The stage-storage curve
 * @param elevation - Target elevation (ft)
 * @returns Perimeter at the elevation (ft)
 */
export function getPerimeterAtElevation(curve: StageStorageCurve, elevation: number): number {
  const { points } = curve;
  
  if (points.length === 0) return 0;
  
  if (elevation <= points[0].elevation) {
    return points[0].perimeter;
  }
  
  if (elevation >= points[points.length - 1].elevation) {
    return points[points.length - 1].perimeter;
  }
  
  // Find bracketing points
  for (let i = 0; i < points.length - 1; i++) {
    if (elevation >= points[i].elevation && elevation < points[i + 1].elevation) {
      const lower = points[i];
      const upper = points[i + 1];
      const t = (elevation - lower.elevation) / (upper.elevation - lower.elevation);
      return lower.perimeter + t * (upper.perimeter - lower.perimeter);
    }
  }
  
  return points[points.length - 1].perimeter;
}

/**
 * Parse CSV text into stage-storage points
 * Supports comma or tab delimited, auto-detects headers
 * Expected columns: elevation, volume (cumulative), area, perimeter
 * 
 * @param csvText - Raw CSV text
 * @returns Parsed points and any parse errors
 */
export function parseStageStorageCSV(csvText: string): { 
  points: StageStoragePoint[]; 
  errors: string[];
  hasHeaders: boolean;
} {
  const errors: string[] = [];
  const points: StageStoragePoint[] = [];
  
  // Split into lines and filter empty
  const lines = csvText.trim().split(/\r?\n/).filter(line => line.trim());
  
  if (lines.length === 0) {
    errors.push('No data found in CSV');
    return { points, errors, hasHeaders: false };
  }
  
  // Detect delimiter (comma or tab)
  const firstLine = lines[0];
  const delimiter = firstLine.includes('\t') ? '\t' : ',';
  
  // Check if first row is headers (contains non-numeric text)
  const firstRowValues = firstLine.split(delimiter).map(v => v.trim());
  const hasHeaders = firstRowValues.some(v => isNaN(parseFloat(v)) && v.length > 0);
  
  const dataStartRow = hasHeaders ? 1 : 0;
  
  // Parse data rows
  for (let i = dataStartRow; i < lines.length; i++) {
    const values = lines[i].split(delimiter).map(v => v.trim());
    
    if (values.length < 4) {
      errors.push(`Row ${i + 1}: Expected 4 columns (elevation, volume, area, perimeter), got ${values.length}`);
      continue;
    }
    
    const elevation = parseFloat(values[0]);
    const cumulativeVolume = parseFloat(values[1]);
    const area = parseFloat(values[2]);
    const perimeter = parseFloat(values[3]);
    
    if (isNaN(elevation) || isNaN(cumulativeVolume) || isNaN(area) || isNaN(perimeter)) {
      errors.push(`Row ${i + 1}: Invalid numeric values`);
      continue;
    }
    
    points.push({ elevation, cumulativeVolume, area, perimeter });
  }
  
  return { points, errors, hasHeaders };
}

/**
 * Convert stage-storage curve to CSV text
 * 
 * @param curve - The stage-storage curve
 * @returns CSV text with headers
 */
export function stageStorageToCSV(curve: StageStorageCurve): string {
  const header = 'elevation_ft,volume_cf,area_sf,perimeter_ft';
  const rows = curve.points.map(p => 
    `${p.elevation},${p.cumulativeVolume},${p.area},${p.perimeter}`
  );
  return [header, ...rows].join('\n');
}

/**
 * Get summary statistics for a stage-storage curve
 */
export function getStageStorageStats(curve: StageStorageCurve): {
  minElevation: number;
  maxElevation: number;
  totalDepth: number;
  maxVolume: number;
  maxArea: number;
  maxPerimeter: number;
} {
  if (curve.points.length === 0) {
    return {
      minElevation: curve.invertElevation,
      maxElevation: curve.invertElevation,
      totalDepth: 0,
      maxVolume: 0,
      maxArea: 0,
      maxPerimeter: 0
    };
  }
  
  const elevations = curve.points.map(p => p.elevation);
  const volumes = curve.points.map(p => p.cumulativeVolume);
  const areas = curve.points.map(p => p.area);
  const perimeters = curve.points.map(p => p.perimeter);
  
  const minElevation = Math.min(...elevations);
  const maxElevation = Math.max(...elevations);
  
  return {
    minElevation,
    maxElevation,
    totalDepth: maxElevation - minElevation,
    maxVolume: Math.max(...volumes),
    maxArea: Math.max(...areas),
    maxPerimeter: Math.max(...perimeters)
  };
}

/**
 * Create a default empty stage-storage curve
 */
export function createEmptyStageStorageCurve(name: string = 'New Pond', invertElevation: number = 100): StageStorageCurve {
  return {
    name,
    invertElevation,
    points: [
      { elevation: invertElevation, cumulativeVolume: 0, area: 0, perimeter: 0 },
      { elevation: invertElevation + 1, cumulativeVolume: 1000, area: 1000, perimeter: 130 },
    ]
  };
}
