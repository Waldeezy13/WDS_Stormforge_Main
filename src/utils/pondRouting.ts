/**
 * Pond Routing Solver
 * 
 * ============================================================================
 * ARCHITECTURE OVERVIEW
 * ============================================================================
 * 
 * This module implements the Stormforge outlet/orifice plate solver. It designs
 * a single outlet plate with multiple openings that must work for multiple
 * design storms simultaneously (e.g., 2-yr, 5-yr, 10-yr, 25-yr, 100-yr).
 * 
 * KEY CONCEPTS:
 * 
 * 1. PLATE GEOMETRY
 *    - The outlet plate is a rectangular bounding box (width × height)
 *    - Openings are placed within this box without overlapping
 *    - Supported opening types: circular orifices, rectangular slots
 * 
 * 2. MULTI-STORM EVALUATION  
 *    - All storms share the SAME plate geometry
 *    - For each candidate plate, we compute a rating curve Q_total(H)
 *    - Each storm is routed to find peak WSE and peak Q
 *    - The plate is acceptable only if ALL storms satisfy Q ≤ Q_allowable + tolerance
 * 
 * 3. SIZING ALGORITHM
 *    - Process storms smallest→largest (2-yr, 5-yr, 10-yr, etc.)
 *    - For each storm: check if existing openings handle the allowable Q
 *    - If not, add a new opening sized for the remaining Q
 *    - Prefer circular orifices; promote to rectangular slots if space-constrained
 *    - Optionally use weir for top stage (largest storm)
 * 
 * 4. GLOBAL VERIFICATION
 *    - After initial sizing, verify ALL storms with the candidate plate
 *    - If any storm exceeds allowable Q, shrink openings and re-verify
 *    - Iterate until all storms pass or max iterations reached
 * 
 * ============================================================================
 * EQUATION REFERENCE
 * ============================================================================
 * 
 * Circular Orifice:
 *   Q = Cd × A × sqrt(2 × g × H_eff)
 *   where A = π × D² / 4, H_eff = head above centroid
 * 
 * Rectangular Orifice:
 *   Q = Cd × A × sqrt(2 × g × H_eff)
 *   where A = W × H, H_eff = head above centroid
 * 
 * Rectangular Weir:
 *   Q = Cw × L × H^1.5
 *   where L = crest length (width), H = head above crest
 * 
 * ============================================================================
 */

import { OutfallStructure, OutfallStructureType, calculateTotalDischarge, getStructureDischarge, roundToPrecision, detectOverlaps } from './hydraulics';
import { StageStorageCurve, getElevationAtVolume, getVolumeAtElevation } from './stageStorage';
import { ModifiedRationalResult } from './rationalMethod';
import { 
  getSolverQTolerance, 
  getSolverWSETolerance, 
  getSolverMaxIterations,
  SOLVER_Q_MAX_OVERAGE,
  MIN_ORIFICE_DIAMETER,
  DEFAULT_ORIFICE_CD,
  GRAVITY,
  DEFAULT_ORIFICE_STACKING_OFFSET,
  CIRCULAR_TO_RECTANGULAR_THRESHOLD,
  RECTANGULAR_SLOT_HEIGHT_FRACTION,
  MIN_RECTANGULAR_WIDTH,
  MIN_RECTANGULAR_HEIGHT,
  ENABLE_TOP_STAGE_WEIR,
  MIN_WEIR_HEAD,
  DEFAULT_WEIR_CD,
  DEFAULT_PLATE_WIDTH,
  MIN_PLATE_EDGE_CLEARANCE,
  SOLVER_FAILURE,
  SolverFailureReason
} from './hydraulicsConfig';
import type { ReturnPeriod } from './atlas14';

/**
 * Result of solving for equilibrium WSE for a single storm event
 */
export interface SolvedStormResult {
  stormEvent: ReturnPeriod;
  converged: boolean;
  iterations: number;
  
  // Original (unsolved) values from Modified Rational Method
  originalWSE: number;           // WSE based on allowable Q assumption (ft)
  originalVolumeCf: number;      // Required storage from MRM (cf)
  allowableQCfs: number;         // Pre-development peak flow (cfs)
  peakInflowCfs: number;         // Post-development peak inflow (cfs)
  
  // Solved (actual) values
  solvedWSE: number;             // Equilibrium WSE (ft)
  solvedVolumeCf: number;        // Actual storage at equilibrium (cf)
  actualQCfs: number;            // Actual discharge through outfall (cfs)
  
  // Convergence info
  qError: number;                // |actualQ - targetQ| at convergence (cfs)
  wseError: number;              // WSE change in last iteration (ft)
  
  // Status
  warning?: string;              // Warning message if applicable
}

/**
 * Enhanced solver result with per-storm detailed information
 */
export interface EnhancedSolverResult {
  stormEvent: ReturnPeriod;
  converged: boolean;
  iterations: number;
  
  // Design targets
  allowableQCfs: number;         // Maximum allowable discharge (cfs)
  
  // Sized structure info (from Step 1)
  structureId: string;           // ID of the structure handling this storm
  structureType: OutfallStructureType;
  sizeDiameterFt?: number;       // For circular
  sizeWidthFt?: number;          // For rectangular
  sizeHeightFt?: number;         // For rectangular
  
  // WSE values (from Step 2)
  originalWSE: number;           // WSE from Modified Rational Method (ft)
  solvedWSE: number;             // Equilibrium WSE after solving (ft)
  
  // Discharge values (from Step 3 verification)
  actualQCfs: number;            // Actual discharge through all structures at solved WSE (cfs)
  thisStructureQCfs: number;     // Discharge through this storm's structure only (cfs)
  lowerStormsCumulativeQCfs: number; // Cumulative Q from lower storm structures (cfs)
  
  // Freeboard (from Step 3)
  freeboardFt: number;           // Pond top elevation - solved WSE (ft)
  
  // Status
  status: 'ok' | 'warning' | 'error';
  statusMessage?: string;        // Detailed status message
  
  // Flow regime info
  flowType: 'orifice' | 'weir' | 'submerged_orifice' | 'submerged_weir' | 'dry';
  isWeirRegimeWarning: boolean;  // True if circular operating in weir mode
}

/**
 * Result from the full enhanced solver run
 */
export interface EnhancedSolverOutput {
  results: EnhancedSolverResult[];
  sizedStructures: OutfallStructure[];  // Updated structures with optimized sizes
  overallStatus: 'success' | 'partial' | 'failed';
  overallMessage?: string;
  
  // Diagnostic information
  ratingCurve?: RatingCurvePoint[];     // Q vs Head for the final plate
  perStormDiagnostics?: StormDiagnostic[]; // Detailed per-storm info
  failureReason?: SolverFailureReason;  // Structured failure reason
}

/**
 * Plate geometry definition
 * The outlet plate is a rectangular bounding box containing all openings
 */
export interface PlateGeometry {
  widthFt: number;              // Horizontal dimension of plate (ft)
  heightFt: number;             // Vertical dimension from invert to top (ft)
  invertElevation: number;      // Bottom of plate = pond invert (ft)
}

/**
 * Rating curve point - Q vs Head for the plate
 */
export interface RatingCurvePoint {
  headFt: number;               // Head above pond invert (ft)
  wseElevation: number;         // Water surface elevation (ft)
  totalQCfs: number;            // Total discharge through all openings (cfs)
  perOpeningQ: Array<{          // Discharge per opening
    id: string;
    type: OutfallStructureType;
    qCfs: number;
    flowType: string;
  }>;
}

/**
 * Per-storm diagnostic information
 */
export interface StormDiagnostic {
  stormEvent: ReturnPeriod;
  
  // Design parameters
  allowableQCfs: number;        // Target maximum discharge
  designVolumeCf: number;       // Required storage from Modified Rational
  
  // Solved values
  peakWSE: number;              // Peak water surface elevation (ft)
  headAtPeakFt: number;         // Head above pond invert at peak (ft)
  peakQCfs: number;             // Peak discharge through plate (cfs)
  
  // Comparison to allowable
  qDifferenceCfs: number;       // peakQ - allowableQ (negative = under, positive = over)
  qDifferencePercent: number;   // Percentage of allowable
  isWithinTolerance: boolean;   // True if Q ≤ allowable + tolerance
  
  // Which openings are active at peak
  activeOpenings: Array<{
    id: string;
    type: OutfallStructureType;
    qCfs: number;
    flowType: string;
  }>;
}

/**
 * Configuration for the pond routing solver
 */
export interface SolverConfig {
  qTolerance?: number;           // Q convergence tolerance (cfs), default from settings
  wseTolerance?: number;         // WSE convergence tolerance (ft), default from settings
  maxIterations?: number;        // Max iterations, default from settings
  dampingFactor?: number;        // Damping for stability (0-1), default 0.7
}

/**
 * Configuration for enhanced solver sizing
 */
