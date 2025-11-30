/**
 * Stormforge JSON Import Utilities
 * 
 * Handles parsing and mapping of JSON files exported from the 
 * Waldo.C3D.Stormforge AutoCAD plugin.
 */

import type { DrainageArea, DrainageImportSource } from './drainageCalculations';

// ============================================================================
// Types matching C# DTOs from Waldo.C3D.Stormforge
// ============================================================================

/**
 * Root object for Stormforge JSON export.
 * Matches: Waldo.C3D.Stormforge/Models/StormforgeExportRoot.cs
 */
export interface StormforgeExportRoot {
  schemaVersion: string;        // e.g., "1.0"
  drawingName: string;          // e.g., "ProjectDrainage.dwg"
  drawingPath: string;          // Full path to DWG file
  exportedAtUtc: string;        // ISO timestamp
  drainageAreas: DrainageAreaExportDto[];
}

/**
 * Single drainage area from Civil 3D export.
 * Matches: Waldo.C3D.Stormforge/Models/DrainageAreaExportDto.cs
 */
export interface DrainageAreaExportDto {
  // Parcel info (from Civil 3D Parcel API)
  parcelName: string;
  parcelHandle: string;
  parcelNumber?: number;
  siteName?: string;
  areaSF: number;
  areaAC: number;
  perimeter?: number;

  // Identity fields (from WD_Drainage property set)
  daId: string;
  targetNodeId: string;

  // Design Inputs (from WD_Drainage property set)
  runoffC: number | null;
  tcMin: number | null;
  landUse: string;
  pctImpervious: number | null;
  soilGroup: string;
  curveNumber?: number | null;
  hydroMethod: string;
  designStormYR: number | null;
  designDurationMin: number | null;
  
  // Return periods selected in C3D (e.g., [2, 10, 25, 100])
  returnPeriods?: number[];

  // Design Outputs (from WD_Drainage property set)
  iDesignInPerHr: number | null;
  qDesignCFS: number | null;

  // Per-storm results (for detailed round-trip to C3D)
  // These are computed by Stormforge and can be used to update C3D property sets
  stormResults?: {
    returnPeriod: number;     // e.g., 1, 2, 5, 10, 25, 50, 100, 500
    intensity: number;        // in/hr
    peakFlow: number;         // cfs
  }[];

  // Meta (from WD_Drainage property set)
  excludeFromExport: boolean;
  notes: string;
}

// ============================================================================
// Import Metadata (stored in localStorage)
// ============================================================================

export interface DrainageImportInfo {
  sourceFile: string;           // Filename that was imported
  importedAt: string;           // ISO timestamp of import
  itemCount: number;            // Number of areas imported
  sourceDrawing?: string;       // DWG filename if available
  totalAreaAc?: number;         // Sum of imported acreage
  schemaVersion?: string;       // Export schema version
}

export interface DrainageImportMetadata {
  existing: DrainageImportInfo | null;
  proposed: DrainageImportInfo | null;
}

export const IMPORT_METADATA_KEY = 'wds-stormforge-drainage-import-meta';

// ============================================================================
// Validation
// ============================================================================

export interface ImportValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validates a parsed Stormforge export JSON.
 */
export function validateStormforgeExport(data: unknown): ImportValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!data || typeof data !== 'object') {
    errors.push('Invalid JSON: expected an object');
    return { isValid: false, errors, warnings };
  }

  const root = data as Partial<StormforgeExportRoot>;

  // Check required root fields
  const COMPATIBLE_VERSIONS = ['1.0', '1.1'];
  if (!root.schemaVersion) {
    warnings.push('Missing schemaVersion - assuming compatible format');
  } else if (!COMPATIBLE_VERSIONS.includes(root.schemaVersion)) {
    warnings.push(`Schema version ${root.schemaVersion} may not be fully compatible`);
  }

  if (!root.drainageAreas) {
    errors.push('Missing drainageAreas array');
    return { isValid: false, errors, warnings };
  }

  if (!Array.isArray(root.drainageAreas)) {
    errors.push('drainageAreas must be an array');
    return { isValid: false, errors, warnings };
  }

  if (root.drainageAreas.length === 0) {
    errors.push('No drainage areas found in export');
    return { isValid: false, errors, warnings };
  }

  // Validate individual areas
  root.drainageAreas.forEach((area, index) => {
    const prefix = `Area ${index + 1}`;
    
    if (!area.parcelName && !area.daId) {
      warnings.push(`${prefix}: No name or ID - will use generic name`);
    }

    if (area.areaAC === undefined || area.areaAC === null || area.areaAC <= 0) {
      warnings.push(`${prefix} (${area.parcelName || 'unnamed'}): Invalid or zero area`);
    }

    if (area.runoffC === null || area.runoffC === undefined) {
      warnings.push(`${prefix} (${area.parcelName || 'unnamed'}): Missing C-factor, will default to 0`);
    } else if (area.runoffC < 0 || area.runoffC > 1) {
      warnings.push(`${prefix} (${area.parcelName || 'unnamed'}): C-factor ${area.runoffC} outside valid range 0-1`);
    }

    if (area.tcMin === null || area.tcMin === undefined) {
      warnings.push(`${prefix} (${area.parcelName || 'unnamed'}): Missing Tc, will default to 10 min`);
    } else if (area.tcMin <= 0) {
      warnings.push(`${prefix} (${area.parcelName || 'unnamed'}): Invalid Tc ${area.tcMin}`);
    }
  });

  return { isValid: errors.length === 0, errors, warnings };
}

