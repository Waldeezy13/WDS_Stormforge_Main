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

// Solver configuration defaults
// These control the iterative outfall solver convergence
export const DEFAULT_SOLVER_Q_TOLERANCE = 0.01; // cfs - acceptable difference between actual and target Q
export const DEFAULT_SOLVER_WSE_TOLERANCE = 0.01; // ft - acceptable WSE change between iterations
export const DEFAULT_SOLVER_MAX_ITERATIONS = 50; // Maximum solver iterations before giving up
export const DEFAULT_AUTO_SOLVE_ENABLED = false; // Whether to auto-solve when structures/inputs change

// HARD CONSTRAINT: Maximum Q overage allowed for report accuracy
// Solver guarantees Q_actual <= Q_allowable + this value
// This is critical for reports showing 2 decimal places (e.g., 2.03 cfs when only 2.02 allowed)
export const SOLVER_Q_MAX_OVERAGE = 0.01; // cfs - NEVER exceed allowable by more than this

// Minimum orifice diameter (ft) - below this is not physically constructible
export const MIN_ORIFICE_DIAMETER = 0.01; // ft

// Default discharge coefficient for circular orifices
export const DEFAULT_ORIFICE_CD = 0.60;

// Gravity constant (ft/s²)
export const GRAVITY = 32.2;

// ============================================================================
// SHAPE SELECTION CONFIGURATION
// Design philosophy: prefer circles for aesthetics, promote to rectangular slots
// when vertical space is constrained in shallow ponds
// ============================================================================

// When circular diameter would exceed this fraction of available height, promote to rectangular
// Example: if available height = 1.0 ft and threshold = 0.8, promote when D > 0.8 ft
export const CIRCULAR_TO_RECTANGULAR_THRESHOLD = 0.85;

// For rectangular slots, default height as fraction of available height
// This leaves room for the orifice to sit within available vertical space
export const RECTANGULAR_SLOT_HEIGHT_FRACTION = 0.65;

// Minimum rectangular slot dimensions (ft)
export const MIN_RECTANGULAR_WIDTH = 0.10; // 1.2 inches
export const MIN_RECTANGULAR_HEIGHT = 0.08; // ~1 inch

// ============================================================================
// TOP-STAGE WEIR CONFIGURATION
// For the largest storm, use a rectangular weir extending to plate top
// to provide emergency overflow capacity
// ============================================================================

// Enable top-stage weir for largest storm event
export const ENABLE_TOP_STAGE_WEIR = true;

// Minimum crest depth below plate top (ft) for weir flow to develop
export const MIN_WEIR_HEAD = 0.25;

// Default weir discharge coefficient (rectangular sharp-crested)
export const DEFAULT_WEIR_CD = 3.33;

// ============================================================================
// PLATE GEOMETRY CONFIGURATION
// Outlet plate is a rectangular bounding box containing all openings
// ============================================================================

// Default plate dimensions (ft) - used when not specified
export const DEFAULT_PLATE_WIDTH = 4.0;  // ft (horizontal dimension)
export const DEFAULT_PLATE_HEIGHT = 6.0; // ft (vertical dimension from invert to top)

// Minimum edge clearance from opening edge to plate edge (ft)
export const MIN_PLATE_EDGE_CLEARANCE = 0.10; // 1.2 inches

// Minimum gap between adjacent openings at same elevation (ft)
export const MIN_OPENING_HORIZONTAL_GAP = 0.10; // 1.2 inches

// Maximum number of circular orifices at same elevation before promoting to rectangular
export const MAX_CIRCLES_PER_ELEVATION = 3;

// ============================================================================
// SOLVER FAILURE MODES
// ============================================================================

// Solver failure reasons (for structured error reporting)
export const SOLVER_FAILURE = {
  NO_STORMS: 'NO_STORMS',
  NO_PLATE_SPACE: 'NO_PLATE_SPACE',
  WSE_BELOW_INVERT: 'WSE_BELOW_INVERT',
  Q_EXCEEDS_CAPACITY: 'Q_EXCEEDS_CAPACITY',
  MAX_ITERATIONS: 'MAX_ITERATIONS',
  GEOMETRY_OVERLAP: 'GEOMETRY_OVERLAP',
  INVALID_INPUTS: 'INVALID_INPUTS'
} as const;

export type SolverFailureReason = typeof SOLVER_FAILURE[keyof typeof SOLVER_FAILURE];

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

// Solver Q Tolerance
export function getSolverQTolerance(): number {
  if (typeof window === 'undefined') {
    return DEFAULT_SOLVER_Q_TOLERANCE;
  }
  
  const stored = localStorage.getItem('solverQTolerance');
  if (stored) {
    const parsed = parseFloat(stored);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  
  return DEFAULT_SOLVER_Q_TOLERANCE;
}

export function setSolverQTolerance(tolerance: number): void {
  if (typeof window === 'undefined') return;
  
  if (tolerance > 0 && isFinite(tolerance)) {
    localStorage.setItem('solverQTolerance', tolerance.toString());
  }
}

// Solver WSE Tolerance
export function getSolverWSETolerance(): number {
  if (typeof window === 'undefined') {
    return DEFAULT_SOLVER_WSE_TOLERANCE;
  }
  
  const stored = localStorage.getItem('solverWSETolerance');
  if (stored) {
    const parsed = parseFloat(stored);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  
  return DEFAULT_SOLVER_WSE_TOLERANCE;
}

export function setSolverWSETolerance(tolerance: number): void {
  if (typeof window === 'undefined') return;
  
  if (tolerance > 0 && isFinite(tolerance)) {
    localStorage.setItem('solverWSETolerance', tolerance.toString());
  }
}

// Solver Max Iterations
export function getSolverMaxIterations(): number {
  if (typeof window === 'undefined') {
    return DEFAULT_SOLVER_MAX_ITERATIONS;
  }
  
  const stored = localStorage.getItem('solverMaxIterations');
  if (stored) {
    const parsed = parseInt(stored, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  
  return DEFAULT_SOLVER_MAX_ITERATIONS;
}

export function setSolverMaxIterations(iterations: number): void {
  if (typeof window === 'undefined') return;
  
  if (iterations > 0 && isFinite(iterations) && Number.isInteger(iterations)) {
    localStorage.setItem('solverMaxIterations', iterations.toString());
  }
}

// Auto-Solve Enabled
export function getAutoSolveEnabled(): boolean {
  if (typeof window === 'undefined') {
    return DEFAULT_AUTO_SOLVE_ENABLED;
  }
  
  const stored = localStorage.getItem('autoSolveEnabled');
  if (stored !== null) {
    return stored === 'true';
  }
  
  return DEFAULT_AUTO_SOLVE_ENABLED;
}

export function setAutoSolveEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  
  localStorage.setItem('autoSolveEnabled', enabled.toString());
}