export interface EnhancedSolverConfig extends SolverConfig {
  sizePrecisionFt?: number;      // Precision for sizing (ft), default 0.01
  freeboardGoalFt?: number;      // Target freeboard (ft), default 1.0
  minFreeboardFt?: number;       // Minimum acceptable freeboard (ft), default 0
  preferCircular?: boolean;      // Prefer circular over rectangular when both work
  plateWidthFt?: number;         // Plate width constraint (ft)
  enableTopStageWeir?: boolean;  // Use weir for largest storm
}

/**
 * Inputs for solving equilibrium WSE
 */
export interface SolverInputs {
  // Pond geometry
  pondMode: 'generic' | 'custom';
  pondAreaSqFt?: number;         // For generic mode: pond surface area (sf)
  pondInvertElevation: number;   // Bottom of pond (ft)
  stageStorageCurve?: StageStorageCurve | null;  // For custom mode
  
  // Outfall configuration
  structures: OutfallStructure[];
  tailwaterElevations: Record<string, number>;  // Tailwater per storm event
  
  // Storm event data
  result: ModifiedRationalResult;
}

/**
 * Get WSE from volume based on pond mode
 */
function getWSEFromVolume(
  volumeCf: number,
  pondMode: 'generic' | 'custom',
  pondAreaSqFt: number,
  pondInvertElevation: number,
  stageStorageCurve?: StageStorageCurve | null
): number {
  if (pondMode === 'custom' && stageStorageCurve && stageStorageCurve.points.length >= 2) {
    return getElevationAtVolume(stageStorageCurve, volumeCf);
  }
  // Generic mode: simple prism
  return pondInvertElevation + (volumeCf / pondAreaSqFt);
}

/**
 * Get volume from WSE based on pond mode
 */
function getVolumeFromWSE(
  wse: number,
  pondMode: 'generic' | 'custom',
  pondAreaSqFt: number,
  pondInvertElevation: number,
  stageStorageCurve?: StageStorageCurve | null
): number {
  if (pondMode === 'custom' && stageStorageCurve && stageStorageCurve.points.length >= 2) {
    return getVolumeAtElevation(stageStorageCurve, wse);
  }
  // Generic mode: simple prism
  const depth = wse - pondInvertElevation;
  return depth * pondAreaSqFt;
}

/**
 * Solve for equilibrium WSE for a single storm event
 * 
 * The approach: Find WSE where actual Q through outfall equals the 
 * required release rate to maintain mass balance.
 * 
 * For Modified Rational Method:
 * - Storage = (Qin - Qout) × duration
 * - At equilibrium, the pond stores exactly the volume needed
 * - We iterate to find WSE where Q_actual ≈ Q_allowable
 * 
 * Algorithm:
 * 1. Start with WSE from MRM (assumes Q_out = Q_allowable)
 * 2. Calculate actual Q through structures at this WSE
 * 3. If Q_actual ≠ Q_allowable, adjust WSE:
 *    - Q_actual > Q_allowable → WSE is too high → reduce WSE
 *    - Q_actual < Q_allowable → WSE is too low → increase WSE
 * 4. Use bisection method for stability
 * 5. Converge when |Q_actual - Q_allowable| < tolerance
 */
export function solveEquilibriumWSE(
  inputs: SolverInputs,
  config?: SolverConfig
): SolvedStormResult {
  const {
    pondMode,
    pondAreaSqFt = 10000, // Default 10,000 sf
    pondInvertElevation,
    stageStorageCurve,
    structures,
    tailwaterElevations,
    result
  } = inputs;

  const qTolerance = config?.qTolerance ?? getSolverQTolerance();
  const wseTolerance = config?.wseTolerance ?? getSolverWSETolerance();
  const maxIterations = config?.maxIterations ?? getSolverMaxIterations();
  const dampingFactor = config?.dampingFactor ?? 0.7;

  const stormEvent = result.stormEvent;
  const allowableQ = result.allowableReleaseRateCfs;
  const peakInflow = result.peakInflowCfs;
  const originalVolume = result.requiredStorageCf;
  const tailwater = tailwaterElevations[stormEvent];

  // Calculate original WSE (from MRM)
  const originalWSE = getWSEFromVolume(
    originalVolume,
    pondMode,
    pondAreaSqFt,
    pondInvertElevation,
    stageStorageCurve
  );

  // Handle edge case: no structures
  if (structures.length === 0) {
    return {
      stormEvent,
      converged: false,
      iterations: 0,
      originalWSE,
      originalVolumeCf: originalVolume,
      allowableQCfs: allowableQ,
      peakInflowCfs: peakInflow,
      solvedWSE: originalWSE,
      solvedVolumeCf: originalVolume,
      actualQCfs: 0,
      qError: allowableQ,
      wseError: 0,
      warning: 'No outfall structures defined'
    };
  }

  // Handle edge case: zero or negative allowable Q
  if (allowableQ <= 0) {
    const { totalDischarge } = calculateTotalDischarge(structures, originalWSE, tailwater);
    return {
      stormEvent,
      converged: false,
      iterations: 0,
      originalWSE,
      originalVolumeCf: originalVolume,
      allowableQCfs: allowableQ,
      peakInflowCfs: peakInflow,
      solvedWSE: originalWSE,
      solvedVolumeCf: originalVolume,
      actualQCfs: totalDischarge,
      qError: Math.abs(totalDischarge - allowableQ),
      wseError: 0,
      warning: 'Allowable discharge is zero or negative'
    };
  }

  // Calculate actual Q at original WSE
  let { totalDischarge: actualQ } = calculateTotalDischarge(structures, originalWSE, tailwater);

  // Check if already converged
  if (Math.abs(actualQ - allowableQ) <= qTolerance) {
    return {
      stormEvent,
      converged: true,
      iterations: 0,
      originalWSE,
      originalVolumeCf: originalVolume,
      allowableQCfs: allowableQ,
      peakInflowCfs: peakInflow,
      solvedWSE: originalWSE,
      solvedVolumeCf: originalVolume,
      actualQCfs: actualQ,
      qError: Math.abs(actualQ - allowableQ),
      wseError: 0
    };
  }

  // Set up bisection bounds
  // WSE must be between pond invert and some reasonable upper bound
  let wseLow = pondInvertElevation;
  let wseHigh: number;

  // Determine upper bound for WSE
  if (pondMode === 'custom' && stageStorageCurve && stageStorageCurve.points.length > 0) {
    // Use top of stage-storage curve + margin
    const topPoint = stageStorageCurve.points[stageStorageCurve.points.length - 1];
    wseHigh = topPoint.elevation + 5; // 5 ft margin
  } else {
    // Generic mode: use original WSE + margin
    wseHigh = originalWSE + 10; // 10 ft margin
  }

  // Ensure initial WSE is within bounds
  let currentWSE = Math.max(wseLow, Math.min(wseHigh, originalWSE));

  // Iterative solver using bisection with damping
  let iterations = 0;
  let previousWSE = currentWSE;
  let converged = false;
  let wseError = Infinity;
  let qError = Infinity;

  while (iterations < maxIterations) {
    iterations++;

    // Calculate actual Q at current WSE
    const { totalDischarge } = calculateTotalDischarge(structures, currentWSE, tailwater);
    actualQ = totalDischarge;
    qError = Math.abs(actualQ - allowableQ);

    // Check convergence
    wseError = Math.abs(currentWSE - previousWSE);
    if (qError <= qTolerance || (iterations > 1 && wseError <= wseTolerance)) {
      converged = true;
      break;
    }

    previousWSE = currentWSE;

    // Bisection: adjust bounds based on Q comparison
    if (actualQ > allowableQ) {
      // Discharging too much → WSE is too high → reduce upper bound
      wseHigh = currentWSE;
    } else {
      // Discharging too little → WSE is too low → raise lower bound
      wseLow = currentWSE;
    }

    // New WSE is midpoint (bisection)
    const newWSE = (wseLow + wseHigh) / 2;

    // Apply damping for stability
    currentWSE = previousWSE + dampingFactor * (newWSE - previousWSE);

    // Clamp to bounds
    currentWSE = Math.max(wseLow + 0.001, Math.min(wseHigh - 0.001, currentWSE));
  }

  // Calculate final volume at solved WSE
  const solvedVolume = getVolumeFromWSE(
    currentWSE,
    pondMode,
    pondAreaSqFt,
    pondInvertElevation,
    stageStorageCurve
  );

  // Final discharge calculation
  const { totalDischarge: finalQ } = calculateTotalDischarge(structures, currentWSE, tailwater);

  const baseResult: SolvedStormResult = {
    stormEvent,
    converged,
    iterations,
    originalWSE,
    originalVolumeCf: originalVolume,
    allowableQCfs: allowableQ,
    peakInflowCfs: peakInflow,
    solvedWSE: currentWSE,
    solvedVolumeCf: solvedVolume,
    actualQCfs: finalQ,
    qError,
    wseError
  };

  if (!converged) {
    baseResult.warning = `Solver did not converge after ${maxIterations} iterations. Q error: ${qError.toFixed(3)} cfs, WSE error: ${wseError.toFixed(3)} ft`;
  }

  return baseResult;
}