// ============================================================================
// Mapping Functions
// ============================================================================

/**
 * Maps a single Stormforge DTO to a DrainageArea.
 */
export function mapDtoToDrainageArea(
  dto: DrainageAreaExportDto,
  type: 'existing' | 'proposed',
  index: number,
  sourceFile: string,
  sourceDrawing?: string
): DrainageArea {
  // Generate unique ID from daId, parcelHandle, or fallback
  const id = dto.daId || dto.parcelHandle || `imported-${type}-${index}-${Date.now()}`;
  
  // Determine name
  const name = dto.parcelName || dto.daId || `Imported Area ${index + 1}`;

  // Build import source tracking
  const importSource: DrainageImportSource = {
    type: 'C3D',
    parcelHandle: dto.parcelHandle || undefined,
    daId: dto.daId || undefined,
    importedAt: new Date().toISOString(),
    sourceFile,
    sourceDrawing,
    landUse: dto.landUse || undefined,
    soilGroup: dto.soilGroup || undefined,
    pctImpervious: dto.pctImpervious ?? undefined,
    targetNodeId: dto.targetNodeId || undefined,
    hydroMethod: dto.hydroMethod || undefined,
    designStormYR: dto.designStormYR ?? undefined,
    notes: dto.notes || undefined,
    // Preserve full C3D data for round-trip export
    rawC3DData: dto,
  };

  return {
    id,
    type,
    name,
    areaAcres: Math.round((dto.areaAC ?? 0) * 100) / 100, // Round to 2 decimal places
    cFactor: Math.round((dto.runoffC ?? 0) * 100) / 100,  // Round to 2 decimal places
    tcMinutes: dto.tcMin ?? 10,
    isIncluded: !dto.excludeFromExport,
    importSource,
  };
}

/**
 * Maps all DTOs from a Stormforge export to DrainageAreas.
 */
export function mapExportToDrainageAreas(
  exportData: StormforgeExportRoot,
  type: 'existing' | 'proposed',
  sourceFile: string
): DrainageArea[] {
  const sourceDrawing = exportData.drawingName || undefined;

  return exportData.drainageAreas.map((dto, index) =>
    mapDtoToDrainageArea(dto, type, index, sourceFile, sourceDrawing)
  );
}

// ============================================================================
// Merge Logic
// ============================================================================

export interface MergeResult {
  areas: DrainageArea[];
  added: number;
  updated: number;
  unchanged: number;
}

/**
 * Merges imported areas with existing areas.
 * - Areas with matching parcelHandle are updated
 * - New areas are appended
 * - Existing areas of other types are preserved
 */
export function mergeImportedAreas(
  existingAreas: DrainageArea[],
  importedAreas: DrainageArea[],
  targetType: 'existing' | 'proposed'
): MergeResult {
  let added = 0;
  let updated = 0;
  let unchanged = 0;

  // Start with areas of the OTHER type (always preserved)
  const result: DrainageArea[] = existingAreas.filter(a => a.type !== targetType);
  unchanged = result.length;

  // Get existing areas of the target type
  const existingOfType = existingAreas.filter(a => a.type === targetType);
  
  // Create a map of existing areas by parcelHandle for quick lookup
  const existingByHandle = new Map<string, DrainageArea>();
  existingOfType.forEach(area => {
    if (area.importSource?.parcelHandle) {
      existingByHandle.set(area.importSource.parcelHandle, area);
    }
  });

  // Track which existing areas were matched
  const matchedHandles = new Set<string>();

  // Process imported areas
  for (const imported of importedAreas) {
    const handle = imported.importSource?.parcelHandle;
    
    if (handle && existingByHandle.has(handle)) {
      // Update existing area
      const existing = existingByHandle.get(handle)!;
      result.push({
        ...imported,
        id: existing.id, // Preserve original ID
      });
      matchedHandles.add(handle);
      updated++;
    } else {
      // Add new area
      result.push(imported);
      added++;
    }
  }

  // Preserve existing areas that weren't matched (manual entries)
  for (const existing of existingOfType) {
    const handle = existing.importSource?.parcelHandle;
    if (!handle || !matchedHandles.has(handle)) {
      // This is either a manual entry or an unmatched import
      if (!existing.importSource || existing.importSource.type === 'MANUAL') {
        result.push(existing);
        unchanged++;
      }
      // Note: Old C3D imports that weren't in new import are dropped
    }
  }

  return { areas: result, added, updated, unchanged };
}

