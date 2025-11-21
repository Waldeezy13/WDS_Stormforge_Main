import { getIntensity, ReturnPeriod } from './atlas14';

export interface SiteParams {
  areaAcres: number;
  cFactor: number; // Runoff coefficient
  tcMinutes: number; // Time of concentration
}

export interface ModifiedRationalResult {
  criticalDurationMinutes: number;
  peakInflowCfs: number;
  requiredStorageCf: number;
  allowableReleaseRateCfs: number;
  stormEvent: ReturnPeriod;
}

export class ModifiedRationalMethod {
  
  /**
   * Calculates the Peak Flow Q = CiA
   */
  static calculatePeakFlow(params: SiteParams, intensity: number): number {
    return params.cFactor * intensity * params.areaAcres;
  }

  /**
   * Calculates the Required Storage Volume for a specific Return Period
   * Assumes Allowable Release Rate is the Pre-Development Peak Flow
   */
  static async calculateStorage(
    preDev: SiteParams,
    postDev: SiteParams,
    returnPeriod: ReturnPeriod,
    cityId: number
  ): Promise<ModifiedRationalResult> {
    // 1. Calculate Allowable Release Rate (Q_pre)
    // Q_pre is calculated at the Pre-Dev Time of Concentration
    const iPre = await getIntensity(preDev.tcMinutes, returnPeriod, cityId);
    const qAllowable = this.calculatePeakFlow(preDev, iPre);

    let maxStorage = 0;
    let criticalDuration = postDev.tcMinutes;
    let peakInflowAtCritical = 0;

    // Iterate through durations to find the critical one (Max Storage)
    // We start at Post-Dev Tc and go up to 24 hours (1440 min)
    // Step size can be adjusted for precision
    const durationsToCheck = [
        postDev.tcMinutes, 
        10, 15, 30, 60, 120, 180, 360, 720, 1440
    ].filter(d => d >= postDev.tcMinutes).sort((a, b) => a - b);

    for (const duration of durationsToCheck) {
      const intensity = await getIntensity(duration, returnPeriod, cityId);
      const qPost = this.calculatePeakFlow(postDev, intensity);
      
      // Simplified Modified Rational Method Storage Formula:
      // V = (Qp - Qallow) * duration
      
      if (qPost > qAllowable) {
        // Converting duration minutes to seconds for CFS -> Cubic Feet
        const durationSeconds = duration * 60;
        const storage = (qPost - qAllowable) * durationSeconds;
        
        if (storage > maxStorage) {
          maxStorage = storage;
          criticalDuration = duration;
          peakInflowAtCritical = qPost;
        }
      }
    }

    return {
      criticalDurationMinutes: criticalDuration,
      peakInflowCfs: peakInflowAtCritical,
      requiredStorageCf: maxStorage,
      allowableReleaseRateCfs: qAllowable,
      stormEvent: returnPeriod
    };
  }
}
