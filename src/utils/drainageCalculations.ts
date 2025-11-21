import { getIntensity, ReturnPeriod } from '@/utils/atlas14';

export interface DrainageArea {
  id: string;
  type: 'existing' | 'proposed';
  name: string;
  areaAcres: number;
  cFactor: number;
  tcMinutes: number;
  isIncluded: boolean; // Toggle for inclusion in calculations
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
  static async calculateRunoff(area: DrainageArea, returnPeriod: ReturnPeriod, cityId: number): Promise<DrainageResult> {
    // If excluded, return 0 flow but keep metadata valid
    if (area.isIncluded === false) { 
        return {
            areaId: area.id,
            intensity: 0,
            peakFlowCfs: 0,
            returnPeriod
        };
    }

    const intensity = await getIntensity(area.tcMinutes, returnPeriod, cityId);
    const peakFlow = this.calculatePeakFlow(area.cFactor, intensity, area.areaAcres);

    return {
      areaId: area.id,
      intensity,
      peakFlowCfs: peakFlow,
      returnPeriod
    };
  }
}