/**
 * Solve for all storm events
 */
export function solveAllStormEvents(
  pondMode: 'generic' | 'custom',
  pondAreaSqFt: number,
  pondInvertElevation: number,
  stageStorageCurve: StageStorageCurve | null | undefined,
  structures: OutfallStructure[],
  tailwaterElevations: Record<string, number>,
  results: ModifiedRationalResult[],
  config?: SolverConfig
): SolvedStormResult[] {
  return results.map(result => 
    solveEquilibriumWSE(
      {
        pondMode,
        pondAreaSqFt,
        pondInvertElevation,
        stageStorageCurve,
        structures,
        tailwaterElevations,
        result
      },
      config
    )
  );
}

/**
 * Check if solved results are still valid (no input changes that would invalidate them)
 * This is used to determine if auto-solve should re-run
 */
export function areSolvedResultsValid(
  solvedResults: SolvedStormResult[],
  currentResults: ModifiedRationalResult[],
  structures: OutfallStructure[],
  tailwaterElevations: Record<string, number>
): boolean {
  // Check if we have solved results
  if (solvedResults.length === 0) return false;
  
  // Check if storm events match
  const solvedEvents = new Set(solvedResults.map(r => r.stormEvent));
  const currentEvents = new Set(currentResults.map(r => r.stormEvent));
  if (solvedEvents.size !== currentEvents.size) return false;
  for (const event of solvedEvents) {
    if (!currentEvents.has(event)) return false;
  }
  
  // Check if structures changed (compare lengths as a quick check)
  // A more thorough check would compare structure properties
  // For now, we'll rely on the caller to invalidate when structures change
  
  // Check if any original values changed
  for (const solved of solvedResults) {
    const current = currentResults.find(r => r.stormEvent === solved.stormEvent);
    if (!current) return false;
    
    // Check if key inputs changed
    if (Math.abs(current.requiredStorageCf - solved.originalVolumeCf) > 0.1) return false;
    if (Math.abs(current.allowableReleaseRateCfs - solved.allowableQCfs) > 0.001) return false;
  }
  
  return true;
}

// =============================================================================
// ENHANCED RATING-CURVE SOLVER (Circular Orifices Only)
// =============================================================================
//
// This solver uses a rating-curve approach instead of greedy storm-by-storm sizing.
// 
// Key improvements over the old approach:
// 1. Enforces geometric staging: invert[k] >= solvedWSE[k-1] + gap
// 2. Adds orifices incrementally only as needed (starts with 0)
// 3. Uses direct area calculation (not binary search) for initial sizing
// 4. Global verify-and-shrink loop guarantees Q never exceeds allowable + 0.01 cfs
//
// Algorithm:
// 1. Process storms smallest→largest
// 2. For each storm: check if existing orifices already handle allowable Q
// 3. If not, add a new orifice sized via: D = sqrt(4 × Q_remaining / (Cd × π × sqrt(2g × H_eff)))
// 4. Place new orifice at: max(solvedWSE[previous] + gap, pondInvert)
// 5. After all storms sized, run global verification
// 6. If any Q > allowable + 0.01, shrink that orifice by sqrt(Q_allowable/Q_actual) and re-verify
// =============================================================================

/**
 * Storm events sorted from smallest to largest for cumulative flow calculations
 */
const STORM_ORDER: ReturnPeriod[] = ['1yr', '2yr', '5yr', '10yr', '25yr', '50yr', '100yr', '500yr'];

function getStormOrder(event: ReturnPeriod): number {
  const idx = STORM_ORDER.indexOf(event);
  return idx >= 0 ? idx : 999; // Unknown storms sort last
}

/**
 * Get WSE from volume based on pond mode
 */
function getWSEFromVolumeEnhanced(
  volumeCf: number,
  pondMode: 'generic' | 'custom',
  pondAreaSqFt: number,
  pondInvertElevation: number,
  stageStorageCurve?: StageStorageCurve | null
): number {
  if (pondMode === 'custom' && stageStorageCurve && stageStorageCurve.points.length >= 2) {
    return getElevationAtVolume(stageStorageCurve, volumeCf);
  }
  // Generic mode: simple prism
  return pondInvertElevation + (volumeCf / pondAreaSqFt);
}

/**
 * Calculate orifice diameter directly from target Q using orifice equation
 * Q = Cd × A × sqrt(2g × H_eff)
 * A = Q / (Cd × sqrt(2g × H_eff))
 * D = sqrt(4A / π)
 * 
 * @param targetQCfs - Target discharge (cfs)
 * @param headToCentroidFt - Effective head to orifice centroid (ft)
 * @param cd - Discharge coefficient
 * @returns Diameter in ft, or null if invalid inputs
 */
function calculateOrificeeDiameterDirect(
  targetQCfs: number,
  headToCentroidFt: number,
  cd: number
): number | null {
  if (targetQCfs <= 0 || headToCentroidFt <= 0 || cd <= 0) {
    return null;
  }
  
  const sqrt2gh = Math.sqrt(2 * GRAVITY * headToCentroidFt);
  const area = targetQCfs / (cd * sqrt2gh);
  
  if (area <= 0 || !isFinite(area)) {
    return null;
  }
  
  const diameter = Math.sqrt((4 * area) / Math.PI);
  
  if (diameter <= 0 || !isFinite(diameter)) {
    return null;
  }
  
  return roundToPrecision(diameter);
}

/**
 * Calculate rectangular slot dimensions from target Q using orifice equation
 * Q = Cd × A × sqrt(2g × H_eff)
 * A = W × H
 * Given a fixed height H, solve for width W:
 * W = Q / (Cd × H × sqrt(2g × H_eff))
 * 
 * @param targetQCfs - Target discharge (cfs)
 * @param headToCentroidFt - Effective head to slot centroid (ft)
 * @param fixedHeightFt - Fixed height of the rectangular slot (ft)
 * @param cd - Discharge coefficient
 * @returns Width in ft, or null if invalid inputs
 */
function calculateRectangularSlotWidth(
  targetQCfs: number,
  headToCentroidFt: number,
  fixedHeightFt: number,
  cd: number
): number | null {
  if (targetQCfs <= 0 || headToCentroidFt <= 0 || fixedHeightFt <= 0 || cd <= 0) {
    return null;
  }
  
  const sqrt2gh = Math.sqrt(2 * GRAVITY * headToCentroidFt);
  const width = targetQCfs / (cd * fixedHeightFt * sqrt2gh);
  
  if (width <= 0 || !isFinite(width)) {
    return null;
  }
  
  return roundToPrecision(width);
}

/**
 * Calculate weir length from target Q using weir equation
 * Q = Cw × L × H^1.5
 * L = Q / (Cw × H^1.5)
 * 
 * @param targetQCfs - Target discharge (cfs)
 * @param headAboveCrestFt - Head above weir crest (ft)
 * @param cw - Weir discharge coefficient (default 3.33 for rectangular sharp-crested)
 * @returns Weir length (width) in ft, or null if invalid inputs
 */
function calculateWeirLength(
  targetQCfs: number,
  headAboveCrestFt: number,
  cw: number = DEFAULT_WEIR_CD
): number | null {
  if (targetQCfs <= 0 || headAboveCrestFt <= 0 || cw <= 0) {
    return null;
  }
  
  const h15 = Math.pow(headAboveCrestFt, 1.5);
  const length = targetQCfs / (cw * h15);
  
  if (length <= 0 || !isFinite(length)) {
    return null;
  }
  
  return roundToPrecision(length);
}

/**
 * Sizing result for a single storm
 */
interface StormSizingResult {
  stormEvent: ReturnPeriod;
  wse: number;                    // Design WSE for this storm
  allowableQ: number;             // Maximum allowable discharge
  cumulativeQFromLower: number;   // Q from orifices below this one at this WSE
  remainingQ: number;             // Q this orifice needs to handle
  structureAdded: boolean;        // Whether a new structure was added (orifice or weir)
  structureId?: string;           // ID if structure was added
  structureInvert?: number;       // Invert elevation if added
  structureType?: 'circular' | 'rectangular' | 'weir';  // Type of structure added
  orificeDiameter?: number;       // Diameter if circular orifice
  slotWidth?: number;             // Width if rectangular slot
  slotHeight?: number;            // Height if rectangular slot
  weirWidth?: number;             // Width if weir (largest storm)
  weirHeight?: number;            // Height if weir (crest to plate top)
  actualQ?: number;               // Actual Q through this structure at design WSE
  promotedFromCircular?: boolean; // True if originally calculated as circular but promoted to rectangular
  error?: string;                 // Error message if sizing failed
  
  // Deprecated aliases for backward compatibility
  /** @deprecated Use structureAdded */
  orificeAdded?: boolean;
  /** @deprecated Use structureId */
  orificeId?: string;
  /** @deprecated Use structureInvert */
  orificeInvert?: number;
}

/**
 * ============================================================================
 * GEOMETRY CONSTRAINT HELPERS
 * ============================================================================
 */

