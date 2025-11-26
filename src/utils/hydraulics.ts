import { getOrificeWeirTransitionRatio } from './hydraulicsConfig';

export type OutfallStructureType = 'circular' | 'rectangular';

export interface OutfallStructure {
  id: string;
  invertElevation: number; // Elevation of the bottom of the opening (ft)
  horizontalOffsetFt?: number; // Horizontal offset from left edge of plate (ft) - defaults to 0
  type: OutfallStructureType;
  // Dimensions
  diameterFt?: number; // For circular
  widthFt?: number;    // For rectangular
  heightFt?: number;   // For rectangular (used for orifice check)
  
  // Coefficients
  dischargeCoefficient: number; // C value (typically 0.6 for orifice, varies for weir)
}

export interface OverlapRegion {
  x1: number; // Left edge (ft)
  x2: number; // Right edge (ft)
  y1: number; // Bottom elevation (ft)
  y2: number; // Top elevation (ft)
  structures: string[]; // IDs of overlapping structures
}

export interface DischargeResult {
  dischargeCfs: number;
  flowType: 'orifice' | 'weir' | 'dry';
  formula: string;
  variables: Record<string, number>;
  derivations?: Array<{
    variable: string;
    name: string;
    calculation: string;
    value: number;
    unit: string;
  }>;
}

/**
 * Gravity constant (ft/s^2)
 */
const GRAVITY = 32.2;

/**
 * Calculates flow through an orifice
 * Q = C * A * sqrt(2 * g * h)
 * Where h is head above the centroid of the opening
 */
export function calculateOrificeFlow(
  areaSqFt: number,
  headFt: number,
  c: number
): DischargeResult {
  if (headFt <= 0) {
    return { dischargeCfs: 0, flowType: 'dry', formula: 'Q = 0 (Head <= 0)', variables: { headFt } };
  }

  const sqrt2gh = Math.sqrt(2 * GRAVITY * headFt);
  const q = c * areaSqFt * sqrt2gh;

  return {
    dischargeCfs: q,
    flowType: 'orifice',
    formula: 'Q = C * A * sqrt(2 * g * h)',
    variables: {
      C: c,
      A: parseFloat(areaSqFt.toFixed(4)),
      g: GRAVITY,
      h: parseFloat(headFt.toFixed(4))
    },
    derivations: [
      {
        variable: 'A',
        name: 'Area',
        calculation: `A = ${areaSqFt.toFixed(4)}`,
        value: areaSqFt,
        unit: 'ft²'
      },
      {
        variable: 'sqrt(2gh)',
        name: 'Velocity Head Term',
        calculation: `sqrt(2 * ${GRAVITY} * ${headFt.toFixed(4)}) = ${sqrt2gh.toFixed(4)}`,
        value: sqrt2gh,
        unit: 'ft/s'
      }
    ]
  };
}

/**
 * Calculates the wetted width (chord length) for a partially submerged circular opening
 * @param radius - Radius of the circle (ft)
 * @param headAboveInvert - Head of water above the invert of the opening (ft)
 * @returns Wetted width at the water surface (ft)
 * 
 * Geometry: Circle center is at radius above invert (at y = radius).
 * Water surface is horizontal at y = headAboveInvert.
 * The chord is the horizontal line where water intersects the circle.
 * Vertical distance from center to chord: |headAboveInvert - radius|
 * Chord length = 2 * sqrt(r^2 - (vertical_dist)^2)
 */
function calculateCircularWettedWidth(radius: number, headAboveInvert: number): number {
  if (headAboveInvert <= 0 || radius <= 0) return 0;
  
  // Circle center is at radius above invert
  // Water surface is at headAboveInvert above invert
  // Vertical distance from center to water surface (chord)
  const verticalDistFromCenter = Math.abs(headAboveInvert - radius);
  
  // If water level is at or above the top, return full diameter
  if (headAboveInvert >= 2 * radius) {
    return 2 * radius;
  }
  
  // If water level is at or below invert, no wetted width
  if (headAboveInvert <= 0) {
    return 0;
  }
  
  // Calculate chord width: 2 * sqrt(r^2 - d^2) where d is vertical distance from center to chord
  // This gives the horizontal width of the circle at the water surface
  const wettedWidth = 2 * Math.sqrt(radius * radius - verticalDistFromCenter * verticalDistFromCenter);
  
  // Ensure result is valid (between 0 and diameter)
  // Handle edge case where verticalDistFromCenter >= radius (shouldn't happen if headAboveInvert < 2*radius)
  if (verticalDistFromCenter >= radius) {
    return 0;
  }
  
  return Math.max(0, Math.min(wettedWidth, 2 * radius));
}

