import { getIntensity, ReturnPeriod } from './atlas14';

export interface SiteParams {
  areaAcres: number;
  cFactor: number; // Runoff coefficient
  tcMinutes: number; // Time of concentration
}

export interface DurationCalculation {
  durationMinutes: number;
  intensityInHr: number;
  peakInflowCfs: number;
  storageCf: number;
  isCritical: boolean;
}

export interface ModifiedRationalResult {
  criticalDurationMinutes: number;
  peakInflowCfs: number;
  requiredStorageCf: number;
  allowableReleaseRateCfs: number;
  stormEvent: ReturnPeriod;
  durationCalculations: DurationCalculation[];
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
    cityId: number,
    interpolationMethod: 'linear' | 'log-log' = 'log-log',
    allowableReleaseRateCfsOverride?: number
  ): Promise<ModifiedRationalResult> {
    // 1. Calculate Allowable Release Rate (Q_pre)
    // Q_pre is calculated at the Pre-Dev Time of Concentration
    const iPre = await getIntensity(preDev.tcMinutes, returnPeriod, cityId, interpolationMethod);
    const qAllowable = typeof allowableReleaseRateCfsOverride === 'number'
      ? Math.max(0, allowableReleaseRateCfsOverride)
      : this.calculatePeakFlow(preDev, iPre);

    let maxStorage = 0;
    let criticalDuration = postDev.tcMinutes;
    let peakInflowAtCritical = 0;

    // Iterate through durations to find the critical one (Max Storage)
    // Per Modified Rational Method, we start at Post-Dev Tc and go up to 24 hours (1440 min)
    // Standard durations from Atlas 14: 5, 10, 15, 30, 60, 120, 180, 360, 720, 1440 minutes
    const standardDurations = [5, 10, 15, 30, 60, 120, 180, 360, 720, 1440];
    
    // Create unique set of durations: Tc plus all standard durations >= Tc
    const durationsSet = new Set<number>();
    durationsSet.add(postDev.tcMinutes); // Always include Tc
    standardDurations
      .filter(d => d >= postDev.tcMinutes)
      .forEach(d => durationsSet.add(d));
    
    const durationsToCheck = Array.from(durationsSet).sort((a, b) => a - b);

    const durationCalculations: DurationCalculation[] = [];

    for (const duration of durationsToCheck) {
      const intensity = await getIntensity(duration, returnPeriod, cityId, interpolationMethod);
      const qPost = this.calculatePeakFlow(postDev, intensity);
      
      // Simplified Modified Rational Method Storage Formula:
      // V = (Qp - Qallow) * duration
      
      let storage = 0;
      if (qPost > qAllowable) {
        // Converting duration minutes to seconds for CFS -> Cubic Feet
        const durationSeconds = duration * 60;
        storage = (qPost - qAllowable) * durationSeconds;
        
        if (storage > maxStorage) {
          maxStorage = storage;
          criticalDuration = duration;
          peakInflowAtCritical = qPost;
        }
      }

      durationCalculations.push({
        durationMinutes: duration,
        intensityInHr: intensity,
        peakInflowCfs: qPost,
        storageCf: storage,
        isCritical: false // Will be set after we find the max
      });
    }

    // Mark the critical duration
    const criticalIndex = durationCalculations.findIndex(
      calc => calc.durationMinutes === criticalDuration && calc.storageCf === maxStorage
    );
    if (criticalIndex >= 0) {
      durationCalculations[criticalIndex].isCritical = true;
    }

    return {
      criticalDurationMinutes: criticalDuration,
      peakInflowCfs: peakInflowAtCritical,
      requiredStorageCf: maxStorage,
      allowableReleaseRateCfs: qAllowable,
      stormEvent: returnPeriod,
      durationCalculations
    };
  }
}
