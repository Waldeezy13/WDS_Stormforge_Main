import { extractReturnPeriods, type StormforgeExportRoot } from '../src/utils/stormforgeImport';

function assertDeepEqual<T>(actual: T, expected: T, label: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);

  if (actualJson !== expectedJson) {
    throw new Error(`${label} failed.\nExpected: ${expectedJson}\nActual:   ${actualJson}`);
  }

  console.log(`PASS: ${label}`);
}

function makeBaseRoot(): Omit<StormforgeExportRoot, 'drainageAreas'> {
  return {
    schemaVersion: '1.1',
    drawingName: 'Test.dwg',
    drawingPath: 'C:/Test/Test.dwg',
    exportedAtUtc: new Date().toISOString(),
  };
}

function run(): void {
  // Regression: explicit returnPeriods must win over designStormYR fallback.
  const explicitWinsRoot: StormforgeExportRoot = {
    ...makeBaseRoot(),
    drainageAreas: [
      {
        parcelName: 'A',
        parcelHandle: '1A',
        areaSF: 43560,
        areaAC: 1,
        daId: 'DA-1',
        targetNodeId: 'N-1',
        runoffC: 0.5,
        tcMin: 12,
        landUse: 'Test',
        pctImpervious: null,
        soilGroup: '',
        hydroMethod: 'Rational_Method',
        designStormYR: 10,
        designDurationMin: 15,
        returnPeriods: [5, 25, 100],
        iDesignInPerHr: null,
        qDesignCFS: null,
        excludeFromExport: false,
        isBypass: false,
        notes: '',
      },
    ],
  };

  const explicitDetected = extractReturnPeriods(explicitWinsRoot);
  assertDeepEqual(explicitDetected.detected, ['5yr', '25yr', '100yr'], 'Explicit periods override fallback design storm');
  assertDeepEqual(explicitDetected.allPeriods, [5, 25, 100], 'Explicit periods sorted and mapped');

  // Fallback path: no returnPeriods, use designStormYR + stormResults.
  const fallbackRoot: StormforgeExportRoot = {
    ...makeBaseRoot(),
    drainageAreas: [
      {
        parcelName: 'B',
        parcelHandle: '2B',
        areaSF: 43560,
        areaAC: 1,
        daId: 'DA-2',
        targetNodeId: 'N-2',
        runoffC: 0.45,
        tcMin: 10,
        landUse: 'Test',
        pctImpervious: null,
        soilGroup: '',
        hydroMethod: 'Rational_Method',
        designStormYR: 25,
        designDurationMin: 10,
        iDesignInPerHr: null,
        qDesignCFS: null,
        stormResults: [{ returnPeriod: 100, intensity: 4.2, peakFlow: 12.3 }],
        excludeFromExport: false,
        isBypass: false,
        notes: '',
      },
    ],
  };

  const fallbackDetected = extractReturnPeriods(fallbackRoot);
  assertDeepEqual(fallbackDetected.detected, ['25yr', '100yr'], 'Fallback detects design storm and storm results');
  assertDeepEqual(fallbackDetected.allPeriods, [25, 100], 'Fallback periods sorted and mapped');

  console.log('\nAll extractReturnPeriods tests passed.');
}

run();
