/**
 * Hydraulics Configuration
 * Stores configurable engineering parameters for flow calculations
 */

// Default transition ratio for orifice to weir flow
// Default: 1.0 (transitions when head reaches the top of the opening)
// Standard engineering practice: orifice flow when head > 1.4-1.5 * height
// Can be adjusted in Settings if a different transition point is desired
export const DEFAULT_ORIFICE_WEIR_TRANSITION_RATIO = 1.0;

// Default vertical offset when stacking orifices (ft)
// This is the default gap between the top of one orifice and the invert of the next
export const DEFAULT_ORIFICE_STACKING_OFFSET = 0.10;

// Store configuration in localStorage (client-side) or could be moved to database
export function getOrificeWeirTransitionRatio(): number {
  if (typeof window === 'undefined') {
    return DEFAULT_ORIFICE_WEIR_TRANSITION_RATIO;
  }
  
  const stored = localStorage.getItem('orificeWeirTransitionRatio');
  if (stored) {
    const parsed = parseFloat(stored);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  
  return DEFAULT_ORIFICE_WEIR_TRANSITION_RATIO;
}

export function setOrificeWeirTransitionRatio(ratio: number): void {
  if (typeof window === 'undefined') return;
  
  if (ratio > 0 && isFinite(ratio)) {
    localStorage.setItem('orificeWeirTransitionRatio', ratio.toString());
  }
}

// Orifice stacking offset
export function getOrificeStackingOffset(): number {
  if (typeof window === 'undefined') {
    return DEFAULT_ORIFICE_STACKING_OFFSET;
  }
  
  const stored = localStorage.getItem('orificeStackingOffset');
  if (stored) {
    const parsed = parseFloat(stored);
    if (!isNaN(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  
  return DEFAULT_ORIFICE_STACKING_OFFSET;
}

export function setOrificeStackingOffset(offset: number): void {
  if (typeof window === 'undefined') return;
  
  if (offset >= 0 && isFinite(offset)) {
    localStorage.setItem('orificeStackingOffset', offset.toString());
  }
}

