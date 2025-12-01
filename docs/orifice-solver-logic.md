# Orifice Solver Logic

## Overview

The enhanced orifice solver in WDS Stormforge uses a **rating-curve approach** to size circular orifices for stormwater detention pond outlets. This document explains the algorithm design, constraints, and implementation details.

## Problem Statement

Given:
- A detention pond with known stage-storage relationship
- Multiple design storms (2yr, 5yr, 10yr, 25yr, 50yr, 100yr)
- Each storm has a required storage volume and allowable release rate (Q_allowable)
- Tailwater elevations for each storm

Find:
- A set of stacked circular orifices that release Q ≤ Q_allowable for ALL storms simultaneously

### The Core Challenge

The fundamental difficulty is that **storms are coupled through shared orifices**. A single orifice at the pond bottom affects discharge for ALL storms, not just the one it was sized for. This creates a global optimization problem where:

1. Lower storm orifices contribute cumulative flow to higher storms
2. Sizing one orifice changes the constraints for all others
3. A greedy storm-by-storm approach often fails to find valid solutions

## Algorithm: Rating-Curve Approach

### Key Insight

Instead of sizing each orifice to match Q_allowable exactly, we size each orifice to handle only the **incremental Q** needed above what lower orifices already provide.

```
Q_incremental[k] = Q_allowable[k] - Σ(Q from orifices 1..k-1 at WSE[k])
```

### Step 1: Sort Storms by Severity

```typescript
storms.sort((a, b) => getStormOrder(a) - getStormOrder(b));
// Result: [2yr, 5yr, 10yr, 25yr, 50yr, 100yr]
```

### Step 2: Incremental Orifice Sizing

For each storm k (in ascending order):

1. **Calculate design WSE** from required storage volume
2. **Calculate cumulative Q** from all existing orifices at this WSE
3. **Calculate remaining Q needed**: `Q_remaining = Q_allowable - Q_cumulative`
4. **If Q_remaining ≤ 0**: Existing orifices are sufficient, skip adding new one
5. **If Q_remaining > 0**: Add new orifice sized for this incremental flow

### Step 3: Geometric Staging

Each orifice invert must be placed **above the previous orifice's top**:

```
invert[k] ≥ top[k-1] + gap
         = invert[k-1] + diameter[k-1] + gap
```

Default gap: 0.1 ft (configurable via `DEFAULT_ORIFICE_STACKING_OFFSET`)

This ensures:
- No physical overlap between orifices
- Storms activate orifices in order (lower storms use fewer orifices)
- Clear separation for construction

### Step 4: Direct Diameter Calculation

Instead of iterative binary search, we calculate diameter directly from the orifice equation:

```
Q = Cd × A × √(2gh)
Q = Cd × (π/4) × D² × √(2gh)

Solving for D:
D = √(4Q / (Cd × π × √(2gh)))
```

Where:
- Q = target discharge (cfs)
- Cd = discharge coefficient (default 0.60)
- g = gravity (32.2 ft/s²)
- h = head to orifice centroid (ft)

### Step 5: Global Verify-and-Shrink Loop

After initial sizing, verify ALL storms. If any Q exceeds allowable + tolerance:

1. Identify the violating storm
2. Find the orifice assigned to that storm (or highest active orifice)
3. Shrink proportionally: `D_new = D_old × √(Q_target / Q_actual)`
4. Step down by 0.01 ft for safety margin after rounding
5. Repeat until all storms pass or max iterations reached

```typescript
// Proportional scaling with safety step-down
const scaleFactor = Math.sqrt(allowableQ / actualQ);
let newDiameter = currentDiameter * scaleFactor;
newDiameter = roundToPrecision(newDiameter) - 0.01;  // Safety margin
newDiameter = Math.max(newDiameter, MIN_ORIFICE_DIAMETER);
```

## Critical Constraints

### Hard Constraint: Q Tolerance

```typescript
SOLVER_Q_MAX_OVERAGE = 0.01  // cfs
```

The solver **guarantees** that actual Q never exceeds allowable Q by more than 0.01 cfs. This is critical for report accuracy (reports show 2 decimal places).

### Minimum Orifice Diameter

```typescript
MIN_ORIFICE_DIAMETER = 0.01  // ft
```

If the calculated diameter falls below this, the solver checks if even the minimum size would exceed Q_allowable. If so, it reports "no solution" rather than creating an invalid design.

### Overlap Prevention