/**
 * Calculates flow over a weir (Broad Crested / Rectangular)
 * Q = C * L * H^(1.5)
 * Note: C for weir flow is different than orifice C. 
 * Typical weir C is ~3.0 - 3.3 for broad crested, but user input C is generic.
 * If user inputs an Orifice C (~0.6), it needs conversion or distinct input.
 * However, often in these tools, users provide specific coefficients for specific equations.
 * We will use the provided coefficient directly as per standard weir equation Q = C * L * H^1.5
 */
export function calculateWeirFlow(
  lengthFt: number,
  headFt: number,
  c: number
): DischargeResult {
  if (headFt <= 0) {
    return { dischargeCfs: 0, flowType: 'dry', formula: 'Q = 0 (Head <= 0)', variables: { headFt } };
  }

  const h15 = Math.pow(headFt, 1.5);
  const q = c * lengthFt * h15;

  return {
    dischargeCfs: q,
    flowType: 'weir',
    formula: 'Q = C * L * H^1.5',
    variables: {
      C: c,
      L: parseFloat(lengthFt.toFixed(4)),
      H: parseFloat(headFt.toFixed(4))
    },
    derivations: [
      {
        variable: 'L',
        name: 'Wetted Length',
        calculation: `L = ${lengthFt.toFixed(4)}`,
        value: lengthFt,
        unit: 'ft'
      },
      {
        variable: 'H^1.5',
        name: 'Head to 1.5 Power',
        calculation: `${headFt.toFixed(4)}^1.5 = ${h15.toFixed(4)}`,
        value: h15,
        unit: 'ft^1.5'
      }
    ]
  };
}

/**
 * Calculates discharge for a single structure based on water elevation.
 * automatically transitions between Weir and Orifice flow.
 */
