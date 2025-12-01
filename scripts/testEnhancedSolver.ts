/**
 * Enhanced Solver Verification Test Suite
 * 
 * This script creates theoretical storms and ponds of varying sizes,
 * runs them through the enhanced outfall solver, and verifies the results
 * are mathematically correct.
 */

import { 
  OutfallStructure, 
  calculateTotalDischarge,
  getStructureDischarge 
} from '../src/utils/hydraulics';
import { 
  StageStorageCurve,
  getVolumeAtElevation,
  getElevationAtVolume
} from '../src/utils/stageStorage';
import { 
  runEnhancedOutfallSolver,
  EnhancedSolverOutput,
  EnhancedSolverResult
} from '../src/utils/pondRouting';
import { ModifiedRationalResult } from '../src/utils/rationalMethod';
import { ReturnPeriod } from '../src/utils/atlas14';

// ============================================================================
// TEST CONFIGURATION
// ============================================================================

interface TestScenario {
  name: string;
  description: string;
  pondMode: 'generic' | 'custom';
  pondDims: { length: number; width: number; depth: number };
  pondInvertElevation: number;
  stageStorageCurve?: StageStorageCurve;
  structures: OutfallStructure[];
  stormEvents: ModifiedRationalResult[];
  tailwaterElevations: Record<string, number>;
}

interface TestResult {
  scenario: string;
  passed: boolean;
  errors: string[];
  warnings: string[];
  details: {
    stormEvent: string;
    allowableQ: number;
    actualQ: number;
    solvedWSE: number;
    calculatedQ: number;
    qDifference: number;
    freeboardFt: number;
    status: string;
  }[];
}

// ============================================================================
// TEST SCENARIOS
// ============================================================================