/**
 * Check if an opening fits within the plate bounds
 * @returns true if opening is within bounds, false otherwise
 */
function isOpeningWithinPlateBounds(
  opening: OutfallStructure,
  plateWidthFt: number,
  pondInvertElevation: number,
  pondTopElevation: number
): boolean {
  const centerX = opening.horizontalOffsetFt || 0;
  const invert = opening.invertElevation;
  
  let leftEdge: number;
  let rightEdge: number;
  let topEdge: number;
  
  if (opening.type === 'circular') {
    const radius = (opening.diameterFt || 0) / 2;
    leftEdge = centerX - radius;
    rightEdge = centerX + radius;
    topEdge = invert + (opening.diameterFt || 0);
  } else {
    const halfWidth = (opening.widthFt || 0) / 2;
    leftEdge = centerX - halfWidth;
    rightEdge = centerX + halfWidth;
    topEdge = invert + (opening.heightFt || 0);
  }
  
  const plateHalfWidth = plateWidthFt / 2;
  
  // Check horizontal bounds (plate centered at x=0)
  if (leftEdge < -plateHalfWidth + MIN_PLATE_EDGE_CLEARANCE) return false;
  if (rightEdge > plateHalfWidth - MIN_PLATE_EDGE_CLEARANCE) return false;
  
  // Check vertical bounds
  if (invert < pondInvertElevation) return false;
  if (topEdge > pondTopElevation - MIN_PLATE_EDGE_CLEARANCE) return false;
  
  return true;
}

/**
 * Get the maximum allowable diameter for a circular opening at a given elevation
 * considering both vertical and horizontal plate constraints
 */
function getMaxCircularDiameter(
  invertElevation: number,
  pondTopElevation: number,
  plateWidthFt: number
): number {
  const verticalSpace = pondTopElevation - invertElevation - MIN_PLATE_EDGE_CLEARANCE;
  const horizontalSpace = plateWidthFt - 2 * MIN_PLATE_EDGE_CLEARANCE;
  return Math.min(verticalSpace, horizontalSpace);
}

/**
 * Determine if a circular opening should be promoted to rectangular
 * 
 * Promotion occurs when:
 * 1. Required diameter exceeds available vertical space
 * 2. Required diameter exceeds threshold fraction of available space
 * 
 * @returns Object with promotion decision and recommended dimensions
 */
function shouldPromoteToRectangular(
  requiredDiameter: number,
  availableHeight: number,
  plateWidthFt: number
): {
  shouldPromote: boolean;
  reason?: string;
  recommendedWidth?: number;
  recommendedHeight?: number;
} {
  // Case 1: Diameter exceeds available vertical space
  if (requiredDiameter > availableHeight) {
    // Calculate equivalent rectangular area
    const circleArea = Math.PI * Math.pow(requiredDiameter / 2, 2);
    const slotHeight = availableHeight * RECTANGULAR_SLOT_HEIGHT_FRACTION;
    const slotWidth = circleArea / slotHeight;
    
    return {
      shouldPromote: true,
      reason: `Diameter ${requiredDiameter.toFixed(2)} ft exceeds available height ${availableHeight.toFixed(2)} ft`,
      recommendedWidth: roundToPrecision(slotWidth),
      recommendedHeight: roundToPrecision(slotHeight)
    };
  }
  
  // Case 2: Diameter exceeds threshold fraction of available height
  if (requiredDiameter > availableHeight * CIRCULAR_TO_RECTANGULAR_THRESHOLD) {
    const circleArea = Math.PI * Math.pow(requiredDiameter / 2, 2);
    const slotHeight = availableHeight * RECTANGULAR_SLOT_HEIGHT_FRACTION;
    const slotWidth = circleArea / slotHeight;
    
    // Only promote if the rectangular slot would fit horizontally
    if (slotWidth <= plateWidthFt - 2 * MIN_PLATE_EDGE_CLEARANCE) {
      return {
        shouldPromote: true,
        reason: `Diameter ${requiredDiameter.toFixed(2)} ft exceeds ${(CIRCULAR_TO_RECTANGULAR_THRESHOLD * 100).toFixed(0)}% of available height`,
        recommendedWidth: roundToPrecision(slotWidth),
        recommendedHeight: roundToPrecision(slotHeight)
      };
    }
  }
  
  return { shouldPromote: false };
}

/**
 * ============================================================================
 * RATING CURVE UTILITIES
 * ============================================================================
 */

/**
 * Build a rating curve for a given plate configuration
 * Returns Q_total(H) for a range of heads from 0 to max head
 * 
 * This is useful for:
 * 1. Visualization in the UI
 * 2. Debugging solver behavior
 * 3. Verifying that Q increases monotonically with H
 * 
 * @param structures - Array of openings on the plate
 * @param pondInvertElevation - Bottom of pond (ft)
 * @param pondTopElevation - Top of pond (ft)
 * @param tailwaterElevation - Tailwater elevation (ft), optional
 * @param numPoints - Number of points to generate (default 50)
 */
export function buildRatingCurve(
  structures: OutfallStructure[],
  pondInvertElevation: number,
  pondTopElevation: number,
  tailwaterElevation?: number,
  numPoints: number = 50
): RatingCurvePoint[] {
  const points: RatingCurvePoint[] = [];
  const maxHead = pondTopElevation - pondInvertElevation;
  
  for (let i = 0; i <= numPoints; i++) {
    const headFt = (i / numPoints) * maxHead;
    const wseElevation = pondInvertElevation + headFt;
    
    const { totalDischarge, details } = calculateTotalDischarge(
      structures,
      wseElevation,
      tailwaterElevation
    );
    
    points.push({
      headFt,
      wseElevation,
      totalQCfs: totalDischarge,
      perOpeningQ: details.map(d => ({
        id: d.id,
        type: structures.find(s => s.id === d.id)?.type || 'circular',
        qCfs: d.result.dischargeCfs,
        flowType: d.result.flowType
      }))
    });
  }
  
  return points;
}

/**
 * Verify that a rating curve is monotonically non-decreasing
 * Q should never decrease as head increases (for a fixed plate)
 * 
 * @returns Object with validation result and any problem points
 */
export function validateRatingCurveMonotonicity(
  ratingCurve: RatingCurvePoint[]
): {
  isMonotonic: boolean;
  problemPoints: Array<{ index: number; head: number; qDrop: number }>;
} {
  const problemPoints: Array<{ index: number; head: number; qDrop: number }> = [];
  
  for (let i = 1; i < ratingCurve.length; i++) {
    const prev = ratingCurve[i - 1];
    const curr = ratingCurve[i];
    
    if (curr.totalQCfs < prev.totalQCfs - 0.001) { // Small tolerance for floating point
      problemPoints.push({
        index: i,
        head: curr.headFt,
        qDrop: prev.totalQCfs - curr.totalQCfs
      });
    }
  }
  
  return {
    isMonotonic: problemPoints.length === 0,
    problemPoints
  };
}

/**
 * ============================================================================
 * MAIN SIZING FUNCTION
 * ============================================================================
 * 
 * Creates openings incrementally using rating-curve approach with shape selection:
 * 
 * ALGORITHM:
 * 1. Process storms smallest→largest (2-yr, 5-yr, 10-yr, etc.)
 * 2. For each storm:
 *    a. Calculate design WSE from required storage
 *    b. Calculate cumulative Q from existing openings at this WSE
 *    c. If cumulative Q >= allowable Q, no new opening needed
 *    d. If cumulative Q < allowable Q, size a new opening for the remainder
 * 3. Opening placement: invert = max(previous opening top + gap, pond invert)
 * 4. Shape selection:
 *    a. First try circular orifice
 *    b. If diameter exceeds available space, promote to rectangular slot
 *    c. For largest storm, optionally use weir to plate top
 * 5. After initial sizing, run global verification across ALL storms
 * 
 * @returns Structures array and per-storm sizing results
 */
