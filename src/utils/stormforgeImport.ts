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
  areaSF: number;
  areaAC: number;

  // Identity fields (from WD_Drainage property set)
  daId: string;
  targetNodeId: string;

  // Design Inputs (from WD_Drainage property set)
  runoffC: number | null;
  tcMin: number | null;
  landUse: string;
  pctImpervious: number | null;
  soilGroup: string;
  hydroMethod: string;
  designStormYR: number | null;
  designDurationMin: number | null;

  // Design Outputs (from WD_Drainage property set)
  iDesignInPerHr: number | null;
  qDesignCFS: number | null;

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
  if (!root.schemaVersion) {
    warnings.push('Missing schemaVersion - assuming compatible format');
  } else if (root.schemaVersion !== '1.0') {
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
  };

  return {
    id,
    type,
    name,
    areaAcres: dto.areaAC ?? 0,
    cFactor: dto.runoffC ?? 0,
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