function createTestScenarios(): TestScenario[] {
  const scenarios: TestScenario[] = [];

  // Scenario 1: Small Pond, Single Storm, Single Orifice
  scenarios.push({
    name: 'Small Pond - Single Storm',
    description: 'Simple case: 50x30 pond, 2yr storm only, one 6" orifice',
    pondMode: 'generic',
    pondDims: { length: 50, width: 30, depth: 4 },
    pondInvertElevation: 100,
    structures: [{
      id: 'orifice-1',
      invertElevation: 100.5,
      type: 'circular',
      diameterFt: 0.5, // 6 inch
      dischargeCoefficient: 0.61
    }],
    stormEvents: [{
      stormEvent: '2yr' as ReturnPeriod,
      criticalDurationMinutes: 60,
      allowableReleaseRateCfs: 2.5,
      peakInflowCfs: 5.0,
      requiredStorageCf: 4500,
      durationCalculations: []
    }],
    tailwaterElevations: { '2yr': 99.0 }
  });

  // Scenario 2: Medium Pond, Multiple Storms, Stacked Orifices
  scenarios.push({
    name: 'Medium Pond - Multi-Storm Stacked',
    description: '100x60 pond, 2yr/10yr/100yr storms, three stacked orifices',
    pondMode: 'generic',
    pondDims: { length: 100, width: 60, depth: 6 },
    pondInvertElevation: 100,
    structures: [
      {
        id: 'orifice-2yr',
        invertElevation: 100.5,
        type: 'circular',
        diameterFt: 0.5,
        dischargeCoefficient: 0.61
      },
      {
        id: 'orifice-10yr',
        invertElevation: 102.0,
        type: 'circular',
        diameterFt: 0.75,
        dischargeCoefficient: 0.61
      },
      {
        id: 'orifice-100yr',
        invertElevation: 104.0,
        type: 'circular',
        diameterFt: 1.0,
        dischargeCoefficient: 0.61
      }
    ],
    stormEvents: [
      {
        stormEvent: '2yr' as ReturnPeriod,
        criticalDurationMinutes: 60,
        allowableReleaseRateCfs: 5.0,
        peakInflowCfs: 12.0,
        requiredStorageCf: 12600,
        durationCalculations: []
      },
      {
        stormEvent: '10yr' as ReturnPeriod,
        criticalDurationMinutes: 90,
        allowableReleaseRateCfs: 8.0,
        peakInflowCfs: 20.0,
        requiredStorageCf: 19440,
        durationCalculations: []
      },
      {
        stormEvent: '100yr' as ReturnPeriod,
        criticalDurationMinutes: 120,
        allowableReleaseRateCfs: 15.0,
        peakInflowCfs: 40.0,
        requiredStorageCf: 32400,
        durationCalculations: []
      }
    ],
    tailwaterElevations: { '2yr': 99.0, '10yr': 99.5, '100yr': 100.0 }
  });

  // Scenario 3: Large Pond with Custom Stage-Storage
  const customCurve: StageStorageCurve = {
    name: 'Test Custom Curve',
    invertElevation: 100,
    points: [
      { elevation: 100, cumulativeVolume: 0, area: 0, perimeter: 0 },
      { elevation: 101, cumulativeVolume: 5000, area: 5000, perimeter: 300 },
      { elevation: 102, cumulativeVolume: 12000, area: 7000, perimeter: 340 },
      { elevation: 103, cumulativeVolume: 21000, area: 9000, perimeter: 380 },
      { elevation: 104, cumulativeVolume: 32000, area: 11000, perimeter: 420 },
      { elevation: 105, cumulativeVolume: 45000, area: 13000, perimeter: 460 },
      { elevation: 106, cumulativeVolume: 60000, area: 15000, perimeter: 500 }
    ]
  };

  scenarios.push({
    name: 'Large Pond - Custom Stage-Storage',
    description: 'Irregular pond with custom stage-storage curve',
    pondMode: 'custom',
    pondDims: { length: 150, width: 100, depth: 6 }, // Not used in custom mode
    pondInvertElevation: 100,
    stageStorageCurve: customCurve,
    structures: [
      {
        id: 'rect-orifice',
        invertElevation: 101.0,
        type: 'rectangular',
        widthFt: 1.0,
        heightFt: 0.5,
        dischargeCoefficient: 0.61
      },
      {
        id: 'large-circular',
        invertElevation: 103.5,
        type: 'circular',
        diameterFt: 1.5,
        dischargeCoefficient: 0.61
      }
    ],
    stormEvents: [
      {
        stormEvent: '10yr' as ReturnPeriod,
        criticalDurationMinutes: 60,
        allowableReleaseRateCfs: 10.0,
        peakInflowCfs: 25.0,
        requiredStorageCf: 16200,
        durationCalculations: []
      },
      {
        stormEvent: '100yr' as ReturnPeriod,
        criticalDurationMinutes: 120,
        allowableReleaseRateCfs: 20.0,
        peakInflowCfs: 50.0,
        requiredStorageCf: 38880,
        durationCalculations: []
      }
    ],
    tailwaterElevations: { '10yr': 99.5, '100yr': 100.5 }
  });

  // Scenario 4: Challenging Case - High Tailwater
  scenarios.push({
    name: 'High Tailwater Challenge',
    description: 'Pond with tailwater near invert, testing submerged conditions',
    pondMode: 'generic',
    pondDims: { length: 80, width: 50, depth: 5 },
    pondInvertElevation: 100,
    structures: [{
      id: 'submerged-orifice',
      invertElevation: 100.5,
      type: 'circular',
      diameterFt: 0.75,
      dischargeCoefficient: 0.61
    }],
    stormEvents: [{
      stormEvent: '25yr' as ReturnPeriod,
      criticalDurationMinutes: 90,
      allowableReleaseRateCfs: 6.0,
      peakInflowCfs: 15.0,
      requiredStorageCf: 14580,
      durationCalculations: []
    }],
    tailwaterElevations: { '25yr': 101.5 } // High tailwater
  });

  // Scenario 5: Minimal Pond - Edge Case
  scenarios.push({
    name: 'Minimal Pond - Edge Case',
    description: 'Very small pond with low flows',
    pondMode: 'generic',
    pondDims: { length: 30, width: 20, depth: 3 },
    pondInvertElevation: 100,
    structures: [{
      id: 'small-orifice',
      invertElevation: 100.25,
      type: 'circular',
      diameterFt: 0.33, // 4 inch
      dischargeCoefficient: 0.61
    }],
    stormEvents: [{
      stormEvent: '5yr' as ReturnPeriod,
      criticalDurationMinutes: 30,
      allowableReleaseRateCfs: 1.0,
      peakInflowCfs: 2.5,
      requiredStorageCf: 1620,
      durationCalculations: []
    }],
    tailwaterElevations: { '5yr': 99.0 }
  });

  return scenarios;
}

// ============================================================================
// VERIFICATION FUNCTIONS
// ============================================================================

function verifyDischargeCalculation(
  wse: number,
  structures: OutfallStructure[],
  tailwater: number,
  expectedQ: number,
  tolerance: number = 0.1
): { passed: boolean; calculatedQ: number; difference: number } {
  const result = calculateTotalDischarge(structures, wse, tailwater);
  const calculatedQ = result.totalDischarge;
  const difference = Math.abs(calculatedQ - expectedQ);
  
  return {
    passed: difference <= tolerance,
    calculatedQ,
    difference
  };
}