function sizeOrificesWithRatingCurve(
  pondMode: 'generic' | 'custom',
  pondAreaSqFt: number,
  pondInvertElevation: number,
  stageStorageCurve: StageStorageCurve | null | undefined,
  pondTopElevation: number,
  tailwaterElevations: Record<string, number>,
  results: ModifiedRationalResult[],
  stackingGap: number = DEFAULT_ORIFICE_STACKING_OFFSET,
  plateWidthFt: number = DEFAULT_PLATE_WIDTH,
  enableTopStageWeir: boolean = ENABLE_TOP_STAGE_WEIR
): {
  structures: OutfallStructure[];
  sizingResults: StormSizingResult[];
} {
  // Sort storms smallest→largest
  const sortedResults = [...results].sort((a, b) => 
    getStormOrder(a.stormEvent) - getStormOrder(b.stormEvent)
  );
  
  const structures: OutfallStructure[] = [];
  const sizingResults: StormSizingResult[] = [];
  
  // Determine the largest storm for potential weir treatment
  const largestStormEvent = sortedResults[sortedResults.length - 1]?.stormEvent;
  
  for (let i = 0; i < sortedResults.length; i++) {
    const result = sortedResults[i];
    const stormEvent = result.stormEvent;
    const allowableQ = result.allowableReleaseRateCfs;
    const requiredVolume = result.requiredStorageCf;
    const tailwater = tailwaterElevations[stormEvent];
    const isLargestStorm = stormEvent === largestStormEvent;
    
    // Calculate design WSE for this storm
    const designWSE = getWSEFromVolumeEnhanced(
      requiredVolume,
      pondMode,
      pondAreaSqFt,
      pondInvertElevation,
      stageStorageCurve
    );
    
    // Calculate cumulative Q from all existing openings at this storm's WSE
    let cumulativeQ = 0;
    if (structures.length > 0) {
      const { totalDischarge } = calculateTotalDischarge(structures, designWSE, tailwater);
      cumulativeQ = totalDischarge;
    }
    
    // How much more Q do we need from a new opening?
    const remainingQ = allowableQ - cumulativeQ;
    
    const sizingResult: StormSizingResult = {
      stormEvent,
      wse: designWSE,
      allowableQ,
      cumulativeQFromLower: cumulativeQ,
      remainingQ,
      structureAdded: false,
      orificeAdded: false // Backward compatibility
    };
    
    // If existing openings already handle allowable Q, no new opening needed
    if (remainingQ <= 0.001) {
      sizingResults.push(sizingResult);
      continue;
    }
    
    // Determine invert elevation: must be above previous opening's TOP
    let minInvert = pondInvertElevation;
    
    if (structures.length > 0) {
      const prevOpening = structures[structures.length - 1];
      let prevTop: number;
      if (prevOpening.type === 'circular') {
        prevTop = prevOpening.invertElevation + (prevOpening.diameterFt || 0);
      } else {
        prevTop = prevOpening.invertElevation + (prevOpening.heightFt || 0);
      }
      minInvert = prevTop + stackingGap;
    }
    
    const openingInvert = roundToPrecision(Math.max(minInvert, pondInvertElevation));
    const availableHeight = pondTopElevation - openingInvert - MIN_PLATE_EDGE_CLEARANCE;
    
    // Check if we have any vertical room
    if (availableHeight <= 0) {
      sizingResult.error = `No vertical space for ${stormEvent}: invert (${openingInvert.toFixed(2)} ft) + clearance exceeds pond top (${pondTopElevation.toFixed(2)} ft)`;
      sizingResults.push(sizingResult);
      continue;
    }
    
    // Check if design WSE provides enough head
    const headAboveInvert = designWSE - openingInvert;
    if (headAboveInvert <= 0) {
      sizingResult.error = `Design WSE (${designWSE.toFixed(2)} ft) is at or below required invert (${openingInvert.toFixed(2)} ft)`;
      sizingResults.push(sizingResult);
      continue;
    }

    // ========================================================================
    // LARGEST STORM: Consider weir option
    // ========================================================================
    if (isLargestStorm && enableTopStageWeir && headAboveInvert >= MIN_WEIR_HEAD) {
      // Try weir from crest to plate top for overflow capacity
      const weirCrestElevation = openingInvert;
      const weirHeight = pondTopElevation - weirCrestElevation;
      const headAboveCrest = designWSE - weirCrestElevation;
      
      if (headAboveCrest >= MIN_WEIR_HEAD) {
        const weirWidth = calculateWeirLength(remainingQ, headAboveCrest, DEFAULT_WEIR_CD);
        
        if (weirWidth !== null && weirWidth <= plateWidthFt - 2 * MIN_PLATE_EDGE_CLEARANCE) {
          // Weir fits! Create rectangular weir structure
          // Note: We model this as a rectangular opening with weir behavior
          const weirId = (structures.length + 1).toString();
          const newWeir: OutfallStructure = {
            id: weirId,
            invertElevation: roundToPrecision(weirCrestElevation),
            type: 'rectangular',
            widthFt: roundToPrecision(weirWidth),
            heightFt: roundToPrecision(weirHeight),
            dischargeCoefficient: DEFAULT_WEIR_CD,
            horizontalOffsetFt: 0
          };
          
          structures.push(newWeir);
          
          const weirResult = getStructureDischarge(newWeir, designWSE, tailwater);
          
          sizingResult.structureAdded = true;
          sizingResult.orificeAdded = true; // Backward compat
          sizingResult.structureId = weirId;
          sizingResult.orificeId = weirId;
          sizingResult.structureInvert = newWeir.invertElevation;
          sizingResult.orificeInvert = newWeir.invertElevation;
          sizingResult.structureType = 'weir';
          sizingResult.weirWidth = newWeir.widthFt;
          sizingResult.weirHeight = newWeir.heightFt;
          sizingResult.actualQ = weirResult.dischargeCfs;
          
          sizingResults.push(sizingResult);
          continue;
        }
      }
    }

    // ========================================================================
    // STANDARD SIZING: Try circular first, promote to rectangular if needed
    // ========================================================================
    
    // Step 1: Calculate initial circular diameter
    let initialDiameter = calculateOrificeeDiameterDirect(
      remainingQ,
      headAboveInvert / 2, // Initial estimate: centroid at half the head
      DEFAULT_ORIFICE_CD
    );
    
    if (initialDiameter === null) {
      sizingResult.error = `Could not calculate size for Q=${remainingQ.toFixed(2)} cfs at H=${headAboveInvert.toFixed(2)} ft`;
      sizingResults.push(sizingResult);
      continue;
    }
    
    // Step 2: Refine diameter with correct centroid
    const centroidHeight = initialDiameter / 2;
    const headToCentroid = headAboveInvert - centroidHeight;
    
    if (headToCentroid > 0) {
      const refinedDiameter = calculateOrificeeDiameterDirect(
        remainingQ,
        headToCentroid,
        DEFAULT_ORIFICE_CD
      );
      if (refinedDiameter !== null) {
        initialDiameter = refinedDiameter;
      }
    }
    
    // Step 3: Check if we need to promote to rectangular
    const promotion = shouldPromoteToRectangular(initialDiameter, availableHeight, plateWidthFt);
    
    if (promotion.shouldPromote && promotion.recommendedWidth && promotion.recommendedHeight) {
      // ====== CREATE RECTANGULAR SLOT ======
      let slotWidth = promotion.recommendedWidth;
      let slotHeight = promotion.recommendedHeight;
      
      // Validate slot fits within plate
      if (slotWidth > plateWidthFt - 2 * MIN_PLATE_EDGE_CLEARANCE) {
        slotWidth = roundToPrecision(plateWidthFt - 2 * MIN_PLATE_EDGE_CLEARANCE);
      }
      if (slotHeight > availableHeight) {
        slotHeight = roundToPrecision(availableHeight);
      }
      
      // Check minimums
      if (slotWidth < MIN_RECTANGULAR_WIDTH || slotHeight < MIN_RECTANGULAR_HEIGHT) {
        sizingResult.error = `Rectangular slot too small: ${slotWidth.toFixed(2)}×${slotHeight.toFixed(2)} ft (min: ${MIN_RECTANGULAR_WIDTH}×${MIN_RECTANGULAR_HEIGHT} ft)`;
        sizingResults.push(sizingResult);
        continue;
      }
      
      const slotId = (structures.length + 1).toString();
      const newSlot: OutfallStructure = {
        id: slotId,
        invertElevation: openingInvert,
        type: 'rectangular',
        widthFt: slotWidth,
        heightFt: slotHeight,
        dischargeCoefficient: DEFAULT_ORIFICE_CD,
        horizontalOffsetFt: 0
      };
      
      structures.push(newSlot);
      
      const slotResult = getStructureDischarge(newSlot, designWSE, tailwater);
      
      sizingResult.structureAdded = true;
      sizingResult.orificeAdded = true;
      sizingResult.structureId = slotId;
      sizingResult.orificeId = slotId;
      sizingResult.structureInvert = openingInvert;
      sizingResult.orificeInvert = openingInvert;
      sizingResult.structureType = 'rectangular';
      sizingResult.slotWidth = slotWidth;
      sizingResult.slotHeight = slotHeight;
      sizingResult.actualQ = slotResult.dischargeCfs;
      sizingResult.promotedFromCircular = true;
      
      sizingResults.push(sizingResult);
      continue;
    }
    
    // ====== CREATE CIRCULAR ORIFICE ======
    let diameter = initialDiameter;
    
    // Enforce minimum size
    if (diameter < MIN_ORIFICE_DIAMETER) {
      const testStruct: OutfallStructure = {
        id: 'test',
        invertElevation: openingInvert,
        type: 'circular',
        diameterFt: MIN_ORIFICE_DIAMETER,
        dischargeCoefficient: DEFAULT_ORIFICE_CD,
        horizontalOffsetFt: 0
      };
      
      const testResult = getStructureDischarge(testStruct, designWSE, tailwater);
      
      if (testResult.dischargeCfs + cumulativeQ > allowableQ + SOLVER_Q_MAX_OVERAGE) {
        sizingResult.error = `Minimum orifice (${MIN_ORIFICE_DIAMETER} ft) would exceed allowable Q`;
        sizingResults.push(sizingResult);
        continue;
      }
      
      diameter = MIN_ORIFICE_DIAMETER;
    }
    
    // Enforce maximum size (must fit vertically)
    const maxDiameter = getMaxCircularDiameter(openingInvert, pondTopElevation, plateWidthFt);
    if (diameter > maxDiameter) {
      diameter = roundToPrecision(maxDiameter);
    }
    
    diameter = roundToPrecision(diameter);
    
    const orificeId = (structures.length + 1).toString();
    const newOrifice: OutfallStructure = {
      id: orificeId,
      invertElevation: openingInvert,
      type: 'circular',
      diameterFt: diameter,
      dischargeCoefficient: DEFAULT_ORIFICE_CD,
      horizontalOffsetFt: 0
    };
    
    structures.push(newOrifice);
    
    const orificeResult = getStructureDischarge(newOrifice, designWSE, tailwater);
    
    sizingResult.structureAdded = true;
    sizingResult.orificeAdded = true;
    sizingResult.structureId = orificeId;
    sizingResult.orificeId = orificeId;
    sizingResult.structureInvert = openingInvert;
    sizingResult.orificeInvert = openingInvert;
    sizingResult.structureType = 'circular';
    sizingResult.orificeDiameter = diameter;
    sizingResult.actualQ = orificeResult.dischargeCfs;
    
    sizingResults.push(sizingResult);
  }
  
  return { structures, sizingResults };
}