export function getStructureDischarge(
  structure: OutfallStructure,
  waterElevation: number
): DischargeResult {
  const headAboveInvert = waterElevation - structure.invertElevation;

  if (headAboveInvert <= 0) {
    return {
      dischargeCfs: 0,
      flowType: 'dry',
      formula: 'Water Level below Invert',
      variables: { WSE: waterElevation, Invert: structure.invertElevation }
    };
  }

  // Determine geometry properties
  let area = 0;
  let width = 0; // Effective weir length
  let height = 0; // Total height of opening
  let centroidHeight = 0;
  const derivations: Array<{ variable: string; name: string; calculation: string; value: number; unit: string }> = [];

  // Add head calculation derivation
  derivations.push({
    variable: 'Head Above Invert',
    name: 'Head Above Invert',
    calculation: `WSE - Invert = ${waterElevation.toFixed(4)} - ${structure.invertElevation.toFixed(4)}`,
    value: headAboveInvert,
    unit: 'ft'
  });

  if (structure.type === 'circular') {
    const r = (structure.diameterFt || 0) / 2;
    height = (structure.diameterFt || 0);
    area = Math.PI * r * r;
    
    derivations.push({
      variable: 'r',
      name: 'Radius',
      calculation: `r = D/2 = ${structure.diameterFt?.toFixed(4) || 0} / 2`,
      value: r,
      unit: 'ft'
    });
    
    derivations.push({
      variable: 'A',
      name: 'Area',
      calculation: `A = π * r² = π * ${r.toFixed(4)}² = ${area.toFixed(4)}`,
      value: area,
      unit: 'ft²'
    });
    
    width = structure.diameterFt || 0;
    centroidHeight = r;
  } else {
    width = structure.widthFt || 0;
    height = structure.heightFt || 0;
    area = width * height;
    
    derivations.push({
      variable: 'A',
      name: 'Area',
      calculation: `A = W * H = ${width.toFixed(4)} * ${height.toFixed(4)}`,
      value: area,
      unit: 'ft²'
    });
    
    centroidHeight = height / 2;
  }

  // Check if Submerged (Orifice Flow)
  // Standard engineering practice: orifice flow occurs when head > transitionRatio * height
  // Default transition ratio is 1.1 (conservative), standard is typically 1.4-1.5
  // This ensures the opening is fully submerged before using orifice equation
  const transitionRatio = getOrificeWeirTransitionRatio();
  const isSubmerged = headAboveInvert > (height * transitionRatio);

  if (isSubmerged) {
    // Orifice Flow - Opening is fully submerged
    // Head for orifice is measured to Centroid
    const headToCentroid = headAboveInvert - centroidHeight;
    
    derivations.push({
      variable: 'h',
      name: 'Head to Centroid',
      calculation: `h = Head Above Invert - Centroid = ${headAboveInvert.toFixed(4)} - ${centroidHeight.toFixed(4)}`,
      value: headToCentroid,
      unit: 'ft'
    });
    
    const result = calculateOrificeFlow(area, headToCentroid, structure.dischargeCoefficient);
    return {
      ...result,
      derivations: [...derivations, ...(result.derivations || [])]
    };
  } else {
    // Weir Flow - Opening is partially or not submerged
    // Water flows over/through the opening, not through it as an orifice
    
    if (structure.type === 'rectangular') {
      // Rectangular Weir: Q = C * L * H^1.5
      // L = width (wetted width at water surface)
      derivations.push({
        variable: 'L',
        name: 'Wetted Length',
        calculation: `L = Width = ${width.toFixed(4)}`,
        value: width,
        unit: 'ft'
      });
      
      const result = calculateWeirFlow(width, headAboveInvert, structure.dischargeCoefficient);
      return {
        ...result,
        derivations: [...derivations, ...(result.derivations || [])]
      };
    } else {
      // Circular Partial Flow - Treat as weir
      // Calculate actual wetted width (chord length) at the water surface
      const r = (structure.diameterFt || 0) / 2;
      const h = headAboveInvert; // Head above invert
      
      if (h <= 0 || r <= 0) {
        return {
          dischargeCfs: 0,
          flowType: 'dry',
          formula: 'Q = 0 (No water)',
          variables: { h, r },
          derivations
        };
      }
      
      // Calculate wetted width using helper function
      const wettedWidth = calculateCircularWettedWidth(r, h);
      
      if (wettedWidth <= 0) {
        return {
          dischargeCfs: 0,
          flowType: 'dry',
          formula: 'Q = 0 (No wetted width)',
          variables: { h, r, wettedWidth },
          derivations
        };
      }
      
      // Add wetted width calculation derivation
      const distFromCenter = Math.abs(h - r);
      derivations.push({
        variable: 'L',
        name: 'Wetted Width (Chord)',
        calculation: `L = 2 * sqrt(r² - d²) = 2 * sqrt(${r.toFixed(4)}² - ${distFromCenter.toFixed(4)}²) = ${wettedWidth.toFixed(4)}`,
        value: wettedWidth,
        unit: 'ft'
      });
      
      const result = calculateWeirFlow(wettedWidth, headAboveInvert, structure.dischargeCoefficient);
      return {
        ...result,
        derivations: [...derivations, ...(result.derivations || [])]
      };
    }
  }
}

/**
 * Calculates total discharge from multiple structures
 */
export function calculateTotalDischarge(
  structures: OutfallStructure[],
  waterElevation: number
): { totalDischarge: number; details: { id: string; result: DischargeResult }[] } {
  let total = 0;
  const details = [];

  for (const s of structures) {
    const result = getStructureDischarge(s, waterElevation);
    total += result.dischargeCfs;
    details.push({ id: s.id, result });
  }

  return { totalDischarge: total, details };
}

/**
 * Detects overlapping structures and returns overlap regions
 */
