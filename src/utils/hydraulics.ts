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
 */
function calculateCircularWettedWidth(radius: number, headAboveInvert: number): number {
  if (headAboveInvert <= 0 || radius <= 0) return 0;
  
  // Circle center is at radius above invert
  // Water surface is at headAboveInvert above invert
  const distFromCenter = Math.abs(headAboveInvert - radius);
  
  // If water level is at or above the top, return full diameter
  if (headAboveInvert >= 2 * radius) {
    return 2 * radius;
  }
  
  // Calculate chord width: 2 * sqrt(r^2 - d^2) where d is distance from center to water surface
  const wettedWidth = 2 * Math.sqrt(radius * radius - distFromCenter * distFromCenter);
  
  // Ensure result is valid (between 0 and diameter)
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
  // Submerged if water level > invert + height (fully covering the opening)
  const isSubmerged = headAboveInvert > height;

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