/**
 * ============================================================================
 * GLOBAL VERIFICATION AND ADJUSTMENT LOOP
 * ============================================================================
 * 
 * After initial sizing, verify ALL storms against the plate and adjust as needed.
 * 
 * This is the key multi-storm evaluation step that ensures the plate works
 * for ALL storms simultaneously, not just the one being sized.
 * 
 * ALGORITHM:
 * 1. For each iteration:
 *    a. Calculate Q for EVERY storm with current plate
 *    b. Check if ANY storm exceeds allowable + tolerance
 *    c. If violations exist, shrink the responsible opening(s)
 *    d. Re-verify ALL storms
 * 2. Continue until:
 *    a. All storms satisfy Q ≤ allowable + tolerance, OR
 *    b. Max iterations reached
 * 
 * SHRINKING STRATEGY:
 * - Scale factor = sqrt(Q_allowable / Q_actual)
 * - Apply to the opening responsible for the violating storm
 * - If no specific opening, shrink all openings proportionally
 */
function verifyAndShrinkLoop(
  pondMode: 'generic' | 'custom',
  pondAreaSqFt: number,
  pondInvertElevation: number,
  stageStorageCurve: StageStorageCurve | null | undefined,
  pondTopElevation: number,
  structures: OutfallStructure[],
  tailwaterElevations: Record<string, number>,
  results: ModifiedRationalResult[],
  sizingResults: StormSizingResult[],
  maxIterations: number = 20
): {
  finalStructures: OutfallStructure[];
  violations: { stormEvent: ReturnPeriod; allowableQ: number; actualQ: number; excess: number }[];
  iterations: number;
  converged: boolean;
} {
  const sortedResults = [...results].sort((a, b) => 
    getStormOrder(a.stormEvent) - getStormOrder(b.stormEvent)
  );
  
  // Build a map of storm → assigned structure for targeted shrinking
  const stormToStructureIdx = new Map<ReturnPeriod, number>();
  sizingResults.forEach(sr => {
    if ((sr.structureAdded || sr.orificeAdded) && (sr.structureId || sr.orificeId)) {
      const structId = sr.structureId || sr.orificeId;
      const structIdx = structures.findIndex(s => s.id === structId);
      if (structIdx >= 0) {
        stormToStructureIdx.set(sr.stormEvent, structIdx);
      }
    }
  });
  
  // Make a mutable copy of structures
  const currentStructures = structures.map(s => ({ ...s }));
  let iterations = 0;
  let converged = false;
  const violations: { stormEvent: ReturnPeriod; allowableQ: number; actualQ: number; excess: number }[] = [];
  
  while (iterations < maxIterations) {
    iterations++;
    violations.length = 0;
    let anyViolation = false;
    
    // ========================================================================
    // CRITICAL: Evaluate ALL storms with current plate configuration
    // ========================================================================
    for (const result of sortedResults) {
      const stormEvent = result.stormEvent;
      const allowableQ = result.allowableReleaseRateCfs;
      const requiredVolume = result.requiredStorageCf;
      const tailwater = tailwaterElevations[stormEvent];
      
      // Get WSE for this storm's storage requirement
      const designWSE = getWSEFromVolumeEnhanced(
        requiredVolume,
        pondMode,
        pondAreaSqFt,
        pondInvertElevation,
        stageStorageCurve
      );
      
      // Calculate actual Q through plate at this WSE
      const { totalDischarge } = calculateTotalDischarge(currentStructures, designWSE, tailwater);
      const excess = totalDischarge - allowableQ;
      
      // Check if this storm exceeds allowable (with tolerance)
      if (excess > SOLVER_Q_MAX_OVERAGE) {
        anyViolation = true;
        violations.push({ stormEvent, allowableQ, actualQ: totalDischarge, excess });
        
        // ====================================================================
        // SHRINKING: Find and adjust the responsible opening
        // ====================================================================
        const assignedIdx = stormToStructureIdx.get(stormEvent);
        
        // Identify all openings that contribute flow at this WSE
        const activeOpeningIndices: number[] = [];
        for (let i = 0; i < currentStructures.length; i++) {
          if (currentStructures[i].invertElevation < designWSE) {
            activeOpeningIndices.push(i);
          }
        }
        
        // Calculate shrink factor
        const scaleFactor = Math.sqrt(allowableQ / totalDischarge);
        
        if (assignedIdx !== undefined && assignedIdx < currentStructures.length) {
          // Shrink the assigned opening
          shrinkOpening(currentStructures, assignedIdx, scaleFactor);
        } else if (activeOpeningIndices.length > 0) {
          // Shrink the highest active opening (most recently added)
          const highestIdx = activeOpeningIndices[activeOpeningIndices.length - 1];
          shrinkOpening(currentStructures, highestIdx, scaleFactor);
        } else {
          // Shrink all openings proportionally
          for (let i = 0; i < currentStructures.length; i++) {
            shrinkOpening(currentStructures, i, scaleFactor);
          }
        }
      }
    }
    
    if (!anyViolation) {
      converged = true;
      break;
    }
  }
  
  return {
    finalStructures: currentStructures,
    violations,
    iterations,
    converged
  };
}

/**
 * Helper to shrink an opening by a scale factor
 * Handles both circular and rectangular openings
 */
function shrinkOpening(
  structures: OutfallStructure[],
  index: number,
  scaleFactor: number
): void {
  const struct = structures[index];
  
  if (struct.type === 'circular' && struct.diameterFt) {
    let newDiameter = struct.diameterFt * scaleFactor;
    // Step down one increment for safety after rounding
    newDiameter = roundToPrecision(newDiameter) - 0.01;
    newDiameter = roundToPrecision(Math.max(newDiameter, MIN_ORIFICE_DIAMETER));
    
    structures[index] = { ...struct, diameterFt: newDiameter };
  } else if (struct.type === 'rectangular' && struct.widthFt && struct.heightFt) {
    // For rectangular, reduce width while keeping height fixed
    let newWidth = struct.widthFt * scaleFactor;
    newWidth = roundToPrecision(newWidth) - 0.01;
    newWidth = roundToPrecision(Math.max(newWidth, MIN_RECTANGULAR_WIDTH));
    
    structures[index] = { ...struct, widthFt: newWidth };
  }
}

/**
 * Global verification and shrink loop
 * 
 * After initial sizing, verify all storms. If any Q > allowable + MAX_OVERAGE,
 * shrink that storm's orifice proportionally and re-verify.
 * 
 * Uses scaling: D_new = D_old × sqrt(Q_target / Q_actual)
 */