export function detectOverlaps(structures: OutfallStructure[]): OverlapRegion[] {
  const overlaps: OverlapRegion[] = [];
  
  // Filter out structures with invalid dimensions
  const validStructures = structures.filter(s => {
    if (s.type === 'circular') {
      return (s.diameterFt || 0) > 0;
    } else {
      return (s.widthFt || 0) > 0 && (s.heightFt || 0) > 0;
    }
  });
  
  if (validStructures.length < 2) return overlaps; // Need at least 2 structures to overlap
  
  // Get bounding boxes for each structure
  // horizontalOffsetFt is relative to center (0 = center, negative = left, positive = right)
  const boxes = validStructures.map(s => {
    const centerX = s.horizontalOffsetFt || 0; // Center position relative to plate center
    const y1 = s.invertElevation;
    
    let x1: number; // Left edge
    let x2: number; // Right edge
    let y2: number; // Top edge
    
    if (s.type === 'circular') {
      const dia = s.diameterFt || 0;
      x1 = centerX - dia / 2; // Left edge
      x2 = centerX + dia / 2; // Right edge
      y2 = y1 + dia;
    } else {
      const w = s.widthFt || 0;
      const h = s.heightFt || 0;
      x1 = centerX - w / 2; // Left edge (center the rectangle)
      x2 = centerX + w / 2; // Right edge
      y2 = y1 + h;
    }
    
    return { id: s.id, x1, y1, x2, y2 };
  });
  
  // Check all pairs for overlaps
  // NOTE: Only horizontal (X-axis) overlap is an issue. Vertical stacking is expected and fine.
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const box1 = boxes[i];
      const box2 = boxes[j];
      
      // Check if boxes overlap horizontally (X-axis intersection)
      const xOverlap = !(box1.x2 <= box2.x1 || box2.x2 <= box1.x1);
      
      // Also check if they overlap vertically (Y-axis) - if they do AND horizontally, it's a problem
      const yOverlap = !(box1.y2 <= box2.y1 || box2.y2 <= box1.y1);
      
      // Only flag as overlap if BOTH X and Y overlap (holes are actually overlapping, not just stacked)
      if (xOverlap && yOverlap) {
        // Calculate intersection region
        const overlapX1 = Math.max(box1.x1, box2.x1);
        const overlapX2 = Math.min(box1.x2, box2.x2);
        const overlapY1 = Math.max(box1.y1, box2.y1);
        const overlapY2 = Math.min(box1.y2, box2.y2);
        
        overlaps.push({
          x1: overlapX1,
          x2: overlapX2,
          y1: overlapY1,
          y2: overlapY2,
          structures: [box1.id, box2.id]
        });
      }
    }
  }
  
  return overlaps;
}

/**
 * Solver result interface
 */
export interface SolverResult {
  success: boolean;
  error?: string;
  warning?: string; // Warning message when solution is partial/constrained
  dimensions?: {
    diameterFt?: number;
    widthFt?: number;
    heightFt?: number;
  };
  actualDischarge?: number; // Actual discharge achieved with solved dimensions
  targetDischarge?: number; // Original target for reference
  isPartialSolution?: boolean; // True if solution couldn't meet target but got as close as possible
}

// Tolerance for solver - solution is acceptable if within 0.01 cfs of target
const SOLVER_TOLERANCE_CFS = 0.01;

// Round to 0.01 precision
export function roundToPrecision(value: number, precision: number = 0.01): number {
  return Math.round(value / precision) * precision;
}

/**
 * Solves for orifice size to achieve target discharge
 * Q = C * A * sqrt(2 * g * h)
 * A = Q / (C * sqrt(2 * g * h))
 */
export function solveOrificeSize(
  targetDischargeCfs: number,
  headToCentroidFt: number,
  dischargeCoefficient: number,
  structureType: OutfallStructureType,
  currentHeightFt?: number // For rectangular, keep height fixed
): SolverResult {
  if (targetDischargeCfs <= 0) {
    return { success: false, error: 'Solution cannot be found with current layout: target discharge must be positive' };
  }
  
  if (headToCentroidFt <= 0) {
    return { success: false, error: 'Solution cannot be found with current layout: head must be positive for orifice flow' };
  }
  
  if (dischargeCoefficient <= 0) {
    return { success: false, error: 'Solution cannot be found with current layout: discharge coefficient must be positive' };
  }

  const sqrt2gh = Math.sqrt(2 * GRAVITY * headToCentroidFt);
  const requiredArea = targetDischargeCfs / (dischargeCoefficient * sqrt2gh);

  if (requiredArea <= 0 || !isFinite(requiredArea)) {
    return { success: false, error: 'Solution cannot be found with current layout: calculated area is invalid' };
  }

  if (structureType === 'circular') {
    const radius = Math.sqrt(requiredArea / Math.PI);
    const diameter = 2 * radius;
    
    if (diameter <= 0 || !isFinite(diameter)) {
      return { success: false, error: 'Solution cannot be found with current layout: invalid diameter calculated' };
    }
    
    // Round to 0.01 precision
    const roundedDiameter = roundToPrecision(diameter);
    
    return {
      success: true,
      dimensions: { diameterFt: roundedDiameter }
    };
  } else {
    // Rectangular - solve for width, keep height fixed
    if (!currentHeightFt || currentHeightFt <= 0) {
      return { success: false, error: 'Solution cannot be found with current layout: height must be specified for rectangular orifice' };
    }
    
    const width = requiredArea / currentHeightFt;
    
    if (width <= 0 || !isFinite(width)) {
      return { success: false, error: 'Solution cannot be found with current layout: invalid width calculated' };
    }
    
    // Round to 0.01 precision
    const roundedWidth = roundToPrecision(width);
    const roundedHeight = roundToPrecision(currentHeightFt);
    
    return {
      success: true,
      dimensions: { widthFt: roundedWidth, heightFt: roundedHeight }
    };
  }
}