function verifyWSEConsistency(
  pondMode: 'generic' | 'custom',
  pondAreaSqFt: number,
  pondInvertElevation: number,
  stageStorageCurve: StageStorageCurve | null | undefined,
  requiredVolumeCf: number,
  solvedWSE: number,
  tolerance: number = 0.1
): { passed: boolean; expectedWSE: number; difference: number } {
  let expectedWSE: number;
  
  if (pondMode === 'custom' && stageStorageCurve && stageStorageCurve.points.length >= 2) {
    expectedWSE = getElevationAtVolume(stageStorageCurve, requiredVolumeCf);
  } else {
    // Generic mode: simple prism
    const depth = requiredVolumeCf / pondAreaSqFt;
    expectedWSE = pondInvertElevation + depth;
  }
  
  const difference = Math.abs(expectedWSE - solvedWSE);
  
  return {
    passed: difference <= tolerance,
    expectedWSE,
    difference
  };
}

function verifyFreeboardCalculation(
  pondTopElevation: number,
  solvedWSE: number,
  reportedFreeboard: number,
  tolerance: number = 0.01
): { passed: boolean; expectedFreeboard: number; difference: number } {
  const expectedFreeboard = pondTopElevation - solvedWSE;
  const difference = Math.abs(expectedFreeboard - reportedFreeboard);
  
  return {
    passed: difference <= tolerance,
    expectedFreeboard,
    difference
  };
}

function verifyQDoesNotExceedAllowable(
  actualQ: number,
  allowableQ: number
): { passed: boolean; excess: number } {
  const excess = actualQ - allowableQ;
  return {
    passed: excess <= 0.01, // Small tolerance for floating point
    excess: Math.max(0, excess)
  };
}

// ============================================================================
// RUN TESTS
// ============================================================================