function verifyAndShrinkLoopLegacy(
  pondMode: 'generic' | 'custom',
  pondAreaSqFt: number,
  pondInvertElevation: number,
  stageStorageCurve: StageStorageCurve | null | undefined,
  pondTopElevation: number,
  structures: OutfallStructure[],
  tailwaterElevations: Record<string, number>,
  results: ModifiedRationalResult[],
  sizingResults: StormSizingResult[],
  maxIterations: number = 20
): {
  finalStructures: OutfallStructure[];
  violations: { stormEvent: ReturnPeriod; allowableQ: number; actualQ: number; excess: number }[];
  iterations: number;
  converged: boolean;
} {
  const sortedResults = [...results].sort((a, b) => 
    getStormOrder(a.stormEvent) - getStormOrder(b.stormEvent)
  );
  
  // Build a map of storm→structure for easy lookup
  const stormToStructureIdx = new Map<ReturnPeriod, number>();
  sizingResults.forEach((sr, idx) => {
    if (sr.orificeAdded && sr.orificeId) {
      // Find the structure index
      const structIdx = structures.findIndex(s => s.id === sr.orificeId);
      if (structIdx >= 0) {
        stormToStructureIdx.set(sr.stormEvent, structIdx);
      }
    }
  });
  
  const currentStructures = structures.map(s => ({ ...s }));
  let iterations = 0;
  let converged = false;
  const violations: { stormEvent: ReturnPeriod; allowableQ: number; actualQ: number; excess: number }[] = [];
  
  while (iterations < maxIterations) {
    iterations++;
    violations.length = 0;
    let anyViolation = false;
    
    // Check all storms
    for (const result of sortedResults) {
      const stormEvent = result.stormEvent;
      const allowableQ = result.allowableReleaseRateCfs;
      const requiredVolume = result.requiredStorageCf;
      const tailwater = tailwaterElevations[stormEvent];
      
      const designWSE = getWSEFromVolumeEnhanced(
        requiredVolume,
        pondMode,
        pondAreaSqFt,
        pondInvertElevation,
        stageStorageCurve
      );
      
      const { totalDischarge } = calculateTotalDischarge(currentStructures, designWSE, tailwater);
      const excess = totalDischarge - allowableQ;
      
      if (excess > SOLVER_Q_MAX_OVERAGE) {
        anyViolation = true;
        violations.push({ stormEvent, allowableQ, actualQ: totalDischarge, excess });
        
        // Find which orifice to shrink - try the one assigned to this storm first,
        // then work backwards through all orifices that are submerged at this WSE
        const assignedIdx = stormToStructureIdx.get(stormEvent);
        
        // Collect all orifices that contribute flow at this WSE (invert below WSE)
        const activeOrificeIndices: number[] = [];
        for (let i = 0; i < currentStructures.length; i++) {
          if (currentStructures[i].invertElevation < designWSE) {
            activeOrificeIndices.push(i);
          }
        }
        
        if (assignedIdx !== undefined && assignedIdx < currentStructures.length) {
          const struct = currentStructures[assignedIdx];
          
          if (struct.type === 'circular' && struct.diameterFt) {
            // Scale by sqrt ratio, then step down one more increment for safety
            const scaleFactor = Math.sqrt(allowableQ / totalDischarge);
            let newDiameter = struct.diameterFt * scaleFactor;
            
            // Step down by 0.01 ft to ensure we're under after rounding
            newDiameter = roundToPrecision(newDiameter) - 0.01;
            newDiameter = roundToPrecision(Math.max(newDiameter, MIN_ORIFICE_DIAMETER));
            
            currentStructures[assignedIdx] = {
              ...struct,
              diameterFt: newDiameter
            };
          }
        } else if (activeOrificeIndices.length > 0) {
          // Shrink the highest active orifice (most recently added)
          const highestIdx = activeOrificeIndices[activeOrificeIndices.length - 1];
          const struct = currentStructures[highestIdx];
          
          if (struct.type === 'circular' && struct.diameterFt) {
            const scaleFactor = Math.sqrt(allowableQ / totalDischarge);
            let newDiameter = struct.diameterFt * scaleFactor;
            newDiameter = roundToPrecision(newDiameter) - 0.01;
            newDiameter = roundToPrecision(Math.max(newDiameter, MIN_ORIFICE_DIAMETER));
            
            currentStructures[highestIdx] = {
              ...struct,
              diameterFt: newDiameter
            };
          }
        } else {
          // No active orifices found - shrink all orifices proportionally
          const scaleFactor = Math.sqrt(allowableQ / totalDischarge);
          
          for (let i = 0; i < currentStructures.length; i++) {
            const struct = currentStructures[i];
            if (struct.type === 'circular' && struct.diameterFt) {
              let newDiameter = struct.diameterFt * scaleFactor;
              newDiameter = roundToPrecision(newDiameter) - 0.01;
              newDiameter = roundToPrecision(Math.max(newDiameter, MIN_ORIFICE_DIAMETER));
              
              currentStructures[i] = {
                ...struct,
                diameterFt: newDiameter
              };
            }
          }
        }
      }
    }
    
    if (!anyViolation) {
      converged = true;
      break;
    }
  }
  
  return {
    finalStructures: currentStructures,
    violations,
    iterations,
    converged
  };
}

/**
 * Build final enhanced results for UI display
 */
function buildEnhancedResults(
  pondMode: 'generic' | 'custom',
  pondAreaSqFt: number,
  pondInvertElevation: number,
  stageStorageCurve: StageStorageCurve | null | undefined,
  pondTopElevation: number,
  structures: OutfallStructure[],
  tailwaterElevations: Record<string, number>,
  results: ModifiedRationalResult[],
  sizingResults: StormSizingResult[]
): EnhancedSolverResult[] {
  const enhancedResults: EnhancedSolverResult[] = [];
  
  const sortedResults = [...results].sort((a, b) => 
    getStormOrder(a.stormEvent) - getStormOrder(b.stormEvent)
  );
  
  // Map storms to their assigned structures
  const stormToStruct = new Map<ReturnPeriod, OutfallStructure>();
  sizingResults.forEach(sr => {
    if (sr.orificeAdded && sr.orificeId) {
      const struct = structures.find(s => s.id === sr.orificeId);
      if (struct) {
        stormToStruct.set(sr.stormEvent, struct);
      }
    }
  });
  
  for (const result of sortedResults) {
    const stormEvent = result.stormEvent;
    const allowableQ = result.allowableReleaseRateCfs;
    const requiredVolume = result.requiredStorageCf;
    const tailwater = tailwaterElevations[stormEvent];
    
    const originalWSE = getWSEFromVolumeEnhanced(
      requiredVolume,
      pondMode,
      pondAreaSqFt,
      pondInvertElevation,
      stageStorageCurve
    );
    
    // For solved WSE, we use the design WSE (could be refined with bisection later)
    const solvedWSE = originalWSE;
    
    // Calculate total discharge at this WSE
    const { totalDischarge, details } = calculateTotalDischarge(structures, solvedWSE, tailwater);
    
    // Get the structure for this storm
    const struct = stormToStruct.get(stormEvent);
    const sizing = sizingResults.find(sr => sr.stormEvent === stormEvent);
    
    // Calculate this structure's contribution
    let thisStructureQ = 0;
    let flowType: 'orifice' | 'weir' | 'submerged_orifice' | 'submerged_weir' | 'dry' = 'dry';
    let flowTypeStr = 'dry';
    
    if (struct) {
      const detail = details.find(d => d.id === struct.id);
      if (detail) {
        thisStructureQ = detail.result.dischargeCfs;
        flowType = detail.result.flowType as typeof flowType;
        flowTypeStr = detail.result.flowType;
      }
    }
    
    const lowerStormsCumulativeQ = totalDischarge - thisStructureQ;
    const freeboardFt = pondTopElevation - solvedWSE;
    
    // Determine status
    let status: 'ok' | 'warning' | 'error' = 'ok';
    let statusMessage: string | undefined;
    
    if (sizing?.error) {
      status = 'error';
      statusMessage = sizing.error;
    } else if (totalDischarge > allowableQ + SOLVER_Q_MAX_OVERAGE) {
      status = 'error';
      statusMessage = `Actual Q (${totalDischarge.toFixed(2)} cfs) exceeds allowable (${allowableQ.toFixed(2)} cfs)`;
    } else if (freeboardFt < 0) {
      status = 'error';
      statusMessage = `Pond overflow: WSE (${solvedWSE.toFixed(2)} ft) exceeds top (${pondTopElevation.toFixed(2)} ft)`;
    } else if (freeboardFt < 1.0) {
      status = 'warning';
      statusMessage = `Low freeboard: ${freeboardFt.toFixed(2)} ft (goal: 1.0 ft)`;
    }
    
    // Check for weir regime warning
    const isWeirRegimeWarning = struct?.type === 'circular' && (flowTypeStr === 'weir' || flowTypeStr === 'submerged_weir');
    if (isWeirRegimeWarning && status === 'ok') {
      status = 'warning';
      statusMessage = 'Circular orifice operating in weir regime (partial flow)';
    }
    
    enhancedResults.push({
      stormEvent,
      converged: true,
      iterations: 0,
      allowableQCfs: allowableQ,
      structureId: struct?.id ?? '',
      structureType: struct?.type ?? 'circular',
      sizeDiameterFt: struct?.type === 'circular' ? struct.diameterFt : undefined,
      sizeWidthFt: struct?.type === 'rectangular' ? struct.widthFt : undefined,
      sizeHeightFt: struct?.type === 'rectangular' ? struct.heightFt : undefined,
      originalWSE,
      solvedWSE,
      actualQCfs: totalDischarge,
      thisStructureQCfs: thisStructureQ,
      lowerStormsCumulativeQCfs: lowerStormsCumulativeQ,
      freeboardFt,
      status,
      statusMessage,
      flowType,
      isWeirRegimeWarning
    });
  }
  
  return enhancedResults;
}