/**
 * Solves for weir size to achieve target discharge
 * Q = C * L * H^1.5
 * L = Q / (C * H^1.5)
 */
export function solveWeirSize(
  targetDischargeCfs: number,
  headAboveInvertFt: number,
  dischargeCoefficient: number,
  structureType: OutfallStructureType,
  currentHeightFt?: number // For rectangular, keep height fixed (not used in weir calc but needed for validation)
): SolverResult {
  if (targetDischargeCfs <= 0) {
    return { success: false, error: 'Solution cannot be found with current layout: target discharge must be positive' };
  }
  
  if (headAboveInvertFt <= 0) {
    return { success: false, error: 'Solution cannot be found with current layout: head must be positive for weir flow' };
  }
  
  if (dischargeCoefficient <= 0) {
    return { success: false, error: 'Solution cannot be found with current layout: discharge coefficient must be positive' };
  }

  const h15 = Math.pow(headAboveInvertFt, 1.5);
  const requiredLength = targetDischargeCfs / (dischargeCoefficient * h15);

  if (requiredLength <= 0 || !isFinite(requiredLength)) {
    return { success: false, error: 'Solution cannot be found with current layout: calculated length is invalid' };
  }

  if (structureType === 'rectangular') {
    // For rectangular weir, length = width
    // Round to 0.01 precision
    const roundedWidth = roundToPrecision(requiredLength);
    const roundedHeight = currentHeightFt ? roundToPrecision(currentHeightFt) : undefined;
    
    return {
      success: true,
      dimensions: { 
        widthFt: roundedWidth,
        heightFt: roundedHeight // Keep height unchanged if provided
      }
    };
  } else {
    // Circular weir - need to solve iteratively for diameter
    // The wetted width depends on both radius and head
    // Use binary search to find diameter that gives correct wetted width
    
    const tolerance = 0.001; // 0.001 ft tolerance for diameter
    const maxIterations = 100;
    let minDiameter = 0.01; // Minimum diameter (ft)
    let maxDiameter = 20; // Maximum reasonable diameter (ft)
    
    // Check if solution is possible at max diameter
    let testRadius = maxDiameter / 2;
    let testWettedWidth = calculateCircularWettedWidth(testRadius, headAboveInvertFt);
    if (testWettedWidth < requiredLength) {
      return { success: false, error: 'Solution cannot be found with current layout: requires diameter larger than 20 ft' };
    }
    
    // Binary search
    for (let i = 0; i < maxIterations; i++) {
      const testDiameter = (minDiameter + maxDiameter) / 2;
      const radius = testDiameter / 2;
      const wettedWidth = calculateCircularWettedWidth(radius, headAboveInvertFt);
      
      if (Math.abs(wettedWidth - requiredLength) < tolerance) {
        // Round to 0.01 precision
        const roundedDiameter = roundToPrecision(testDiameter);
        return {
          success: true,
          dimensions: { diameterFt: roundedDiameter }
        };
      }
      
      if (wettedWidth < requiredLength) {
        minDiameter = testDiameter;
      } else {
        maxDiameter = testDiameter;
      }
      
      if (maxDiameter - minDiameter < tolerance) {
        // Converged - round to 0.01 precision
        const roundedDiameter = roundToPrecision((minDiameter + maxDiameter) / 2);
        return {
          success: true,
          dimensions: { diameterFt: roundedDiameter }
        };
      }
    }
    
    return { success: false, error: 'Solution cannot be found with current layout: failed to converge on solution' };
  }
}

/**
 * Solves for structure size to achieve target discharge.
 * Uses a comprehensive search that evaluates all possible sizes within plate constraints,
 * considering both orifice and weir flow regimes to find the optimal solution.
 * 
 * Goal: Find the size that produces the MAXIMUM discharge that is <= target (allowable)
 */
