import { getIntensity, InterpolationMethod, RainfallMethod, ReturnPeriod, type ManualIdfCoefficientsByPeriod } from '@/utils/atlas14';
import type { DrainageAreaExportDto } from '@/utils/stormforgeImport';

/**
 * Source tracking for imported drainage areas.
 * Enables traceability back to Civil 3D and stores extended CAD properties.
 */
export interface DrainageImportSource {
  type: 'C3D' | 'MANUAL';
  parcelHandle?: string;      // Civil 3D object handle for linking back
  daId?: string;              // WD_Drainage property set ID
  importedAt?: string;        // ISO timestamp of import
  sourceFile?: string;        // Original export filename
  sourceDrawing?: string;     // DWG filename
  // Extended properties from Civil 3D
  landUse?: string;
  soilGroup?: string;
  pctImpervious?: number;
  targetNodeId?: string;
  hydroMethod?: string;
  designStormYR?: number;
  notes?: string;
  // Preserve full C3D data for round-trip export
  rawC3DData?: DrainageAreaExportDto;
}

export interface DrainageArea {
  id: string;
  type: 'existing' | 'proposed';
  name: string;
  areaAcres: number;
  cFactor: number;
  tcMinutes: number;
  isIncluded: boolean; // Toggle for inclusion in calculations
  isBypass: boolean; // Toggle for bypass routing (doesn't go through pond)
  importSource?: DrainageImportSource; // Optional import tracking
}

export interface DrainageResult {
  areaId: string;
  intensity: number;
  peakFlowCfs: number;
  returnPeriod: ReturnPeriod;
}

export class RationalMethod {
  /**
   * Calculates Peak Flow Q = CiA
   */
  static calculatePeakFlow(c: number, i: number, a: number): number {
    return c * i * a;
  }

  /**
   * Calculates runoff for a single drainage area for a specific return period
   */
  static async calculateRunoff(
    area: DrainageArea,
    returnPeriod: ReturnPeriod,
    cityId: number,
    rainfallMethod: RainfallMethod = 'atlas14',
    interpolationMethod: InterpolationMethod = 'log-log',
    manualIdfCoefficients?: ManualIdfCoefficientsByPeriod
  ): Promise<DrainageResult> {
    // If excluded, return 0 flow but keep metadata valid
    if (area.isIncluded === false) { 
        return {
            areaId: area.id,
            intensity: 0,
            peakFlowCfs: 0,
            returnPeriod
        };
    }

        const intensity = await getIntensity(area.tcMinutes, returnPeriod, cityId, rainfallMethod, interpolationMethod, manualIdfCoefficients);
    const peakFlow = this.calculatePeakFlow(area.cFactor, intensity, area.areaAcres);

    return {
      areaId: area.id,
      intensity,
      peakFlowCfs: peakFlow,
      returnPeriod
    };
  }
}