/**
 * ============================================================================
 * MAIN ENHANCED SOLVER ENTRY POINT
 * ============================================================================
 * 
 * This is the primary solver that designs an outlet plate for multiple storms.
 * 
 * ALGORITHM OVERVIEW:
 * 1. Initial sizing: Process storms smallest→largest, add openings as needed
 * 2. Shape selection: Prefer circles, promote to rectangles if space-constrained
 * 3. Top-stage weir: Optionally use weir for largest storm (emergency overflow)
 * 4. Global verification: Verify ALL storms with candidate plate
 * 5. Shrink loop: If any storm exceeds allowable, shrink and re-verify ALL storms
 * 6. Repeat until converged or max iterations reached
 * 
 * KEY FEATURES:
 * - Multi-storm evaluation: Every plate candidate is tested against ALL storms
 * - Shape selection: Circles preferred, rectangles for shallow ponds
 * - Geometry constraints: All openings fit within plate bounds, no overlaps
 * - Robust convergence: Uses sqrt scaling and bounded iteration
 * - Diagnostic output: Optional rating curve and per-storm diagnostics
 * 
 * @param pondMode - 'generic' (prism) or 'custom' (stage-storage curve)
 * @param pondAreaSqFt - Pond surface area for generic mode
 * @param pondInvertElevation - Bottom of pond (ft)
 * @param stageStorageCurve - Custom stage-storage curve (for custom mode)
 * @param pondTopElevation - Top of pond / plate (ft)
 * @param existingStructures - Existing structures (will be replaced)
 * @param tailwaterElevations - Tailwater per storm event
 * @param results - Modified Rational results for each storm
 * @param config - Solver configuration options
 * @returns Sized structures, per-storm results, and diagnostics
 */
export function runEnhancedOutfallSolver(
  pondMode: 'generic' | 'custom',
  pondAreaSqFt: number,
  pondInvertElevation: number,
  stageStorageCurve: StageStorageCurve | null | undefined,
  pondTopElevation: number,
  existingStructures: OutfallStructure[],
  tailwaterElevations: Record<string, number>,
  results: ModifiedRationalResult[],
  config?: EnhancedSolverConfig
): EnhancedSolverOutput {
  // ========================================================================
  // INPUT VALIDATION
  // ========================================================================
  if (results.length === 0) {
    return {
      results: [],
      sizedStructures: [],
      overallStatus: 'failed',
      overallMessage: 'No storm events to solve',
      failureReason: SOLVER_FAILURE.NO_STORMS
    };
  }
  
  // Extract configuration
  const stackingGap = config?.sizePrecisionFt ?? DEFAULT_ORIFICE_STACKING_OFFSET;
  const plateWidthFt = config?.plateWidthFt ?? DEFAULT_PLATE_WIDTH;
  const enableTopStageWeir = config?.enableTopStageWeir ?? ENABLE_TOP_STAGE_WEIR;
  
  // ========================================================================
  // STEP 1: Initial sizing using rating-curve approach
  // ========================================================================
  // This replaces existing structures with a new optimized set
  const { structures: initialStructures, sizingResults } = sizeOrificesWithRatingCurve(
    pondMode,
    pondAreaSqFt,
    pondInvertElevation,
    stageStorageCurve,
    pondTopElevation,
    tailwaterElevations,
    results,
    stackingGap,
    plateWidthFt,
    enableTopStageWeir
  );
  
  // Check for immediate failures (no structures created)
  const sizingErrors = sizingResults.filter(sr => sr.error);
  if (sizingErrors.length === results.length) {
    // All storms failed to size
    const enhancedResults = buildEnhancedResults(
      pondMode, pondAreaSqFt, pondInvertElevation, stageStorageCurve, pondTopElevation,
      [], tailwaterElevations, results, sizingResults
    );
    
    return {
      results: enhancedResults,
      sizedStructures: [],
      overallStatus: 'failed',
      overallMessage: `All storms failed to size: ${sizingErrors[0]?.error}`,
      failureReason: SOLVER_FAILURE.NO_PLATE_SPACE
    };
  }
  
  // ========================================================================
  // STEP 2: Global verify-and-shrink loop
  // ========================================================================
  // This ensures ALL storms satisfy Q ≤ allowable + tolerance
  const { finalStructures, violations, iterations, converged } = verifyAndShrinkLoop(
    pondMode,
    pondAreaSqFt,
    pondInvertElevation,
    stageStorageCurve,
    pondTopElevation,
    initialStructures,
    tailwaterElevations,
    results,
    sizingResults,
    config?.maxIterations ?? 20
  );
  
  // ========================================================================
  // STEP 3: Build final results
  // ========================================================================
  const enhancedResults = buildEnhancedResults(
    pondMode, pondAreaSqFt, pondInvertElevation, stageStorageCurve, pondTopElevation,
    finalStructures, tailwaterElevations, results, sizingResults
  );
  
  // ========================================================================
  // STEP 4: Build diagnostic information
  // ========================================================================
  
  // Build rating curve for the final plate
  const ratingCurve = buildRatingCurve(
    finalStructures,
    pondInvertElevation,
    pondTopElevation,
    undefined, // Use no tailwater for rating curve
    50 // 50 points
  );
  
  // Validate rating curve monotonicity
  const monotonicity = validateRatingCurveMonotonicity(ratingCurve);
  if (!monotonicity.isMonotonic) {
    console.warn('[Solver] Rating curve is not monotonic:', monotonicity.problemPoints);
  }
  
  // Build per-storm diagnostics
  const perStormDiagnostics: StormDiagnostic[] = results.map(result => {
    const stormEvent = result.stormEvent;
    const allowableQ = result.allowableReleaseRateCfs;
    const requiredVolume = result.requiredStorageCf;
    const tailwater = tailwaterElevations[stormEvent];
    
    const peakWSE = getWSEFromVolumeEnhanced(
      requiredVolume,
      pondMode,
      pondAreaSqFt,
      pondInvertElevation,
      stageStorageCurve
    );
    
    const { totalDischarge, details } = calculateTotalDischarge(finalStructures, peakWSE, tailwater);
    
    const qDiff = totalDischarge - allowableQ;
    
    return {
      stormEvent,
      allowableQCfs: allowableQ,
      designVolumeCf: requiredVolume,
      peakWSE,
      headAtPeakFt: peakWSE - pondInvertElevation,
      peakQCfs: totalDischarge,
      qDifferenceCfs: qDiff,
      qDifferencePercent: allowableQ > 0 ? (qDiff / allowableQ) * 100 : 0,
      isWithinTolerance: qDiff <= SOLVER_Q_MAX_OVERAGE,
      activeOpenings: details
        .filter(d => d.result.dischargeCfs > 0)
        .map(d => ({
          id: d.id,
          type: finalStructures.find(s => s.id === d.id)?.type || 'circular',
          qCfs: d.result.dischargeCfs,
          flowType: d.result.flowType
        }))
    };
  });
  
  // ========================================================================
  // STEP 5: Determine overall status
  // ========================================================================
  let overallStatus: 'success' | 'partial' | 'failed' = 'success';
  const errors = enhancedResults.filter(r => r.status === 'error');
  const warnings = enhancedResults.filter(r => r.status === 'warning');
  
  let failureReason: SolverFailureReason | undefined;
  
  if (errors.length > 0) {
    overallStatus = errors.length === enhancedResults.length ? 'failed' : 'partial';
    failureReason = SOLVER_FAILURE.Q_EXCEEDS_CAPACITY;
  } else if (warnings.length > 0) {
    overallStatus = 'partial';
  }
  
  let overallMessage: string | undefined;
  if (!converged && violations.length > 0) {
    overallMessage = `Could not fully converge after ${iterations} iterations. ${violations.length} violation(s) remain.`;
    overallStatus = 'partial';
    failureReason = SOLVER_FAILURE.MAX_ITERATIONS;
  } else if (errors.length > 0) {
    overallMessage = `${errors.length} storm(s) have errors. ${warnings.length} warning(s).`;
  } else if (warnings.length > 0) {
    overallMessage = `${warnings.length} warning(s). All storms within allowable Q.`;
  } else {
    overallMessage = `Solved successfully with ${finalStructures.length} opening(s). All Q ≤ allowable + ${SOLVER_Q_MAX_OVERAGE} cfs.`;
  }
  
  // Check for geometry issues
  const overlaps = detectOverlaps(finalStructures);
  if (overlaps.length > 0) {
    console.warn('[Solver] Detected overlapping structures:', overlaps);
    overallMessage += ` WARNING: ${overlaps.length} overlapping structure(s) detected.`;
    overallStatus = 'partial';
    failureReason = SOLVER_FAILURE.GEOMETRY_OVERLAP;
  }
  
  return {
    results: enhancedResults,
    sizedStructures: finalStructures,
    overallStatus,
    overallMessage,
    ratingCurve,
    perStormDiagnostics,
    failureReason
  };
}
