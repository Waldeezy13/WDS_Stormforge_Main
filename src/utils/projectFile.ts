import type { ReturnPeriod, InterpolationMethod, RainfallMethod, ManualIdfCoefficientsByPeriod } from './atlas14';
import type { DrainageArea } from './drainageCalculations';
import type { StageStorageCurve } from './stageStorage';
import type { OutfallStructure } from './hydraulics';
import type { DrainageImportMetadata, ProjectMetadata } from './stormforgeImport';

export interface DesignPointSnapshot {
  id: string;
  name: string;
  note: string;
  toggles: Record<string, { isIncluded: boolean; isBypass: boolean }>;
}

export interface PlateSize {
  width: number;
  height: number;
}

export type OutfallStyle = 'orifice_plate';
export type PondMode = 'generic' | 'custom';

export interface StormforgeProjectState {
  cityId: number;
  selectedEvents: ReturnPeriod[];
  rainfallMethod: RainfallMethod;
  manualIdfCoefficients: ManualIdfCoefficientsByPeriod;
  interpolationMethod: InterpolationMethod;
  projectMetadata: ProjectMetadata | null;
  drainageAreas: DrainageArea[];
  designPoints: DesignPointSnapshot[];
  activeDesignPointId: string;
  calculationResults: Record<string, { returnPeriod: string; intensity: number; peakFlowCfs: number }[]>;
  drainageImportMetadata: DrainageImportMetadata | null;
  pondDims: { length: number; width: number; depth: number };
  pondInvertElevation: number;
  pondMode: PondMode;
  stageStorageCurve: StageStorageCurve | null;
  outfallStructures: OutfallStructure[];
  tailwaterElevations: Record<string, number>;
  outfallStyle: OutfallStyle;
  plateSize: PlateSize;
  autoSolveEnabled: boolean;
}

export interface StormforgeProjectFile {
  schema: 'stormforge-project';
  version: '1.0';
  exportedAtUtc: string;
  state: StormforgeProjectState;
}

export interface ProjectFileValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

const RETURN_PERIODS: ReturnPeriod[] = ['1yr', '2yr', '5yr', '10yr', '25yr', '50yr', '100yr', '500yr'];
const RAINFALL_METHODS: RainfallMethod[] = ['atlas14', 'manual-idf'];
const INTERPOLATION_METHODS: InterpolationMethod[] = ['linear', 'log-log'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function buildProjectFile(state: StormforgeProjectState): StormforgeProjectFile {
  return {
    schema: 'stormforge-project',
    version: '1.0',
    exportedAtUtc: new Date().toISOString(),
    state,
  };
}

export function validateProjectFile(data: unknown): ProjectFileValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isRecord(data)) {
    return { isValid: false, errors: ['Invalid JSON: expected an object'], warnings };
  }

  if (data.schema !== 'stormforge-project') {
    errors.push('Invalid project file schema');
  }

  if (data.version !== '1.0') {
    warnings.push(`Project file version ${String(data.version)} may require migration`);
  }

  if (!isRecord(data.state)) {
    errors.push('Missing state object');
    return { isValid: false, errors, warnings };
  }

  const state = data.state;

  if (typeof state.cityId !== 'number' || !Number.isFinite(state.cityId)) {
    errors.push('state.cityId must be a number');
  }

  if (!Array.isArray(state.selectedEvents)) {
    errors.push('state.selectedEvents must be an array');
  } else {
    const invalidEvents = state.selectedEvents.filter((e) => !RETURN_PERIODS.includes(e as ReturnPeriod));
    if (invalidEvents.length > 0) {
      errors.push(`Invalid return periods: ${invalidEvents.join(', ')}`);
    }
  }

  if (typeof state.rainfallMethod === 'undefined') {
    warnings.push('state.rainfallMethod missing; defaulting to atlas14');
  } else if (!RAINFALL_METHODS.includes(state.rainfallMethod as RainfallMethod)) {
    errors.push('state.rainfallMethod is invalid');
  }

  if (typeof state.manualIdfCoefficients === 'undefined') {
    warnings.push('state.manualIdfCoefficients missing; default municipal B/D/E values will be used');
  } else if (!isRecord(state.manualIdfCoefficients)) {
    errors.push('state.manualIdfCoefficients must be an object');
  }

  if (typeof state.interpolationMethod === 'undefined') {
    warnings.push('state.interpolationMethod missing; defaulting to log-log');
  } else if (!INTERPOLATION_METHODS.includes(state.interpolationMethod as InterpolationMethod)) {
    errors.push('state.interpolationMethod is invalid');
  }

  if (!Array.isArray(state.drainageAreas)) {
    errors.push('state.drainageAreas must be an array');
  }

  if (!Array.isArray(state.designPoints)) {
    errors.push('state.designPoints must be an array');
  }

  if (typeof state.activeDesignPointId !== 'string') {
    errors.push('state.activeDesignPointId must be a string');
  }

  if (!isRecord(state.pondDims)) {
    errors.push('state.pondDims must be an object');
  }

  if (typeof state.pondInvertElevation !== 'number' || !Number.isFinite(state.pondInvertElevation)) {
    errors.push('state.pondInvertElevation must be a number');
  }

  if (state.pondMode !== 'generic' && state.pondMode !== 'custom') {
    errors.push('state.pondMode is invalid');
  }

  if (!Array.isArray(state.outfallStructures)) {
    errors.push('state.outfallStructures must be an array');
  }

  if (!isRecord(state.tailwaterElevations)) {
    errors.push('state.tailwaterElevations must be an object');
  }

  if (state.outfallStyle !== 'orifice_plate') {
    warnings.push(`Unknown outfall style ${String(state.outfallStyle)}; defaulting to orifice_plate`);
  }

  if (!isRecord(state.plateSize)) {
    warnings.push('state.plateSize missing; default values will be used');
  }

  if (typeof state.autoSolveEnabled !== 'boolean') {
    warnings.push('state.autoSolveEnabled missing; default value will be used');
  }

  return { isValid: errors.length === 0, errors, warnings };
}

export async function parseProjectFile(file: File): Promise<{
  success: boolean;
  data?: StormforgeProjectFile;
  validation: ProjectFileValidationResult;
}> {
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const validation = validateProjectFile(parsed);

    if (!validation.isValid) {
      return { success: false, validation };
    }

    return {
      success: true,
      data: parsed as StormforgeProjectFile,
      validation,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      validation: {
        isValid: false,
        errors: [`Failed to parse project file: ${message}`],
        warnings: [],
      },
    };
  }
}

export function downloadProjectFile(projectFile: StormforgeProjectFile, filename: string): void {
  const json = JSON.stringify(projectFile, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}
