'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Header, { Tab } from './components/Header';
import PondDesigner from './components/PondDesigner';
import Hydrology from './components/Hydrology';
import Drainage from './components/Drainage';
import OutfallDesigner from './components/OutfallDesigner';
import Reports from './components/Reports';
import ProjectImport from './components/ProjectImport';
import { ReturnPeriod, getCitiesByState, City, InterpolationMethod } from '@/utils/atlas14';
import { SiteParams, ModifiedRationalMethod, ModifiedRationalResult } from '@/utils/rationalMethod';
import { StageStorageCurve } from '@/utils/stageStorage';
import { ProjectMetadata, exportToStormforgeJson, downloadStormforgeJson, DrainageCalculationResult } from '@/utils/stormforgeImport';
import { SolvedStormResult, EnhancedSolverResult, EnhancedSolverOutput, runEnhancedOutfallSolver } from '@/utils/pondRouting';
import { OutfallStructure } from '@/utils/hydraulics';
import { getAutoSolveEnabled } from '@/utils/hydraulicsConfig';
import type { DrainageArea } from '@/utils/drainageCalculations';

export type PondMode = 'generic' | 'custom';

// Storage key for drainage areas (shared with Drainage component)
const DRAINAGE_AREAS_KEY = 'wds-stormforge-drainage-areas';
const CALC_RESULTS_KEY = 'wds-stormforge-calc-results';
const PROJECT_META_KEY = 'wds-stormforge-project-meta';
const OUTFALL_STRUCTURES_KEY = 'outfallDesigner_structures';
const TAILWATER_KEY = 'outfallDesigner_tailwater';

