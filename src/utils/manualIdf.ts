import type { RainfallData, ReturnPeriod } from './atlas14';

export type ManualIdfCoefficients = {
  b?: number;
  d?: number;
  e?: number;
};

export type ManualIdfCoefficientsByPeriod = Partial<Record<ReturnPeriod, ManualIdfCoefficients>>;

export const MANUAL_IDF_EDITABLE_EVENTS: ReturnPeriod[] = ['1yr', '2yr', '5yr', '10yr', '25yr', '50yr', '100yr', '500yr'];

export const DEFAULT_MANUAL_IDF_COEFFICIENTS: ManualIdfCoefficientsByPeriod = {
  '2yr': { b: 81.319, d: 15.788, e: 0.864 },
  '5yr': { b: 82.686, d: 15.497, e: 0.82 },
  '25yr': { b: 106.665, d: 18.069, e: 0.806 },
  '100yr': { b: 112.783, d: 17.572, e: 0.771 },
};

export const MANUAL_IDF_SUPPORTED_EVENTS: ReturnPeriod[] = ['2yr', '5yr', '25yr', '100yr'];

function hasCompleteManualIdfCoefficients(
  coefficients: ManualIdfCoefficients | undefined
): coefficients is Required<ManualIdfCoefficients> {
  return Boolean(
    coefficients &&
    Number.isFinite(coefficients.b) &&
    Number.isFinite(coefficients.d) &&
    Number.isFinite(coefficients.e)
  );
}

export function createDefaultManualIdfCoefficients(): ManualIdfCoefficientsByPeriod {
  return Object.fromEntries(
    Object.entries(DEFAULT_MANUAL_IDF_COEFFICIENTS).map(([returnPeriod, coefficients]) => [
      returnPeriod,
      coefficients ? { ...coefficients } : coefficients,
    ])
  ) as ManualIdfCoefficientsByPeriod;
}

export function supportsManualIdf(
  returnPeriod: ReturnPeriod,
  coefficientsByPeriod: ManualIdfCoefficientsByPeriod = DEFAULT_MANUAL_IDF_COEFFICIENTS
): boolean {
  const coefficients = coefficientsByPeriod[returnPeriod];
  return hasCompleteManualIdfCoefficients(coefficients);
}

export function getManualIdfIntensity(
  durationMinutes: number,
  returnPeriod: ReturnPeriod,
  coefficientsByPeriod: ManualIdfCoefficientsByPeriod = DEFAULT_MANUAL_IDF_COEFFICIENTS
): number {
  const coefficients = coefficientsByPeriod[returnPeriod];

  if (!hasCompleteManualIdfCoefficients(coefficients)) {
    return 0;
  }

  const b = coefficients.b;
  const d = coefficients.d;
  const e = coefficients.e;

  const tc = Math.max(0, durationMinutes);
  const denominator = Math.pow(tc + d, e);

  if (denominator <= 0) {
    return 0;
  }

  return b / denominator;
}

export function buildManualIdfTable(
  durationsMinutes: number[],
  coefficientsByPeriod: ManualIdfCoefficientsByPeriod = DEFAULT_MANUAL_IDF_COEFFICIENTS
): RainfallData[] {
  const uniqueDurations = Array.from(
    new Set(durationsMinutes.filter((duration) => Number.isFinite(duration) && duration > 0))
  ).sort((a, b) => a - b);

  return uniqueDurations.map((durationMinutes) => ({
    durationMinutes,
    intensities: Object.fromEntries(
      MANUAL_IDF_EDITABLE_EVENTS.map((returnPeriod) => [
        returnPeriod,
        supportsManualIdf(returnPeriod, coefficientsByPeriod)
          ? getManualIdfIntensity(durationMinutes, returnPeriod, coefficientsByPeriod)
          : Number.NaN,
      ])
    ) as Record<ReturnPeriod, number>,
  }));
}