// ============================================================================
// Metadata Storage
// ============================================================================

/**
 * Gets the current import metadata from localStorage.
 */
export function getImportMetadata(): DrainageImportMetadata {
  if (typeof window === 'undefined') {
    return { existing: null, proposed: null };
  }

  try {
    const raw = localStorage.getItem(IMPORT_METADATA_KEY);
    if (!raw) return { existing: null, proposed: null };
    return JSON.parse(raw) as DrainageImportMetadata;
  } catch {
    return { existing: null, proposed: null };
  }
}

/**
 * Updates import metadata for a specific type.
 */
export function updateImportMetadata(
  type: 'existing' | 'proposed',
  info: DrainageImportInfo
): void {
  if (typeof window === 'undefined') return;

  const current = getImportMetadata();
  current[type] = info;
  localStorage.setItem(IMPORT_METADATA_KEY, JSON.stringify(current));
}

/**
 * Clears import metadata for a specific type.
 */
export function clearImportMetadata(type: 'existing' | 'proposed'): void {
  if (typeof window === 'undefined') return;

  const current = getImportMetadata();
  current[type] = null;
  localStorage.setItem(IMPORT_METADATA_KEY, JSON.stringify(current));
}

// ============================================================================
// Return Period Extraction
// ============================================================================

import type { ReturnPeriod } from './atlas14';

/**
 * Maps numeric return periods to ReturnPeriod strings.
 */
const RETURN_PERIOD_MAP: Record<number, ReturnPeriod> = {
  1: '1yr',
  2: '2yr',
  5: '5yr',
  10: '10yr',
  25: '25yr',
  50: '50yr',
  100: '100yr',
  500: '500yr',
};

/**
 * Extracts return periods from C3D export data.
 * Aggregates all returnPeriods arrays across drainage areas to find common selections.
 */
export function extractReturnPeriods(exportData: StormforgeExportRoot): {
  detected: ReturnPeriod[];
  allPeriods: number[];
} {
  const allPeriods = new Set<number>();
  
  for (const area of exportData.drainageAreas) {
    if (area.returnPeriods && Array.isArray(area.returnPeriods)) {
      for (const period of area.returnPeriods) {
        allPeriods.add(period);
      }
    }
    // Also check designStormYR as fallback
    if (area.designStormYR && typeof area.designStormYR === 'number') {
      allPeriods.add(area.designStormYR);
    }
  }

  const detected: ReturnPeriod[] = [];
  const sortedPeriods = Array.from(allPeriods).sort((a, b) => a - b);
  
  for (const period of sortedPeriods) {
    const mapped = RETURN_PERIOD_MAP[period];
    if (mapped) {
      detected.push(mapped);
    }
  }

  return { detected, allPeriods: sortedPeriods };
}

// ============================================================================
// Export to Stormforge JSON
// ============================================================================

export interface DrainageCalculationResult {
  areaId: string;
  returnPeriod: ReturnPeriod;
  intensity: number;
  peakFlowCfs: number;
}

export interface ProjectMetadata {
  drawingName?: string;
  drawingPath?: string;
  schemaVersion?: string;
  originalExportDate?: string;
}

/**
 * Exports current drainage areas back to Stormforge JSON format.
 * Merges original C3D data with updated design outputs.
 */