Before adding each orifice, the solver checks:
```typescript
if (previousOrificeTop > newOrificeInvert - 0.01) {
  return error("Cannot fit orifice: would overlap with previous");
}
```

## Failure Modes

The solver explicitly handles these failure cases:

| Condition | Error Message |
|-----------|---------------|
| No vertical space | "Cannot add orifice: no vertical space above previous orifice" |
| WSE below invert | "Design WSE is at or below required invert" |
| Min size exceeds Q | "No solution: minimum orifice exceeds allowable Q" |
| Orifice overlap | "Cannot fit orifice: would overlap with previous" |
| Non-convergence | "Could not fully converge after N iterations" |

## Why Previous Approaches Failed

### Greedy Storm-by-Storm (Old Algorithm)

The old algorithm processed each storm independently:
1. Size orifice to match Q_allowable exactly
2. Move to next storm

**Problem**: Ignored cumulative effects. An orifice sized perfectly for 2yr storm adds extra flow for 5yr, 10yr, etc., potentially causing violations.

### Step-Based Binary Search (Old Algorithm)

Used fixed step sizes (0.5", 0.25", etc.) to search for valid diameter.

**Problem**: 
- Slow (many iterations)
- Could miss valid solutions between steps
- Didn't account for global coupling

## Implementation Files

| File | Purpose |
|------|---------|
| `src/utils/pondRouting.ts` | Main solver implementation |
| `src/utils/hydraulicsConfig.ts` | Configurable constants |
| `src/utils/hydraulics.ts` | Orifice/weir discharge equations |
| `src/utils/stageStorage.ts` | Volume ↔ Elevation conversions |

### Key Functions in pondRouting.ts

```typescript
// Main entry point
runEnhancedOutfallSolver(...)

// Step 1: Rating-curve sizing
sizeOrificesWithRatingCurve(...)

// Direct D calculation
calculateOrificeeDiameterDirect(Q, head, Cd)

// Step 2: Global verification
verifyAndShrinkLoop(...)

// Step 3: Build UI results
buildEnhancedResults(...)
```

## Configuration

All solver parameters are in `hydraulicsConfig.ts`:

| Constant | Default | Description |
|----------|---------|-------------|
| `SOLVER_Q_MAX_OVERAGE` | 0.01 cfs | Max allowed Q exceedance |
| `MIN_ORIFICE_DIAMETER` | 0.01 ft | Minimum constructible diameter |
| `DEFAULT_ORIFICE_CD` | 0.60 | Discharge coefficient |
| `DEFAULT_ORIFICE_STACKING_OFFSET` | 0.10 ft | Gap between orifices |
| `GRAVITY` | 32.2 ft/s² | Gravitational constant |

## Example

**Input:**
- Pond invert: 100.00 ft
- Pond top: 108.00 ft
- Storms: 2yr (Q=1.5 cfs), 10yr (Q=3.0 cfs), 100yr (Q=5.0 cfs)

**Solver Process:**

1. **2yr Storm** (WSE = 101.50 ft)
   - No existing orifices → Q_remaining = 1.5 cfs
   - Place orifice at invert 100.00 ft
   - Size D = 0.42 ft for Q = 1.5 cfs

2. **10yr Storm** (WSE = 103.00 ft)
   - Orifice 1 provides Q = 2.1 cfs at this WSE
   - Q_remaining = 3.0 - 2.1 = 0.9 cfs
   - Place orifice at invert = 100.00 + 0.42 + 0.10 = 100.52 ft
   - Size D = 0.28 ft for Q = 0.9 cfs

3. **100yr Storm** (WSE = 105.00 ft)
   - Orifices 1+2 provide Q = 4.2 cfs at this WSE
   - Q_remaining = 5.0 - 4.2 = 0.8 cfs
   - Place orifice at invert = 100.52 + 0.28 + 0.10 = 100.90 ft
   - Size D = 0.24 ft for Q = 0.8 cfs

4. **Verify Loop**
   - Check 2yr: Q = 1.48 cfs ≤ 1.50 ✓
   - Check 10yr: Q = 2.98 cfs ≤ 3.00 ✓
   - Check 100yr: Q = 4.99 cfs ≤ 5.00 ✓
   - All pass → Done!

## Future Enhancements

- [ ] Rectangular orifice support
- [ ] Weir structure integration
- [ ] Multi-stage outlet optimization
- [ ] Sensitivity analysis tools