export function solveStructureSize(
  structure: OutfallStructure,
  targetDischargeCfs: number,
  waterElevation: number,
  plateWidthFt?: number,
  plateHeightFt?: number,
  plateBottomElevation?: number // The elevation of the bottom of the plate (typically pond invert)
): SolverResult {
  if (targetDischargeCfs <= 0) {
    return { success: false, error: 'Target discharge must be positive' };
  }

  const headAboveInvert = waterElevation - structure.invertElevation;
  
  if (headAboveInvert <= 0) {
    return { success: false, error: 'Water level is below structure invert' };
  }

  // Define search bounds
  const minSize = 0.01; // Minimum opening size (ft)
  const maxWidth = plateWidthFt ?? 20; // Max width constraint
  const totalPlateHeight = plateHeightFt ?? 20; // Total plate height
  
  // Calculate the available vertical space for this structure
  // The structure's top cannot exceed the top of the plate
  // Available height = (plate bottom + plate height) - structure invert
  const plateBottom = plateBottomElevation ?? 0;
  const plateTop = plateBottom + totalPlateHeight;
  const availableVerticalSpace = plateTop - structure.invertElevation;
  
  // If the structure's invert is already at or above the plate top, no solution possible
  if (availableVerticalSpace <= 0) {
    return { success: false, error: `Structure invert (${structure.invertElevation.toFixed(2)} ft) is at or above the plate top (${plateTop.toFixed(2)} ft)` };
  }
  
  // For rectangular openings, we keep the current height fixed and vary width
  // For circular openings, we vary diameter (constrained by available vertical space)
  const fixedHeight = structure.type === 'rectangular' ? (structure.heightFt || 1) : undefined;
  
  // Ensure fixed height doesn't exceed available space
  const effectiveFixedHeight = fixedHeight 
    ? Math.min(fixedHeight, availableVerticalSpace) 
    : undefined;
  
  // Track the best solution found (store raw size, only round at the end)
  let bestSize: number | null = null;
  let bestDischarge = 0;
  
  // Max search size depends on structure type
  // For circular: limited by BOTH width and available vertical space
  // For rectangular: width is limited by plate width, height is already fixed
  const maxSearchSize = structure.type === 'circular' 
    ? Math.min(maxWidth, availableVerticalSpace) // Circular must fit in both dimensions
    : maxWidth;
  
  // Helper to evaluate a specific size and get discharge
  const evaluateSize = (size: number): number => {
    const testStructure: OutfallStructure = { ...structure };
    
    if (structure.type === 'circular') {
      testStructure.diameterFt = size;
    } else {
      testStructure.widthFt = size;
      testStructure.heightFt = effectiveFixedHeight;
    }
    
    const result = getStructureDischarge(testStructure, waterElevation);
    return result.dischargeCfs;
  };
  
  // Helper to update best if this is a better solution
  const updateBestIfBetter = (size: number, discharge: number): boolean => {
    // Must be at or under target (with tiny epsilon for floating point)
    if (discharge > targetDischargeCfs + 0.0001) {
      return false;
    }
    
    // Is this better than current best?
    if (discharge > bestDischarge) {
      bestSize = size;
      bestDischarge = discharge;
      return true;
    }
    return false;
  };
  
  // Step 1: Coarse search across entire range
  const coarseSteps = 200;
  const coarseStepSize = (maxSearchSize - minSize) / coarseSteps;
  
  for (let i = 0; i <= coarseSteps; i++) {
    const size = minSize + (i * coarseStepSize);
    const discharge = evaluateSize(size);
    updateBestIfBetter(size, discharge);
  }
  
  // Step 2: Fine search - check all rounded values (0.01 precision)
  // This ensures we find the exact best value at the precision we'll return
  const numFineSteps = Math.ceil((maxSearchSize - minSize) / 0.01);
  
  for (let i = 0; i <= numFineSteps; i++) {
    const size = roundToPrecision(minSize + (i * 0.01));
    if (size > maxSearchSize) break;
    
    const discharge = evaluateSize(size);
    updateBestIfBetter(size, discharge);
  }
  
  // Step 3: If we have a best, do micro-refinement around it
  // Check values just above and below to ensure we have the true best
  if (bestSize !== null) {
    // Check all values in 0.01 increments around the best
    for (let delta = -0.05; delta <= 0.05; delta += 0.01) {
      const testSize = roundToPrecision(bestSize + delta);
      if (testSize < minSize || testSize > maxSearchSize) continue;
      
      const discharge = evaluateSize(testSize);
      updateBestIfBetter(testSize, discharge);
    }
  }
  
  // No valid solution found
  if (bestSize === null) {
    return { 
      success: false, 
      error: `No valid solution found. Even the smallest opening exceeds the allowable discharge of ${targetDischargeCfs.toFixed(2)} cfs.`
    };
  }
  
  // Round the best size to 0.01 precision for the final result
  const finalSize = roundToPrecision(bestSize);
  
  // Build final dimensions
  const finalDimensions: { diameterFt?: number; widthFt?: number; heightFt?: number } = {};
  if (structure.type === 'circular') {
    finalDimensions.diameterFt = finalSize;
  } else {
    finalDimensions.widthFt = finalSize;
    finalDimensions.heightFt = effectiveFixedHeight;
  }
  
  // Verify the final solution with the exact dimensions we're returning
  const verifyStructure: OutfallStructure = {
    ...structure,
    ...finalDimensions
  };
  const verifyResult = getStructureDischarge(verifyStructure, waterElevation);
  const verifiedDischarge = verifyResult.dischargeCfs;
  const flowType = verifyResult.flowType;
  
  // Double-check: if the rounded value exceeds target, step down by 0.01
  if (verifiedDischarge > targetDischargeCfs + 0.0001) {
    const adjustedSize = roundToPrecision(finalSize - 0.01);
    if (adjustedSize >= minSize) {
      if (structure.type === 'circular') {
        finalDimensions.diameterFt = adjustedSize;
      } else {
        finalDimensions.widthFt = adjustedSize;
      }
      
      const adjustedStructure: OutfallStructure = {
        ...structure,
        ...finalDimensions
      };
      const adjustedResult = getStructureDischarge(adjustedStructure, waterElevation);
      
      // Use adjusted values
      const adjustedDischarge = adjustedResult.dischargeCfs;
      const adjustedFlowType = adjustedResult.flowType;
      
      const dischargeError = Math.abs(adjustedDischarge - targetDischargeCfs);
      
      if (dischargeError <= SOLVER_TOLERANCE_CFS) {
        return {
          success: true,
          dimensions: finalDimensions,
          actualDischarge: adjustedDischarge,
          targetDischarge: targetDischargeCfs
        };
      } else {
        const sizeDesc = structure.type === 'circular' 
          ? `diameter: ${finalDimensions.diameterFt?.toFixed(2)} ft`
          : `width: ${finalDimensions.widthFt?.toFixed(2)} ft × height: ${finalDimensions.heightFt?.toFixed(2)} ft`;
        
        return {
          success: true,
          isPartialSolution: true,
          warning: `Cannot meet allowable within 0.01 cfs. Best solution (${sizeDesc}, ${adjustedFlowType} flow) achieves ${adjustedDischarge.toFixed(2)} cfs (target: ${targetDischargeCfs.toFixed(2)} cfs)`,
          dimensions: finalDimensions,
          actualDischarge: adjustedDischarge,
          targetDischarge: targetDischargeCfs
        };
      }
    }
  }
  
  // Return result based on verified discharge
  const dischargeError = Math.abs(verifiedDischarge - targetDischargeCfs);
  
  if (dischargeError <= SOLVER_TOLERANCE_CFS) {
    // Exact or near-exact solution
    return {
      success: true,
      dimensions: finalDimensions,
      actualDischarge: verifiedDischarge,
      targetDischarge: targetDischargeCfs
    };
  } else {
    // Partial solution - best we can do without exceeding
    const sizeDesc = structure.type === 'circular' 
      ? `diameter: ${finalDimensions.diameterFt?.toFixed(2)} ft`
      : `width: ${finalDimensions.widthFt?.toFixed(2)} ft × height: ${finalDimensions.heightFt?.toFixed(2)} ft`;
    
    return {
      success: true,
      isPartialSolution: true,
      warning: `Cannot meet allowable within 0.01 cfs. Best solution (${sizeDesc}, ${flowType} flow) achieves ${verifiedDischarge.toFixed(2)} cfs (target: ${targetDischargeCfs.toFixed(2)} cfs)`,
      dimensions: finalDimensions,
      actualDischarge: verifiedDischarge,
      targetDischarge: targetDischargeCfs
    };
  }
}