function runScenarioTest(scenario: TestScenario): TestResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const details: TestResult['details'] = [];

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing: ${scenario.name}`);
  console.log(`Description: ${scenario.description}`);
  console.log('='.repeat(60));

  const pondAreaSqFt = scenario.pondDims.length * scenario.pondDims.width;
  const pondTopElevation = scenario.pondMode === 'custom' && scenario.stageStorageCurve
    ? scenario.stageStorageCurve.points[scenario.stageStorageCurve.points.length - 1].elevation
    : scenario.pondInvertElevation + scenario.pondDims.depth;

  // Run the enhanced solver
  let solverOutput: EnhancedSolverOutput;
  try {
    solverOutput = runEnhancedOutfallSolver(
      scenario.pondMode,
      pondAreaSqFt,
      scenario.pondInvertElevation,
      scenario.stageStorageCurve || null,
      pondTopElevation,
      scenario.structures,
      scenario.tailwaterElevations,
      scenario.stormEvents
    );
  } catch (error) {
    errors.push(`Solver threw exception: ${error}`);
    return { scenario: scenario.name, passed: false, errors, warnings, details };
  }

  console.log(`\nSolver Status: ${solverOutput.overallStatus}`);
  console.log(`Message: ${solverOutput.overallMessage}`);
  console.log(`Sized ${solverOutput.sizedStructures.length} structures`);

  // Verify each storm result
  for (const result of solverOutput.results) {
    console.log(`\n--- Storm: ${result.stormEvent} ---`);
    
    const stormInput = scenario.stormEvents.find(e => e.stormEvent === result.stormEvent);
    if (!stormInput) {
      errors.push(`No input found for storm ${result.stormEvent}`);
      continue;
    }

    const tailwater = scenario.tailwaterElevations[result.stormEvent] || scenario.pondInvertElevation - 1;

    // Test 1: Verify discharge calculation at solved WSE
    const dischargeCheck = verifyDischargeCalculation(
      result.solvedWSE,
      solverOutput.sizedStructures,
      tailwater,
      result.actualQCfs,
      0.15 // tolerance in cfs
    );

    console.log(`  Solved WSE: ${result.solvedWSE.toFixed(2)} ft`);
    console.log(`  Reported Q: ${result.actualQCfs.toFixed(3)} cfs`);
    console.log(`  Recalculated Q: ${dischargeCheck.calculatedQ.toFixed(3)} cfs`);
    console.log(`  Q Difference: ${dischargeCheck.difference.toFixed(4)} cfs ${dischargeCheck.passed ? '✓' : '✗'}`);

    if (!dischargeCheck.passed) {
      errors.push(`[${result.stormEvent}] Discharge recalculation mismatch: reported ${result.actualQCfs.toFixed(3)}, calculated ${dischargeCheck.calculatedQ.toFixed(3)}`);
    }

    // Test 2: Verify Q does not exceed allowable
    const qExcessCheck = verifyQDoesNotExceedAllowable(result.actualQCfs, result.allowableQCfs);
    console.log(`  Allowable Q: ${result.allowableQCfs.toFixed(3)} cfs`);
    console.log(`  Q Excess: ${qExcessCheck.excess.toFixed(4)} cfs ${qExcessCheck.passed ? '✓' : '✗'}`);

    if (!qExcessCheck.passed) {
      errors.push(`[${result.stormEvent}] Actual Q (${result.actualQCfs.toFixed(3)}) exceeds allowable (${result.allowableQCfs.toFixed(3)}) by ${qExcessCheck.excess.toFixed(4)} cfs`);
    }

    // Test 3: Verify freeboard calculation
    const freeboardCheck = verifyFreeboardCalculation(
      pondTopElevation,
      result.solvedWSE,
      result.freeboardFt
    );
    console.log(`  Pond Top: ${pondTopElevation.toFixed(2)} ft`);
    console.log(`  Freeboard: ${result.freeboardFt.toFixed(2)} ft ${freeboardCheck.passed ? '✓' : '✗'}`);

    if (!freeboardCheck.passed) {
      errors.push(`[${result.stormEvent}] Freeboard mismatch: reported ${result.freeboardFt.toFixed(2)}, expected ${freeboardCheck.expectedFreeboard.toFixed(2)}`);
    }

    if (result.freeboardFt < 0) {
      warnings.push(`[${result.stormEvent}] Negative freeboard (${result.freeboardFt.toFixed(2)} ft) - pond overflow!`);
    } else if (result.freeboardFt < 0.5) {
      warnings.push(`[${result.stormEvent}] Low freeboard (${result.freeboardFt.toFixed(2)} ft) - consider increasing pond size`);
    }

    // Test 4: Verify convergence
    if (!result.converged) {
      warnings.push(`[${result.stormEvent}] Solver did not converge after ${result.iterations} iterations`);
    }

    details.push({
      stormEvent: result.stormEvent,
      allowableQ: result.allowableQCfs,
      actualQ: result.actualQCfs,
      solvedWSE: result.solvedWSE,
      calculatedQ: dischargeCheck.calculatedQ,
      qDifference: dischargeCheck.difference,
      freeboardFt: result.freeboardFt,
      status: result.status
    });
  }

  // Verify sized structures are valid
  for (const struct of solverOutput.sizedStructures) {
    if (struct.type === 'circular') {
      if (!struct.diameterFt || struct.diameterFt <= 0) {
        errors.push(`Structure ${struct.id}: Invalid diameter ${struct.diameterFt}`);
      }
      console.log(`\nStructure ${struct.id}: Circular ⌀${struct.diameterFt?.toFixed(2)}' at ${struct.invertElevation.toFixed(2)} ft`);
    } else {
      if (!struct.widthFt || struct.widthFt <= 0 || !struct.heightFt || struct.heightFt <= 0) {
        errors.push(`Structure ${struct.id}: Invalid dimensions ${struct.widthFt}x${struct.heightFt}`);
      }
      console.log(`\nStructure ${struct.id}: Rectangular ${struct.widthFt?.toFixed(2)}'×${struct.heightFt?.toFixed(2)}' at ${struct.invertElevation.toFixed(2)} ft`);
    }
  }

  const passed = errors.length === 0;
  
  console.log(`\n${'─'.repeat(40)}`);
  console.log(`Result: ${passed ? '✓ PASSED' : '✗ FAILED'}`);
  if (errors.length > 0) {
    console.log(`Errors (${errors.length}):`);
    errors.forEach(e => console.log(`  ✗ ${e}`));
  }
  if (warnings.length > 0) {
    console.log(`Warnings (${warnings.length}):`);
    warnings.forEach(w => console.log(`  ⚠ ${w}`));
  }

  return { scenario: scenario.name, passed, errors, warnings, details };
}

// ============================================================================
// MAIN
// ============================================================================

function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     ENHANCED OUTFALL SOLVER VERIFICATION TEST SUITE       ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`\nStarted at: ${new Date().toISOString()}\n`);

  const scenarios = createTestScenarios();
  const results: TestResult[] = [];

  for (const scenario of scenarios) {
    const result = runScenarioTest(scenario);
    results.push(result);
  }

  // Summary
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║                    TEST SUMMARY                            ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const totalWarnings = results.reduce((sum, r) => sum + r.warnings.length, 0);
  const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);

  console.log(`\nScenarios: ${scenarios.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total Errors: ${totalErrors}`);
  console.log(`Total Warnings: ${totalWarnings}`);

  console.log('\n--- Per-Scenario Results ---');
  for (const result of results) {
    const status = result.passed ? '✓ PASS' : '✗ FAIL';
    console.log(`  ${status} | ${result.scenario}`);
    if (!result.passed) {
      result.errors.slice(0, 3).forEach(e => console.log(`         └─ ${e}`));
      if (result.errors.length > 3) {
        console.log(`         └─ ... and ${result.errors.length - 3} more errors`);
      }
    }
  }

  console.log(`\nCompleted at: ${new Date().toISOString()}`);
  
  // Exit with appropriate code
  process.exit(failed > 0 ? 1 : 0);
}

main();