export default function Home() {
  // Global State
  const [activeTab, setActiveTab] = useState<Tab>('hydrology');
  const [cityId, setCityId] = useState<number>(0);
  const [selectedEvents, setSelectedEvents] = useState<ReturnPeriod[]>(['5yr', '25yr', '100yr']);
  const [interpolationMethod, setInterpolationMethod] = useState<InterpolationMethod>('log-log');
  const [citiesByState, setCitiesByState] = useState<Record<string, City[]>>({});
  const [drainageTotals, setDrainageTotals] = useState<{
    existing: {
      totalArea: number;
      weightedC: number;
      tcMinutes: number;
      flowTotals: Record<ReturnPeriod, number>;
      bypassFlowTotals: Record<ReturnPeriod, number>;
      bypassArea: number;
    };
    proposed: {
      totalArea: number;
      weightedC: number;
      tcMinutes: number;
      flowTotals: Record<ReturnPeriod, number>;
      bypassFlowTotals: Record<ReturnPeriod, number>;
      bypassArea: number;
    };
  } | null>(null);
  
  // Project metadata for C3D round-trip
  const [projectMetadata, setProjectMetadata] = useState<ProjectMetadata | null>(null);
  
  // Project import modal state
  const [showProjectImport, setShowProjectImport] = useState(false);

  // Load project metadata from localStorage after mount (avoids hydration mismatch)
  useEffect(() => {
    const stored = localStorage.getItem(PROJECT_META_KEY);
    if (stored) {
      try {
        setProjectMetadata(JSON.parse(stored) as ProjectMetadata);
      } catch {
        // Invalid JSON, ignore
      }
    }
  }, []);

  // Load cities and set default city (only once on mount)
  useEffect(() => {
    async function loadDefaultCity() {
      const citiesByState = await getCitiesByState();
      setCitiesByState(citiesByState);

      if (Object.keys(citiesByState).length > 0 && cityId === 0) {
        const firstState = Object.keys(citiesByState)[0];
        const firstCity = citiesByState[firstState][0];
        if (firstCity) {
          setCityId(firstCity.id);
        }
      }
    }
    loadDefaultCity();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  // Persist project metadata
  useEffect(() => {
    if (projectMetadata) {
      localStorage.setItem(PROJECT_META_KEY, JSON.stringify(projectMetadata));
    } else {
      localStorage.removeItem(PROJECT_META_KEY);
    }
  }, [projectMetadata]);

  // Handle project import from C3D
  const handleProjectImport = useCallback((
    areas: DrainageArea[],
    returnPeriods: ReturnPeriod[],
    projectMeta: ProjectMetadata
  ) => {
    // Save drainage areas to localStorage (Drainage component will pick them up)
    localStorage.setItem(DRAINAGE_AREAS_KEY, JSON.stringify(areas));
    
    // Update selected events
    setSelectedEvents(returnPeriods);
    
    // Save project metadata
    setProjectMetadata(projectMeta);
    
    // Navigate to drainage tab to show imported data
    setActiveTab('drainage');
    
    // Force a page refresh to reload drainage areas
    // This is needed because Drainage component loads from localStorage on mount
    window.location.reload();
  }, []);

  // Handle export to C3D
  const handleExportToC3D = useCallback(() => {
    const stored = localStorage.getItem(DRAINAGE_AREAS_KEY);
    if (!stored) {
      alert('No drainage areas to export. Please add or import drainage areas first.');
      return;
    }

    try {
      const areas = JSON.parse(stored) as DrainageArea[];
      
      // Read stored calculation results
      const storedCalcResults = localStorage.getItem(CALC_RESULTS_KEY);
      const calculationResults = new Map<string, DrainageCalculationResult[]>();
      
      if (storedCalcResults) {
        const parsed = JSON.parse(storedCalcResults) as Record<string, { returnPeriod: string; intensity: number; peakFlowCfs: number }[]>;
        for (const [areaId, results] of Object.entries(parsed)) {
          calculationResults.set(areaId, results.map(r => ({
            areaId,
            returnPeriod: r.returnPeriod as ReturnPeriod,
            intensity: r.intensity,
            peakFlowCfs: r.peakFlowCfs,
          })));
        }
      }

      const exportData = exportToStormforgeJson(areas, calculationResults, projectMetadata || undefined);
      downloadStormforgeJson(exportData, `Stormforge_Export_${new Date().toISOString().split('T')[0]}.json`);
    } catch (error) {
      console.error('Export error:', error);
      alert('Failed to export drainage areas');
    }
  }, [projectMetadata]);

  // Shared State for Outfall & Pond Designer (based on Drainage totals when available)
  // Fall back to reasonable defaults if drainage has not been configured yet
  const preDev = useMemo<SiteParams>(() => {
    if (drainageTotals && drainageTotals.existing.totalArea > 0) {
      return {
        areaAcres: drainageTotals.existing.totalArea,
        cFactor: drainageTotals.existing.weightedC,
        tcMinutes: drainageTotals.existing.tcMinutes || 15,
      };
    }
    return { areaAcres: 10, cFactor: 0.4, tcMinutes: 15 };
  }, [drainageTotals]);

  const postDev = useMemo<SiteParams>(() => {
    if (drainageTotals && drainageTotals.proposed.totalArea > 0) {
      return {
        areaAcres: drainageTotals.proposed.totalArea,
        cFactor: drainageTotals.proposed.weightedC,
        tcMinutes: drainageTotals.proposed.tcMinutes || 10,
      };
    }
    return { areaAcres: 10, cFactor: 0.85, tcMinutes: 10 };
  }, [drainageTotals]);
  
  // Pond dimensions - shared between Pond Designer and Outfall Designer
  const [pondDims, setPondDims] = useState({ length: 100, width: 100, depth: 10 });
  const [pondInvertElevation, setPondInvertElevation] = useState(100);
  
  // Pond mode and stage-storage curve for custom pond modeling
  const [pondMode, setPondMode] = useState<PondMode>(() => {
    if (typeof window === 'undefined') return 'generic';
    const stored = localStorage.getItem('wds_pondMode');
    return (stored === 'generic' || stored === 'custom') ? stored : 'generic';
  });
  
  const [stageStorageCurve, setStageStorageCurve] = useState<StageStorageCurve | null>(() => {
    if (typeof window === 'undefined') return null;
    const stored = localStorage.getItem('wds_stageStorageCurve');
    if (stored) {
      try {
        return JSON.parse(stored) as StageStorageCurve;
      } catch {
        return null;
      }
    }
    return null;
  });

  // Persist pond mode and stage-storage curve to localStorage
  useEffect(() => {
    localStorage.setItem('wds_pondMode', pondMode);
  }, [pondMode]);

  useEffect(() => {
    if (stageStorageCurve) {
      localStorage.setItem('wds_stageStorageCurve', JSON.stringify(stageStorageCurve));
    } else {
      localStorage.removeItem('wds_stageStorageCurve');
    }
  }, [stageStorageCurve]);
  
  const [pondResults, setPondResults] = useState<ModifiedRationalResult[]>([]);
  
  // Outfall structures state (lifted from OutfallDesigner for solver access)
  const [outfallStructures, setOutfallStructuresState] = useState<OutfallStructure[]>(() => {
    if (typeof window === 'undefined') {
      return [{ id: '1', type: 'circular', invertElevation: 100, horizontalOffsetFt: 0, diameterFt: 1, dischargeCoefficient: 0.6 }];
    }
    const stored = localStorage.getItem(OUTFALL_STRUCTURES_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      } catch (e) {
        console.error('Failed to parse stored structures:', e);
      }
    }
    return [{ id: '1', type: 'circular', invertElevation: 100, horizontalOffsetFt: 0, diameterFt: 1, dischargeCoefficient: 0.6 }];
  });
  
  const [tailwaterElevations, setTailwaterElevationsState] = useState<Record<string, number>>(() => {
    if (typeof window === 'undefined') {
      return {};
    }
    const stored = localStorage.getItem(TAILWATER_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (typeof parsed === 'object' && parsed !== null) {
          return parsed;
        }
      } catch (e) {
        console.error('Failed to parse stored tailwater:', e);
      }
    }
    return {};
  });
  
  // Solved outfall results (from iterative solver)
  const [solvedResults, setSolvedResults] = useState<SolvedStormResult[]>([]);
  const [enhancedSolverOutput, setEnhancedSolverOutput] = useState<EnhancedSolverOutput | null>(null);
  const [isSolving, setIsSolving] = useState(false);
  const [solverNeedsRerun, setSolverNeedsRerun] = useState(true);
  
  // Wrapped setters that persist to localStorage and mark solver as needing rerun
  const setOutfallStructures = useCallback((newStructures: OutfallStructure[] | ((prev: OutfallStructure[]) => OutfallStructure[])) => {
    setOutfallStructuresState(prev => {
      const resolved = typeof newStructures === 'function' ? newStructures(prev) : newStructures;
      if (typeof window !== 'undefined') {
        localStorage.setItem(OUTFALL_STRUCTURES_KEY, JSON.stringify(resolved));
      }
      return resolved;
    });
    setSolverNeedsRerun(true);
    setSolvedResults([]); // Clear solved results when structures change
    setEnhancedSolverOutput(null);
  }, []);
  
  const setTailwaterElevations = useCallback((newTailwater: Record<string, number> | ((prev: Record<string, number>) => Record<string, number>)) => {
    setTailwaterElevationsState(prev => {
      const resolved = typeof newTailwater === 'function' ? newTailwater(prev) : newTailwater;
      if (typeof window !== 'undefined') {
        localStorage.setItem(TAILWATER_KEY, JSON.stringify(resolved));
      }
      return resolved;
    });
    setSolverNeedsRerun(true);
    setSolvedResults([]); // Clear solved results when tailwater changes
    setEnhancedSolverOutput(null);
  }, []);
  
  // Calculate pond top elevation
  const pondTopElevation = useMemo(() => {
    if (pondMode === 'custom' && stageStorageCurve && stageStorageCurve.points.length > 0) {
      return stageStorageCurve.points[stageStorageCurve.points.length - 1].elevation;
    }
    return pondInvertElevation + pondDims.depth;
  }, [pondMode, stageStorageCurve, pondInvertElevation, pondDims.depth]);
  
  // Function to run the enhanced 3-step solver
  const runOutfallSolver = useCallback((autoSizeStructures: boolean = true) => {
    if (pondResults.length === 0) {
      setSolvedResults([]);
      setEnhancedSolverOutput(null);
      return;
    }
    
    setIsSolving(true);
    
    // Use setTimeout to allow UI to update before heavy computation
    setTimeout(() => {
      try {
        const pondAreaSqFt = pondDims.length * pondDims.width;
        
        // Run the enhanced 3-step solver
        const output = runEnhancedOutfallSolver(
          pondMode,
          pondAreaSqFt,
          pondInvertElevation,
          stageStorageCurve,
          pondTopElevation,
          outfallStructures,
          tailwaterElevations,
          pondResults
        );
        
        setEnhancedSolverOutput(output);
        
        // Convert enhanced results to legacy format for backward compatibility
        const legacyResults: SolvedStormResult[] = output.results.map(r => ({
          stormEvent: r.stormEvent,
          converged: r.converged,
          iterations: r.iterations,
          originalWSE: r.originalWSE,
          originalVolumeCf: 0, // Not tracked in enhanced
          allowableQCfs: r.allowableQCfs,
          peakInflowCfs: 0, // Not tracked in enhanced
          solvedWSE: r.solvedWSE,
          solvedVolumeCf: 0, // Not tracked in enhanced
          actualQCfs: r.actualQCfs,
          qError: Math.abs(r.actualQCfs - r.allowableQCfs),
          wseError: 0,
          warning: r.statusMessage
        }));
        
        setSolvedResults(legacyResults);
        
        // Update structures with sized values if auto-sizing
        if (autoSizeStructures && output.sizedStructures.length > 0) {
          setOutfallStructuresState(output.sizedStructures);
          if (typeof window !== 'undefined') {
            localStorage.setItem(OUTFALL_STRUCTURES_KEY, JSON.stringify(output.sizedStructures));
          }
        }
        
        setSolverNeedsRerun(false);
      } catch (error) {
        console.error('Solver error:', error);
        setSolvedResults([]);
        setEnhancedSolverOutput(null);
      } finally {
        setIsSolving(false);
      }
    }, 10);
  }, [pondResults, outfallStructures, tailwaterElevations, pondMode, pondDims, pondInvertElevation, stageStorageCurve, pondTopElevation]);

  useEffect(() => {
    if (cityId === 0) {
      setPondResults([]);
      return;
    }

    async function calculateResults() {
      try {
        const calculatedResults = await Promise.all(
          selectedEvents.map(p => 
            ModifiedRationalMethod.calculateStorage(preDev, postDev, p, cityId, interpolationMethod)
          )
        );
        setPondResults(calculatedResults);
        setSolverNeedsRerun(true);
        setSolvedResults([]); // Clear solved results when pond results change
      } catch (error) {
        console.error('Error calculating pond results:', error);
        setPondResults([]);
      }
    }

    calculateResults();
  }, [cityId, selectedEvents, preDev, postDev, interpolationMethod]);

  // Mark solver as needing rerun when pond dims or mode change
  useEffect(() => {
    setSolverNeedsRerun(true);
    setSolvedResults([]);
    setEnhancedSolverOutput(null);
  }, [pondDims, pondMode, pondInvertElevation, stageStorageCurve]);

  // Auto-solve effect
  useEffect(() => {
    if (getAutoSolveEnabled() && solverNeedsRerun && pondResults.length > 0 && !isSolving) {
      runOutfallSolver();
    }
  }, [solverNeedsRerun, pondResults, isSolving, runOutfallSolver]);

  const selectedCity = useMemo(() => {
    return Object.values(citiesByState)
      .flat()
      .find((city) => city.id === cityId) ?? null;
  }, [citiesByState, cityId]);

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Header 
        activeTab={activeTab} 
        onTabChange={setActiveTab} 
        onProjectImport={() => setShowProjectImport(true)}
        onExportToC3D={handleExportToC3D}
      />

      {/* Project Import Modal */}
      {showProjectImport && (
        <ProjectImport
          onImport={handleProjectImport}
          onClose={() => setShowProjectImport(false)}
          currentReturnPeriods={selectedEvents}
        />
      )}

      <div className="w-full border-b border-border bg-slate-900/80 sticky top-16 z-40">
        <div className="container mx-auto px-6 py-2 flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm text-gray-200">
          <div>
            Location:{' '}
            <span className="font-semibold">
              {selectedCity ? `${selectedCity.name}, ${selectedCity.state}` : 'Select a city in the Hydrology tab'}
            </span>
            {projectMetadata?.drawingName && (
              <span className="ml-4 text-gray-400">
                Project: <span className="text-primary">{projectMetadata.drawingName}</span>
              </span>
            )}
          </div>
          <div className="text-gray-400">
            Source:{' '}
            <span className="font-semibold">
              {selectedCity?.source || 'N/A'}
            </span>
          </div>
        </div>
      </div>
      
      <main className="flex-1 overflow-hidden flex flex-col">
        {activeTab === 'hydrology' && (
          <div className="flex-1 overflow-y-auto">
            <Hydrology 
              cityId={cityId} 
              setCityId={setCityId}
              selectedEvents={selectedEvents}
              setSelectedEvents={setSelectedEvents}
              interpolationMethod={interpolationMethod}
              setInterpolationMethod={setInterpolationMethod}
            />
          </div>
        )}

        {activeTab === 'drainage' && (
          <Drainage 
            cityId={cityId} 
            selectedEvents={selectedEvents} 
            onTotalsChange={setDrainageTotals}
            onReturnPeriodsDetected={setSelectedEvents}
          />
        )}

        {activeTab === 'pond' && (
           <div className="flex-1 flex flex-col overflow-hidden min-h-0">
             <PondDesigner 
               cityId={cityId} 
               selectedEvents={selectedEvents} 
               results={pondResults}
               drainageTotals={drainageTotals}
               pondDims={pondDims}
               onPondDimsChange={setPondDims}
               interpolationMethod={interpolationMethod}
               setInterpolationMethod={setInterpolationMethod}
               pondMode={pondMode}
               onPondModeChange={setPondMode}
               stageStorageCurve={stageStorageCurve}
               onStageStorageCurveChange={setStageStorageCurve}
               pondInvertElevation={pondInvertElevation}
               onPondInvertElevationChange={setPondInvertElevation}
               solvedResults={solvedResults}
               enhancedSolverOutput={enhancedSolverOutput}
             />
           </div>
        )}

        {activeTab === 'outfall' && (
           <OutfallDesigner 
             results={pondResults} 
             pondDims={pondDims}
             pondInvertElevation={pondInvertElevation}
             pondMode={pondMode}
             stageStorageCurve={stageStorageCurve}
             structures={outfallStructures}
             onStructuresChange={setOutfallStructures}
             tailwaterElevations={tailwaterElevations}
             onTailwaterChange={setTailwaterElevations}
             solvedResults={solvedResults}
             enhancedSolverOutput={enhancedSolverOutput}
             isSolving={isSolving}
             solverNeedsRerun={solverNeedsRerun}
             onRunSolver={runOutfallSolver}
           />
        )}

        {activeTab === 'reports' && (
          <div className="flex-1 overflow-y-auto">
            <Reports
              cityId={cityId}
              selectedCity={selectedCity}
              selectedEvents={selectedEvents}
              interpolationMethod={interpolationMethod}
              drainageTotals={drainageTotals}
              pondResults={pondResults}
              pondDims={pondDims}
              pondInvertElevation={pondInvertElevation}
              projectMetadata={projectMetadata}
            />
          </div>
        )}
      </main>
    </div>
  );
}