export function exportToStormforgeJson(
  areas: DrainageArea[],
  calculationResults: Map<string, DrainageCalculationResult[]>,
  projectMeta?: ProjectMetadata
): StormforgeExportRoot {
  const drainageAreas: DrainageAreaExportDto[] = areas.map(area => {
    // Start with raw C3D data if available, otherwise build from scratch
    const rawData = area.importSource?.rawC3DData;
    
    // Get calculation results for this area
    const areaResults = calculationResults.get(area.id) || [];
    
    // Find the max intensity and flow from results (typically the controlling storm)
    let maxIntensity: number | null = null;
    let maxFlow: number | null = null;
    
    // Build per-storm results array
    const stormResults: { returnPeriod: number; intensity: number; peakFlow: number }[] = [];
    
    for (const result of areaResults) {
      // Parse return period number from string like "2yr", "100yr"
      const periodMatch = result.returnPeriod.match(/^(\d+)yr$/);
      const periodNum = periodMatch ? parseInt(periodMatch[1], 10) : 0;
      
      if (periodNum > 0) {
        stormResults.push({
          returnPeriod: periodNum,
          intensity: Math.round(result.intensity * 100) / 100,  // Round to 2 decimals
          peakFlow: Math.round(result.peakFlowCfs * 100) / 100, // Round to 2 decimals
        });
      }
      
      if (maxIntensity === null || result.intensity > maxIntensity) {
        maxIntensity = result.intensity;
      }
      if (maxFlow === null || result.peakFlowCfs > maxFlow) {
        maxFlow = result.peakFlowCfs;
      }
    }
    
    // Sort storm results by return period
    stormResults.sort((a, b) => a.returnPeriod - b.returnPeriod);
    
    // Extract return periods from results
    const returnPeriods = stormResults.map(r => r.returnPeriod);

    // Build the export DTO
    const dto: DrainageAreaExportDto = {
      // Parcel info - preserve from raw or use current
      parcelName: rawData?.parcelName ?? area.name,
      parcelHandle: rawData?.parcelHandle ?? area.importSource?.parcelHandle ?? '',
      parcelNumber: rawData?.parcelNumber,
      siteName: rawData?.siteName,
      areaSF: area.areaAcres * 43560, // Convert acres to SF
      areaAC: area.areaAcres,
      perimeter: rawData?.perimeter,
      
      // Identity fields
      daId: rawData?.daId ?? area.importSource?.daId ?? area.id,
      targetNodeId: rawData?.targetNodeId ?? area.importSource?.targetNodeId ?? '',
      
      // Design Inputs - use current values where appropriate
      runoffC: area.cFactor,
      tcMin: area.tcMinutes,
      landUse: rawData?.landUse ?? area.importSource?.landUse ?? '',
      pctImpervious: rawData?.pctImpervious ?? area.importSource?.pctImpervious ?? null,
      soilGroup: rawData?.soilGroup ?? area.importSource?.soilGroup ?? '',
      curveNumber: rawData?.curveNumber,
      hydroMethod: rawData?.hydroMethod ?? area.importSource?.hydroMethod ?? 'Rational_Method',
      designStormYR: rawData?.designStormYR ?? area.importSource?.designStormYR ?? null,
      designDurationMin: rawData?.designDurationMin ?? null,
      returnPeriods: returnPeriods.length > 0 ? returnPeriods : (rawData?.returnPeriods ?? []),
      
      // Design Outputs - updated from calculations
      iDesignInPerHr: maxIntensity !== null ? Math.round(maxIntensity * 100) / 100 : null,
      qDesignCFS: maxFlow !== null ? Math.round(maxFlow * 100) / 100 : null,
      
      // Per-storm results for detailed C3D import
      stormResults: stormResults.length > 0 ? stormResults : undefined,
      
      // Meta
      excludeFromExport: !area.isIncluded,
      notes: rawData?.notes ?? area.importSource?.notes ?? '',
    };

    return dto;
  });

  return {
    schemaVersion: projectMeta?.schemaVersion ?? '1.1',  // Bump version for new stormResults field
    drawingName: projectMeta?.drawingName ?? 'Stormforge_Export.json',
    drawingPath: projectMeta?.drawingPath ?? '',
    exportedAtUtc: new Date().toISOString(),
    drainageAreas,
  };
}

/**
 * Downloads a Stormforge export as a JSON file.
 */
export function downloadStormforgeJson(exportData: StormforgeExportRoot, filename?: string): void {
  const json = JSON.stringify(exportData, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = filename ?? `${exportData.drawingName.replace('.dwg', '')}_export.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  URL.revokeObjectURL(url);
}

// ============================================================================
// File Parsing
// ============================================================================

/**
 * Parses a Stormforge JSON file and returns validated data.
 */
export async function parseStormforgeFile(file: File): Promise<{
  success: boolean;
  data?: StormforgeExportRoot;
  validation: ImportValidationResult;
}> {
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const validation = validateStormforgeExport(parsed);

    if (!validation.isValid) {
      return { success: false, validation };
    }

    return {
      success: true,
      data: parsed as StormforgeExportRoot,
      validation,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return {
      success: false,
      validation: {
        isValid: false,
        errors: [`Failed to parse JSON: ${message}`],
        warnings: [],
      },
    };
  }
}
