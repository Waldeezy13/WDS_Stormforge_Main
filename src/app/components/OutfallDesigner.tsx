'use client';

import React, { useState, useMemo, useRef, useCallback } from 'react';
import { Trash2, Plus, CheckCircle, XCircle, AlertTriangle, ChevronDown, ChevronUp, Droplets, Waves, ArrowDownToLine, GripVertical, Sparkles, Loader2, X, ChevronUp as ChevronUpIcon, ChevronDown as ChevronDownIcon, Layers, Play, AlertCircle, Info, Circle, Square, BarChart3 } from 'lucide-react';
import { OutfallStructure, OutfallStructureType, calculateTotalDischarge, detectOverlaps, solveStructureSize, roundToPrecision, getStructureDischarge } from '@/utils/hydraulics';
import { getOrificeStackingOffset, getAutoSolveEnabled, setAutoSolveEnabled } from '@/utils/hydraulicsConfig';
import { ModifiedRationalResult } from '@/utils/rationalMethod';
import { StageStorageCurve, getElevationAtVolume } from '@/utils/stageStorage';
import { SolvedStormResult, EnhancedSolverOutput } from '@/utils/pondRouting';
import type { PondMode } from '../page';
import OutfallProfileSVG, { OutfallStyle, detectOverhangs } from './outfall/OutfallProfileSVG';
import RatingCurveChart from './charts/RatingCurveChart';
import HydrographChart, { StormHydrograph, generateSyntheticHydrograph } from './charts/HydrographChart';

interface PondDims {
  length: number;
  width: number;
  depth: number;
}

interface OutfallDesignerProps {
  results: ModifiedRationalResult[];
  pondDims: PondDims;
  pondInvertElevation?: number;
  pondMode?: PondMode;
  stageStorageCurve?: StageStorageCurve | null;
  // Lifted state from page.tsx
  structures: OutfallStructure[];
  onStructuresChange: (structures: OutfallStructure[] | ((prev: OutfallStructure[]) => OutfallStructure[])) => void;
  tailwaterElevations: Record<string, number>;
  onTailwaterChange: (tailwater: Record<string, number> | ((prev: Record<string, number>) => Record<string, number>)) => void;
  // Solver state
  solvedResults: SolvedStormResult[];
  enhancedSolverOutput?: EnhancedSolverOutput | null;
  isSolving: boolean;
  solverNeedsRerun: boolean;
  onRunSolver: (autoSize?: boolean) => void;
}

// LocalStorage keys for persistence (only for plate size and outfall style now)
const STORAGE_KEY_PLATE_SIZE = 'outfallDesigner_plateSize';
const STORAGE_KEY_OUTFALL_STYLE = 'outfallDesigner_outfallStyle';

export default function OutfallDesigner({ 
  results, 
  pondDims, 
  pondInvertElevation = 0, 
  pondMode = 'generic', 
  stageStorageCurve,
  structures,
  onStructuresChange,
  tailwaterElevations,
  onTailwaterChange,
  solvedResults,
  enhancedSolverOutput,
  isSolving,
  solverNeedsRerun,
  onRunSolver
}: OutfallDesignerProps) {
  // Calculate derived pond values
  const pondAreaSqFt = pondDims.length * pondDims.width;
  const pondTopElevation = pondMode === 'custom' && stageStorageCurve && stageStorageCurve.points.length > 0
    ? stageStorageCurve.points[stageStorageCurve.points.length - 1].elevation
    : pondInvertElevation + pondDims.depth;
  
  // Helper to get initial plate size from localStorage or default
  const getInitialPlateSize = (): { width: number; height: number } => {
    if (typeof window === 'undefined') {
      return { width: 4, height: 6 };
    }
    const stored = localStorage.getItem(STORAGE_KEY_PLATE_SIZE);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed.width === 'number' && typeof parsed.height === 'number') {
          return parsed;
        }
      } catch (e) {
        console.error('Failed to parse stored plate size:', e);
      }
    }
    return { width: 4, height: 6 };
  };

  // Helper to get initial outfall style from localStorage or default
  const getInitialOutfallStyle = (): OutfallStyle => {
    if (typeof window === 'undefined') {
      return 'orifice_plate';
    }
    const stored = localStorage.getItem(STORAGE_KEY_OUTFALL_STYLE);
    if (stored === 'orifice_plate') {
      return stored;
    }
    return 'orifice_plate';
  };

  // Outfall configuration state with persistence (only plate size and style are local now)
  const [outfallStyle, setOutfallStyleState] = useState<OutfallStyle>(getInitialOutfallStyle);
  const [plateSize, setPlateSizeState] = useState(getInitialPlateSize);
  
  // Auto-solve toggle (local state that syncs with localStorage)
  const [autoSolveEnabled, setAutoSolveEnabledState] = useState(() => getAutoSolveEnabled());
  
  // Wrapped setters that also persist to localStorage
  const setOutfallStyle = (style: OutfallStyle) => {
    setOutfallStyleState(style);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY_OUTFALL_STYLE, style);
    }
  };

  const setPlateSize = (size: { width: number; height: number }) => {
    setPlateSizeState(size);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY_PLATE_SIZE, JSON.stringify(size));
    }
  };

  // Use the lifted state setters with aliased names for compatibility
  const setStructures = onStructuresChange;
  const setTailwaterElevations = onTailwaterChange;

  const [selectedDetailEvent, setSelectedDetailEvent] = useState<string | null>(null);
  const [expandedDerivations, setExpandedDerivations] = useState<Set<string>>(new Set());
  
  // Visualization panel state
  const [showVisualization, setShowVisualization] = useState(true);
  const [selectedVisualizationStorm, setSelectedVisualizationStorm] = useState<string | null>(null);
  
  // Solver state
  const [solvingForStorm, setSolvingForStorm] = useState<string | null>(null);
  const [solverError, setSolverError] = useState<{ storm: string; message: string; isWarning?: boolean; actualFlow?: number } | null>(null);
  
  // Resizable sidebar state
  const [sidebarWidth, setSidebarWidth] = useState(320); // Default 320px (w-80)
  const isResizing = useRef(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  
  // Sidebar resize handlers
  const startResize = useCallback((e: React.MouseEvent) => {
    isResizing.current = true;
    e.preventDefault();
    
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      
      // Calculate new width from right edge of window
      const newWidth = window.innerWidth - e.clientX;
      // Clamp between 240px and 600px
      setSidebarWidth(Math.max(240, Math.min(600, newWidth)));
    };
    
    const handleMouseUp = () => {
      isResizing.current = false;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
  }, []);
  
  // Detect overlaps
  const overlaps = useMemo(() => detectOverlaps(structures), [structures]);
  
  // Detect overhangs (structures extending beyond plate boundaries)
  const overhangs = useMemo(() => detectOverhangs(structures, plateSize, pondInvertElevation), [structures, plateSize, pondInvertElevation]);
  
  // Toggle derivation expansion
  const toggleDerivation = (stageId: string) => {
    setExpandedDerivations(prev => {
      const next = new Set(prev);
      if (next.has(stageId)) {
        next.delete(stageId);
      } else {
        next.add(stageId);
      }
      return next;
    });
  };

  // Handle solver for a specific storm and structure
  const handleSolveForStorm = (structureId: string, stormEvent: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent row click
    
    const structure = structures.find(s => s.id === structureId);
    if (!structure) {
      setSolverError({ 
        storm: stormEvent, 
        message: 'Structure not found.' 
      });
      return;
    }
    
    // Find the storm data
    const stormData = summaryData.find(d => d.res.stormEvent === stormEvent);
    if (!stormData) {
      setSolverError({ 
        storm: stormEvent, 
        message: 'Storm data not found.' 
      });
      return;
    }
    
    const totalAllowable = stormData.res.allowableReleaseRateCfs;
    if (totalAllowable <= 0) {
      setSolverError({ 
        storm: stormEvent, 
        message: 'Target discharge must be positive.' 
      });
      return;
    }
    
    // Calculate discharge from ALL OTHER structures at this WSE
    // These are already set and will contribute to the total discharge
    const tailwater = tailwaterElevations[stormEvent]; // May be undefined
    const otherStructures = structures.filter(s => s.id !== structureId);
    let otherStructuresDischarge = 0;
    for (const otherStructure of otherStructures) {
      const result = getStructureDischarge(otherStructure, stormData.wse, tailwater);
      otherStructuresDischarge += result.dischargeCfs;
    }
    
    // The target for THIS structure is: allowable - other structures' discharge
    const remainingAllowable = totalAllowable - otherStructuresDischarge;
    
    if (remainingAllowable <= 0) {
      setSolverError({ 
        storm: stormEvent, 
        message: `Other stages already discharge ${otherStructuresDischarge.toFixed(2)} cfs, which meets or exceeds the allowable of ${totalAllowable.toFixed(2)} cfs. No additional discharge needed from this stage.`
      });
      return;
    }
    
    setSolvingForStorm(`${structureId}-${stormEvent}`);
    setSolverError(null);
    
    // Solve for structure size to achieve the REMAINING allowable
    // Pass pond invert elevation so solver can check vertical plate constraints
    const result = solveStructureSize(
      structure,
      remainingAllowable,
      stormData.wse,
      plateSize.width,
      plateSize.height,
      pondInvertElevation // Plate bottom elevation
    );
    
    setSolvingForStorm(null);
    
    // If solver completely failed (no dimensions returned), show error
    if (!result.success && !result.dimensions) {
      setSolverError({ 
        storm: stormEvent, 
        message: result.error || 'Solution not found' 
      });
      return;
    }
    
    // Update the structure with solved dimensions (whether full or partial solution)
    if (result.dimensions) {
      setStructures(structures.map(s => {
        if (s.id !== structureId) return s;
        
        const updated: OutfallStructure = { ...s };
        
        if (s.type === 'circular' && result.dimensions?.diameterFt !== undefined) {
          updated.diameterFt = result.dimensions.diameterFt;
        } else if (s.type === 'rectangular') {
          if (result.dimensions?.widthFt !== undefined) {
            updated.widthFt = result.dimensions.widthFt;
          }
          if (result.dimensions?.heightFt !== undefined) {
            updated.heightFt = result.dimensions.heightFt;
          }
        }
        
        return updated;
      }));
    }
    
    // If it's a partial solution (couldn't meet target exactly), show warning
    if (result.isPartialSolution && result.warning) {
      // Calculate total discharge including solved structure
      const newTotalDischarge = otherStructuresDischarge + (result.actualDischarge || 0);
      const contextMsg = otherStructures.length > 0 
        ? `\n\nOther stages contribute: ${otherStructuresDischarge.toFixed(2)} cfs\nThis stage contributes: ${(result.actualDischarge || 0).toFixed(2)} cfs\nTotal discharge: ${newTotalDischarge.toFixed(2)} cfs (allowable: ${totalAllowable.toFixed(2)} cfs)`
        : '';
      
      setSolverError({ 
        storm: stormEvent, 
        message: result.warning + contextMsg,
        isWarning: true,
        actualFlow: newTotalDischarge
      });
      // Don't auto-dismiss - let user acknowledge
      return;
    }
    
    // If there's just a general warning message, show it briefly
    if (result.warning && result.success) {
      setSolverError({ 
        storm: stormEvent, 
        message: result.warning,
        isWarning: true,
        actualFlow: result.actualDischarge
      });
      // Clear the warning after 5 seconds
      setTimeout(() => setSolverError(null), 5000);
    }
  };

  // --- Helper: Calculate WSE from Volume ---
  const getWSE = (volumeCf: number) => {
    // Use stage-storage curve interpolation in custom mode
    if (pondMode === 'custom' && stageStorageCurve && stageStorageCurve.points.length >= 2) {
      return getElevationAtVolume(stageStorageCurve, volumeCf);
    }
    // Simple Prism Assumption: Depth = Vol / Area
    // WSE = Invert + Depth
    return pondInvertElevation + (volumeCf / pondAreaSqFt);
  };

  // --- Handlers ---
  const addStructure = () => {
    const newId = (structures.length + 1).toString();
    
    // Find the highest invert elevation (top of highest structure)
    const highestInvert = Math.max(...structures.map(s => {
      if (s.type === 'circular') {
        return s.invertElevation + (s.diameterFt || 0);
      } else {
        return s.invertElevation + (s.heightFt || 0);
      }
    }), pondInvertElevation);
    
    // New structure: 0.1 ft above the previous highest structure, centered horizontally
    setStructures([...structures, { 
      id: newId, 
      type: 'circular', 
      invertElevation: highestInvert + 0.1, 
      horizontalOffsetFt: 0, // Center position
      diameterFt: 1, 
      dischargeCoefficient: 0.6 
    }]);
  };

  const updateStructure = (id: string, field: keyof OutfallStructure, value: string | number) => {
    setStructures(structures.map(s => {
      if (s.id !== id) return s;
      return { ...s, [field]: value };
    }));
  };

  const removeStructure = (id: string) => {
    setStructures(structures.filter(s => s.id !== id));
  };

  // Pre-calculate summary data for all events
  const summaryData = results.map(res => {
    const wse = getWSE(res.requiredStorageCf);
    const waterDepth = wse - pondInvertElevation;
    const freeboard = pondTopElevation - wse;
    const tailwater = tailwaterElevations[res.stormEvent]; // May be undefined
    const { totalDischarge, details, hasSubmergence, worstSubmergenceLevel } = calculateTotalDischarge(structures, wse, tailwater);
    const isPassing = totalDischarge <= res.allowableReleaseRateCfs;
    const hasAdequateFreeboard = freeboard >= 1.0; // Typically 1ft minimum freeboard
    return { res, wse, waterDepth, freeboard, totalDischarge, details, isPassing, hasAdequateFreeboard, tailwater, hasSubmergence, submergenceLevel: worstSubmergenceLevel };
  });

  // Determine which event to show detailed breakdown for (default to first if none selected)
  const detailView = selectedDetailEvent 
    ? summaryData.find(d => d.res.stormEvent === selectedDetailEvent)
    : summaryData[0];
  
  // Prepare WSE List for Visualization
  const wseVisList = [
    // Add pond top elevation line
    {
      label: 'TOP',
      elevation: pondTopElevation,
      color: '#94a3b8',
      isPassing: true,
      isTopLine: true
    },
    // Storm water levels
    ...summaryData.map(d => ({
      label: d.res.stormEvent.toUpperCase(),
      elevation: d.wse,
      color: d.res.stormEvent === '100yr' ? '#ef4444' : d.res.stormEvent === '25yr' ? '#facc15' : '#4ade80',
      isPassing: d.isPassing && d.hasAdequateFreeboard,
      isTopLine: false
    }))
  ];

  // Prepare Rating Curve chart data
  const ratingCurveStormData = useMemo(() => {
    return summaryData.map(d => ({
      stormEvent: d.res.stormEvent,
      allowableQCfs: d.res.allowableReleaseRateCfs,
      designHeadFt: d.wse - pondInvertElevation,
      actualQCfs: d.totalDischarge,
      wse: d.wse
    }));
  }, [summaryData, pondInvertElevation]);

  // Prepare Hydrograph data
  const hydrographData = useMemo<StormHydrograph[]>(() => {
    if (structures.length === 0) return [];
    
    // Create a rating curve function for outflow calculation
    const outflowRatingCurve = (wse: number): number => {
      const { totalDischarge } = calculateTotalDischarge(structures, wse, undefined);
      return totalDischarge;
    };
    
    return summaryData.map(d => {
      // Get time of concentration from the result (or default to 15 min)
      const tcMinutes = d.res.criticalDurationMinutes || 15;
      
      return generateSyntheticHydrograph(
        d.res.stormEvent,
        tcMinutes,
        d.res.peakInflowCfs,
        d.res.allowableReleaseRateCfs,
        d.res.requiredStorageCf,
        pondInvertElevation,
        pondAreaSqFt,
        outflowRatingCurve
      );
    });
  }, [summaryData, structures, pondInvertElevation, pondAreaSqFt]);

  return (
    <div className="h-full flex bg-slate-50/50 dark:bg-slate-900/50 overflow-hidden">
      
      {/* Left Main Content */}
      <div className="flex-1 flex flex-col gap-6 p-6 overflow-y-auto">
        
        {/* Overlap Warning */}
        {overlaps.length > 0 && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="font-semibold text-red-600 dark:text-red-400 mb-1">Overlapping Openings Detected</h4>
              <p className="text-sm text-muted-foreground">
                {overlaps.length} horizontal overlap{overlaps.length > 1 ? 's' : ''} detected. Openings are overlapping side-by-side, which will cause inaccurate calculations. 
                Overlapping areas are highlighted in <span className="text-red-500 font-medium">RED</span> in the profile view.
              </p>
              <p className="text-xs text-muted-foreground mt-1 italic">
                Note: Vertical stacking (holes at different elevations) is expected and not an issue.
              </p>
              <ul className="mt-2 text-xs text-muted-foreground list-disc list-inside space-y-1">
                {overlaps.map((overlap, idx) => (
                  <li key={idx}>
                    Stages {overlap.structures.join(' & ')} overlap horizontally at {overlap.x1.toFixed(2)}&apos; - {overlap.x2.toFixed(2)}&apos; (elevation {overlap.y1.toFixed(2)}&apos; - {overlap.y2.toFixed(2)}&apos;)
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
        
        {/* Overhang Warning */}
        {overhangs.length > 0 && (
          <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="font-semibold text-orange-600 dark:text-orange-400 mb-1">Openings Extend Beyond Plate</h4>
              <p className="text-sm text-muted-foreground">
                {overhangs.length} opening{overhangs.length > 1 ? 's extend' : ' extends'} beyond the {plateSize.width}&apos; × {plateSize.height}&apos; plate boundaries. 
                Overhanging areas are highlighted in <span className="text-orange-500 font-medium">ORANGE</span> in the profile view.
              </p>
              <p className="text-xs text-muted-foreground mt-1 italic">
                Adjust the plate size or orifice dimensions/positions to fit within the plate.
              </p>
              <ul className="mt-2 text-xs text-muted-foreground list-disc list-inside space-y-1">
                {overhangs.map((overhang, idx) => (
                  <li key={idx}>
                    Stage #{overhang.id} extends {overhang.type === 'left' ? 'left' : overhang.type === 'right' ? 'right' : overhang.type === 'top' ? 'above' : 'below'} the plate
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
        
        {/* 1. Pond Design Summary */}
        <section className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-4">
            <Waves className="w-5 h-5 text-primary" />
            <h3 className="font-semibold">Design Storm Water Levels</h3>
            <div className="ml-auto text-xs text-muted-foreground">
              Pond Top: <span className="font-mono font-medium text-foreground">{pondTopElevation.toFixed(2)} ft</span>
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left rounded-tl-md">Storm</th>
                  <th className="px-3 py-2 text-right">WSE (ft)</th>
                  <th className="px-3 py-2 text-right">Tailwater (ft)</th>
                  <th className="px-3 py-2 text-right">Water Depth (ft)</th>
                  <th className="px-3 py-2 text-right">Freeboard (ft)</th>
                  <th className="px-3 py-2 text-right">Allowable Q (cfs)</th>
                  <th className="px-3 py-2 text-right">Actual Q (cfs)</th>
                  <th className="px-3 py-2 text-center rounded-tr-md">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {summaryData.map((data) => {
                  const overallPass = data.isPassing && data.hasAdequateFreeboard;
                  return (
                    <tr 
                      key={data.res.stormEvent} 
                      onClick={() => setSelectedDetailEvent(data.res.stormEvent)}
                      className={`cursor-pointer transition-colors hover:bg-muted/30 ${
                        selectedDetailEvent === data.res.stormEvent ? 'bg-primary/10' : ''
                      }`}
                    >
                      <td className="px-3 py-3">
                        <span className={`text-xs font-bold px-2 py-1 rounded uppercase ${
                          overallPass 
                            ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' 
                            : 'bg-red-500/20 text-red-600 dark:text-red-400'
                        }`}>
                          {data.res.stormEvent}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right font-mono">{data.wse.toFixed(2)}</td>
                      <td className="px-3 py-3 text-right" onClick={e => e.stopPropagation()}>
                        <input 
                          type="text"
                          inputMode="decimal"
                          placeholder="—"
                          defaultValue={data.tailwater !== undefined ? data.tailwater.toFixed(2) : ''}
                          key={`tw-${data.res.stormEvent}-${data.tailwater}`}
                          onBlur={e => {
                            const value = parseFloat(e.target.value);
                            if (e.target.value === '' || e.target.value.trim() === '') {
                              // Clear tailwater for this storm
                              setTailwaterElevations(prev => {
                                const next = { ...prev };
                                delete next[data.res.stormEvent];
                                return next;
                              });
                            } else if (!isNaN(value)) {
                              setTailwaterElevations(prev => ({
                                ...prev,
                                [data.res.stormEvent]: roundToPrecision(value)
                              }));
                            }
                          }}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.currentTarget.blur();
                            }
                          }}
                          className={`w-16 bg-background border rounded px-2 py-1 text-xs font-mono text-right focus:ring-1 focus:ring-primary outline-none ${
                            data.submergenceLevel === 'full' 
                              ? 'border-red-500 text-red-400' 
                              : data.submergenceLevel === 'partial'
                                ? 'border-amber-500 text-amber-400'
                                : 'border-input'
                          }`}
                          title="Tailwater elevation (leave empty for free discharge)"
                        />
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-primary">{data.waterDepth.toFixed(2)}</td>
                      <td className={`px-3 py-3 text-right font-mono font-medium ${
                        data.hasAdequateFreeboard ? 'text-emerald-500' : 'text-red-500'
                      }`}>
                        {data.freeboard.toFixed(2)}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-muted-foreground">
                        {data.res.allowableReleaseRateCfs.toFixed(2)}
                      </td>
                      <td className={`px-3 py-3 text-right font-mono font-medium ${
                        data.isPassing ? 'text-emerald-500' : 'text-red-500'
                      }`}>
                        <div className="flex items-center justify-end gap-1">
                          {data.submergenceLevel === 'full' && (
                            <span title="Fully submerged - tailwater above top of opening">
                              <Waves className="w-3 h-3 text-red-400" />
                            </span>
                          )}
                          {data.submergenceLevel === 'partial' && (
                            <span title="Partially submerged - tailwater in opening">
                              <Waves className="w-3 h-3 text-amber-400" />
                            </span>
                          )}
                          {data.totalDischarge.toFixed(2)}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {data.isPassing ? (
                            <CheckCircle className="w-4 h-4 text-emerald-500" />
                          ) : (
                            <XCircle className="w-4 h-4 text-red-500" />
                          )}
                          {!data.hasAdequateFreeboard && (
                            <span title="Insufficient freeboard">
                              <AlertTriangle className="w-4 h-4 text-amber-500" />
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          
          {/* Freeboard Note */}
          <div className="mt-3 pt-3 border-t border-border/50 space-y-2">
            <div className="flex items-start gap-2 text-xs text-muted-foreground">
              <Droplets className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-medium">Freeboard</span> is the distance from the water surface to the top of the pond. 
                Minimum recommended freeboard is <span className="font-mono font-medium text-foreground">1.0 ft</span>.
                {summaryData.some(d => !d.hasAdequateFreeboard) && (
                  <span className="text-amber-500 ml-1">⚠ Some storms have insufficient freeboard.</span>
                )}
              </div>
            </div>
            <div className="flex items-start gap-2 text-xs text-muted-foreground">
              <Waves className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-400" />
              <div className="flex-1">
                <span className="font-medium">Tailwater</span> is the downstream water elevation (HGL in outlet pipe). 
                <span className="ml-2">Below invert:</span>
                <span className="text-emerald-400 ml-1">Free</span>
                <span className="mx-1">•</span>
                <Waves className="w-3 h-3 text-amber-400 inline-block align-middle" />
                <span className="text-amber-400 ml-1">Partial</span>
                <span className="mx-1">•</span>
                <Waves className="w-3 h-3 text-red-400 inline-block align-middle" />
                <span className="text-red-400 ml-1">Full</span>
                {summaryData.some(d => d.submergenceLevel === 'full') && (
                  <span className="text-red-400 ml-2">⚠ Some fully submerged</span>
                )}
                {summaryData.some(d => d.submergenceLevel === 'partial') && !summaryData.some(d => d.submergenceLevel === 'full') && (
                  <span className="text-amber-400 ml-2">Some partially submerged</span>
                )}
              </div>
            </div>
            <div className="flex items-start gap-2 text-xs text-muted-foreground">
              <Info className="w-4 h-4 flex-shrink-0 mt-0.5 text-blue-400" />
              <div className="flex-1">
                <span className="font-medium text-blue-400">Note:</span> Tailwater elevations must be verified independently based on downstream conditions and actual outfall discharge. 
                Adjust tailwater and re-solve if actual Q differs significantly from design assumptions.
              </div>
            </div>
          </div>
        </section>

        {/* Solver Controls */}
        <section className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <h3 className="font-semibold flex items-center gap-2">
                <Play className="w-5 h-5 text-primary" />
                Outfall Solver
              </h3>
              {/* Status badges */}
              {enhancedSolverOutput && (
                enhancedSolverOutput.overallStatus === 'success' ? (
                  <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" />
                    All storms OK
                  </span>
                ) : enhancedSolverOutput.overallStatus === 'failed' ? (
                  <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    Issues detected
                  </span>
                ) : (
                  <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {enhancedSolverOutput.overallMessage || 'Warnings detected'}
                  </span>
                )
              )}
              {solverNeedsRerun && solvedResults.length > 0 && !enhancedSolverOutput && (
                <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  Inputs changed - re-solve recommended
                </span>
              )}
            </div>
            
            <div className="flex items-center gap-4">
              {/* Auto-Solve Toggle */}
              <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
                <span>Auto-Solve</span>
                <button
                  onClick={() => {
                    const newValue = !autoSolveEnabled;
                    setAutoSolveEnabledState(newValue);
                    setAutoSolveEnabled(newValue);
                  }}
                  className={`relative w-10 h-5 rounded-full transition-colors ${
                    autoSolveEnabled ? 'bg-primary' : 'bg-gray-600'
                  }`}
                  aria-label="Toggle auto-solve"
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                      autoSolveEnabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </label>
              
              {/* Solve Button */}
              <button
                onClick={() => onRunSolver()}
                disabled={isSolving || structures.length === 0 || results.length === 0}
                className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSolving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Solving...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    <span>Solve &amp; Size Orifices</span>
                  </>
                )}
              </button>
            </div>
          </div>
          
          {/* Enhanced Solver Results Table */}
          {enhancedSolverOutput && enhancedSolverOutput.results.length > 0 && (
            <div className="mt-4">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-muted-foreground text-xs uppercase">
                    <tr>
                      <th className="p-2 text-left">Storm</th>
                      <th className="p-2 text-right">Allowable Q</th>
                      <th className="p-2 text-center">Sized Orifice</th>
                      <th className="p-2 text-right">Original WSE</th>
                      <th className="p-2 text-right">Solved WSE</th>
                      <th className="p-2 text-right">Actual Q</th>
                      <th className="p-2 text-right">Freeboard</th>
                      <th className="p-2 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {enhancedSolverOutput.results.map((result) => {
                      const statusColor = result.status === 'ok' 
                        ? 'text-emerald-400' 
                        : result.status === 'warning' 
                          ? 'text-amber-400' 
                          : 'text-red-400';
                      const rowBg = result.status === 'ok' 
                        ? 'bg-emerald-500/5' 
                        : result.status === 'warning' 
                          ? 'bg-amber-500/5' 
                          : 'bg-red-500/5';
                      
                      return (
                        <tr key={result.stormEvent} className={rowBg}>
                          <td className="p-2 font-bold uppercase">{result.stormEvent}</td>
                          <td className="p-2 text-right font-mono">{result.allowableQCfs.toFixed(2)} cfs</td>
                          <td className="p-2 text-center font-mono text-xs">
                            {result.sizeDiameterFt != null ? (
                              <span className="bg-primary/20 text-primary px-1.5 py-0.5 rounded">
                                ⌀{result.sizeDiameterFt.toFixed(2)}&apos;
                              </span>
                            ) : result.sizeWidthFt != null && result.sizeHeightFt != null ? (
                              <span className="bg-primary/20 text-primary px-1.5 py-0.5 rounded">
                                {result.sizeWidthFt.toFixed(2)}&apos;×{result.sizeHeightFt.toFixed(2)}&apos;
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="p-2 text-right font-mono text-muted-foreground">{result.originalWSE.toFixed(2)} ft</td>
                          <td className="p-2 text-right font-mono font-bold">{result.solvedWSE.toFixed(2)} ft</td>
                          <td className={`p-2 text-right font-mono font-bold ${result.actualQCfs <= result.allowableQCfs ? 'text-emerald-400' : 'text-red-400'}`}>
                            {result.actualQCfs.toFixed(2)} cfs
                          </td>
                          <td className={`p-2 text-right font-mono ${result.freeboardFt < 0.5 ? 'text-amber-400' : 'text-muted-foreground'}`}>
                            {result.freeboardFt.toFixed(2)} ft
                          </td>
                          <td className={`p-2 text-center font-bold ${statusColor}`}>
                            {result.status === 'ok' && <CheckCircle className="w-4 h-4 inline" />}
                            {result.status === 'warning' && <AlertCircle className="w-4 h-4 inline" />}
                            {result.status === 'error' && <AlertTriangle className="w-4 h-4 inline" />}
                            <span className="ml-1 text-xs">{result.statusMessage || result.status.toUpperCase()}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              
              {/* Apply Sized Structures Button */}
              {enhancedSolverOutput.sizedStructures.length > 0 && (
                <div className="mt-4 flex items-center justify-between p-3 bg-primary/10 rounded-lg border border-primary/30">
                  <div className="text-sm">
                    <span className="font-semibold text-primary">Solver sized {enhancedSolverOutput.sizedStructures.length} structure(s)</span>
                    <span className="text-muted-foreground ml-2">
                      Click to apply the optimized dimensions to your structures
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      // Apply the sized structures
                      const newStructures = structures.map(struct => {
                        const sized = enhancedSolverOutput.sizedStructures.find(s => s.id === struct.id);
                        if (sized) {
                          return {
                            ...struct,
                            type: sized.type,
                            diameterFt: sized.diameterFt,
                            widthFt: sized.widthFt,
                            heightFt: sized.heightFt,
                          };
                        }
                        return struct;
                      });
                      setStructures(newStructures);
                    }}
                    className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors text-sm font-semibold"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Apply Sized Structures
                  </button>
                </div>
              )}
            </div>
          )}
          
          {/* Fallback: Legacy solver results if no enhanced output */}
          {!enhancedSolverOutput && solvedResults.length > 0 && (
            <div className="mt-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {solvedResults.map(sr => (
                <div 
                  key={sr.stormEvent}
                  className={`p-3 rounded-lg border ${
                    sr.converged 
                      ? sr.actualQCfs <= sr.allowableQCfs
                        ? 'bg-emerald-500/10 border-emerald-500/30'
                        : 'bg-red-500/10 border-red-500/30'
                      : 'bg-amber-500/10 border-amber-500/30'
                  }`}
                >
                  <div className="text-xs font-bold uppercase mb-1">{sr.stormEvent}</div>
                  <div className="flex items-baseline gap-1">
                    <span className={`text-lg font-mono font-bold ${
                      sr.actualQCfs <= sr.allowableQCfs ? 'text-emerald-400' : 'text-red-400'
                    }`}>
                      {sr.actualQCfs.toFixed(2)}
                    </span>
                    <span className="text-xs text-gray-500">cfs</span>
                  </div>
                  <div className="text-[10px] text-gray-500 mt-1">
                    Allowable: {sr.allowableQCfs.toFixed(2)} cfs
                  </div>
                  {!sr.converged && sr.warning && (
                    <div className="text-[10px] text-amber-400 mt-1 truncate" title={sr.warning}>
                      ⚠ {sr.iterations} iterations
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          
          {/* Help text */}
          <div className="mt-3 text-xs text-muted-foreground">
            The solver sizes orifices to maximize flow without exceeding allowable Q, then solves for equilibrium water surface elevation.
            {structures.length === 0 && <span className="text-amber-400 ml-2">Add structures to enable solving.</span>}
          </div>
        </section>

        {/* 2. Combined Structure Editor & Calculation Details */}
        <section className="bg-card border border-border rounded-lg shadow-sm overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border bg-muted/20">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <SettingsIcon className="w-5 h-5 text-primary" />
              Outfall Structures
            </h3>
            <button 
              onClick={addStructure}
              className="flex items-center gap-1 text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-3 h-3" /> Add Stage
            </button>
          </div>

          {/* Structure Table with Integrated Calculations */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 text-muted-foreground text-xs uppercase">
                <tr>
                  <th className="p-3 text-left">Stage</th>
                  <th className="p-3 text-left">Invert El. (ft)</th>
                  <th className="p-3 text-left">Offset (ft)</th>
                  <th className="p-3 text-left">Type</th>
                  <th className="p-3 text-left">Dimensions</th>
                  <th className="p-3 text-left">Coeff</th>
                  {/* Dynamic columns for each storm's Q */}
                  {summaryData.map(d => (
                    <th key={d.res.stormEvent} className="p-3 text-center">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        d.isPassing ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                      }`}>
                        Q<sub>{d.res.stormEvent}</sub>
                      </span>
                    </th>
                  ))}
                  <th className="p-3 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {structures.map((s) => {
                  // Get discharge for this structure for each storm
                  const structureDischarges = summaryData.map(d => {
                    const detail = d.details.find(det => det.id === s.id);
                    return {
                      stormEvent: d.res.stormEvent,
                      discharge: detail?.result.dischargeCfs ?? 0,
                      flowType: detail?.result.flowType ?? 'none'
                    };
                  });
                  
                  return (
                    <React.Fragment key={s.id}>
                      <tr 
                        className={`group hover:bg-muted/30 cursor-pointer transition-all ${
                          overlaps.some(o => o.structures.includes(s.id)) ? 'bg-red-500/5' : ''
                        } ${
                          expandedDerivations.has(s.id) 
                            ? 'bg-primary/10 outline outline-2 outline-primary outline-offset-[-2px]' 
                            : ''
                        }`}
                        onClick={() => toggleDerivation(s.id)}
                      >
                        <td className="p-3 text-left">
                          <div className="flex items-center gap-2">
                            {expandedDerivations.has(s.id) ? (
                              <ChevronUp className="w-4 h-4 text-primary" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-muted-foreground" />
                            )}
                            <span className="font-bold text-foreground">#{s.id}</span>
                          </div>
                        </td>
                        <td className="p-3 text-left" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            <div className="flex flex-col w-20">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  updateStructure(s.id, 'invertElevation', (s.invertElevation || 0) + 0.01);
                                }}
                                className="p-0.5 hover:bg-primary/20 rounded-t transition-colors flex justify-center"
                                title="Increase invert elevation"
                                aria-label="Increase invert elevation"
                              >
                                <ChevronUpIcon className="w-3 h-3 text-gray-400" />
                              </button>
                              <input 
                                type="text"
                                inputMode="decimal"
                                defaultValue={(s.invertElevation || 0).toFixed(2)}
                                key={`invert-${s.id}-${s.invertElevation}`}
                                onBlur={e => {
                                  const value = parseFloat(e.target.value);
                                  if (!isNaN(value)) {
                                    updateStructure(s.id, 'invertElevation', roundToPrecision(value));
                                  }
                                  e.target.value = (s.invertElevation || 0).toFixed(2);
                                }}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') {
                                    e.currentTarget.blur();
                                  }
                                }}
                                className="w-20 bg-background border-x border-input px-2 py-1 text-sm focus:ring-1 focus:ring-primary outline-none text-center"
                                title="Invert elevation (ft)"
                                aria-label="Invert elevation (ft)"
                              />
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  updateStructure(s.id, 'invertElevation', (s.invertElevation || 0) - 0.01);
                                }}
                                className="p-0.5 hover:bg-primary/20 rounded-b transition-colors flex justify-center"
                                title="Decrease invert elevation"
                                aria-label="Decrease invert elevation"
                              >
                                <ChevronDownIcon className="w-3 h-3 text-gray-400" />
                              </button>
                            </div>
                            <div className="flex flex-col gap-0.5">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  // Find the previous structure (by ID or index)
                                  const currentIndex = structures.findIndex(st => st.id === s.id);
                                  if (currentIndex > 0) {
                                    const prevStructure = structures[currentIndex - 1];
                                    // Get the top of the previous structure
                                    let prevTop = prevStructure.invertElevation;
                                    if (prevStructure.type === 'circular') {
                                      prevTop += (prevStructure.diameterFt || 0);
                                    } else {
                                      prevTop += (prevStructure.heightFt || 0);
                                    }
                                    // Set this structure's invert to prevTop + offset
                                    const offset = getOrificeStackingOffset();
                                    updateStructure(s.id, 'invertElevation', roundToPrecision(prevTop + offset));
                                  }
                                }}
                                disabled={structures.findIndex(st => st.id === s.id) === 0}
                                className="p-1 rounded hover:bg-primary/20 text-muted-foreground hover:text-primary transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                title={`Stack above previous orifice (+${getOrificeStackingOffset().toFixed(2)} ft offset)`}
                              >
                                <Layers className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  updateStructure(s.id, 'invertElevation', pondInvertElevation);
                                }}
                                className="p-1 rounded hover:bg-primary/20 text-muted-foreground hover:text-primary transition-colors"
                                title={`Set to pond bottom (${pondInvertElevation.toFixed(2)} ft)`}
                              >
                                <ArrowDownToLine className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </td>
                        <td className="p-3 text-left" onClick={e => e.stopPropagation()}>
                          <div className="flex flex-col w-16">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                updateStructure(s.id, 'horizontalOffsetFt', (s.horizontalOffsetFt || 0) + 0.01);
                              }}
                              className="p-0.5 hover:bg-primary/20 rounded-t transition-colors flex justify-center"
                              title="Increase horizontal offset"
                              aria-label="Increase horizontal offset"
                            >
                              <ChevronUpIcon className="w-3 h-3 text-gray-400" />
                            </button>
                            <input 
                              type="text"
                              inputMode="decimal"
                              defaultValue={(s.horizontalOffsetFt || 0).toFixed(2)}
                              key={`offset-${s.id}-${s.horizontalOffsetFt}`}
                              onBlur={e => {
                                const value = parseFloat(e.target.value);
                                if (!isNaN(value)) {
                                  updateStructure(s.id, 'horizontalOffsetFt', roundToPrecision(value));
                                }
                                e.target.value = (s.horizontalOffsetFt || 0).toFixed(2);
                              }}
                              onKeyDown={e => {
                                if (e.key === 'Enter') {
                                  e.currentTarget.blur();
                                }
                              }}
                              className="w-16 bg-background border-x border-input px-2 py-1 text-sm focus:ring-1 focus:ring-primary outline-none text-center"
                              title="Horizontal offset (ft)"
                              aria-label="Horizontal offset (ft)"
                            />
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                updateStructure(s.id, 'horizontalOffsetFt', (s.horizontalOffsetFt || 0) - 0.01);
                              }}
                              className="p-0.5 hover:bg-primary/20 rounded-b transition-colors flex justify-center"
                              title="Decrease horizontal offset"
                              aria-label="Decrease horizontal offset"
                            >
                              <ChevronDownIcon className="w-3 h-3 text-gray-400" />
                            </button>
                          </div>
                        </td>
                        <td className="p-3 text-left" onClick={e => e.stopPropagation()}>
                          <select 
                            value={s.type}
                            onChange={e => updateStructure(s.id, 'type', e.target.value as OutfallStructureType)}
                            className="bg-background border border-input rounded px-2 py-1 text-sm focus:ring-1 focus:ring-primary outline-none"
                            title="Structure type"
                            aria-label="Structure type"
                          >
                            <option value="circular">Circular</option>
                            <option value="rectangular">Rectangular</option>
                          </select>
                        </td>
                        <td className="p-3 text-left" onClick={e => e.stopPropagation()}>
                          <div className="flex gap-2 items-center">
                            {s.type === 'circular' ? (
                              <div className="flex items-center gap-1">
                                <span className="text-xs text-gray-400">⌀</span>
                                <div className="flex flex-col w-14">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      updateStructure(s.id, 'diameterFt', Math.max(0.01, (s.diameterFt || 0) + 0.01));
                                    }}
                                    className="p-0.5 hover:bg-primary/20 rounded-t transition-colors flex justify-center"
                                    title="Increase diameter"
                                    aria-label="Increase diameter"
                                  >
                                    <ChevronUpIcon className="w-3 h-3 text-gray-400" />
                                  </button>
                                  <input 
                                    type="text"
                                    inputMode="decimal"
                                    defaultValue={(s.diameterFt || 0).toFixed(2)}
                                    key={`dia-${s.id}-${s.diameterFt}`}
                                    onBlur={e => {
                                      const value = parseFloat(e.target.value);
                                      if (!isNaN(value) && value >= 0) {
                                        updateStructure(s.id, 'diameterFt', roundToPrecision(Math.max(0.01, value)));
                                      }
                                      e.target.value = (s.diameterFt || 0).toFixed(2);
                                    }}
                                    onKeyDown={e => {
                                      if (e.key === 'Enter') {
                                        e.currentTarget.blur();
                                      }
                                    }}
                                    className="w-14 bg-background border-x border-input px-2 py-1 text-sm focus:ring-1 focus:ring-primary outline-none text-center"
                                    title="Diameter (ft)"
                                    aria-label="Diameter (ft)"
                                  />
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      updateStructure(s.id, 'diameterFt', Math.max(0.01, (s.diameterFt || 0) - 0.01));
                                    }}
                                    className="p-0.5 hover:bg-primary/20 rounded-b transition-colors flex justify-center"
                                    title="Decrease diameter"
                                    aria-label="Decrease diameter"
                                  >
                                    <ChevronDownIcon className="w-3 h-3 text-gray-400" />
                                  </button>
                                </div>
                                <span className="text-xs text-gray-500">ft</span>
                              </div>
                            ) : (
                              <>
                                <div className="flex items-center gap-1">
                                  <span className="text-xs text-gray-400 font-medium" title="Width (horizontal)">W</span>
                                  <div className="flex flex-col w-12">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        updateStructure(s.id, 'widthFt', Math.max(0.01, (s.widthFt || 0) + 0.01));
                                      }}
                                      className="p-0.5 hover:bg-primary/20 rounded-t transition-colors flex justify-center"
                                      title="Increase width"
                                      aria-label="Increase width"
                                    >
                                      <ChevronUpIcon className="w-3 h-3 text-gray-400" />
                                    </button>
                                    <input 
                                      type="text"
                                      inputMode="decimal"
                                      defaultValue={(s.widthFt || 0).toFixed(2)}
                                      key={`width-${s.id}-${s.widthFt}`}
                                      onBlur={e => {
                                        const value = parseFloat(e.target.value);
                                        if (!isNaN(value) && value >= 0) {
                                          updateStructure(s.id, 'widthFt', roundToPrecision(Math.max(0.01, value)));
                                        }
                                        e.target.value = (s.widthFt || 0).toFixed(2);
                                      }}
                                      onKeyDown={e => {
                                        if (e.key === 'Enter') {
                                          e.currentTarget.blur();
                                        }
                                      }}
                                      className="w-12 bg-background border-x border-input px-2 py-1 text-sm focus:ring-1 focus:ring-primary outline-none text-center"
                                      title="Width (ft)"
                                      aria-label="Width (ft)"
                                    />
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        updateStructure(s.id, 'widthFt', Math.max(0.01, (s.widthFt || 0) - 0.01));
                                      }}
                                      className="p-0.5 hover:bg-primary/20 rounded-b transition-colors flex justify-center"
                                      title="Decrease width"
                                      aria-label="Decrease width"
                                    >
                                      <ChevronDownIcon className="w-3 h-3 text-gray-400" />
                                    </button>
                                  </div>
                                </div>
                                <span className="text-gray-500">×</span>
                                <div className="flex items-center gap-1">
                                  <span className="text-xs text-gray-400 font-medium" title="Height (vertical)">H</span>
                                  <div className="flex flex-col w-12">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        updateStructure(s.id, 'heightFt', Math.max(0.01, (s.heightFt || 0) + 0.01));
                                      }}
                                      className="p-0.5 hover:bg-primary/20 rounded-t transition-colors flex justify-center"
                                      title="Increase height"
                                      aria-label="Increase height"
                                    >
                                      <ChevronUpIcon className="w-3 h-3 text-gray-400" />
                                    </button>
                                    <input 
                                      type="text"
                                      inputMode="decimal"
                                      defaultValue={(s.heightFt || 0).toFixed(2)}
                                      key={`height-${s.id}-${s.heightFt}`}
                                      onBlur={e => {
                                        const value = parseFloat(e.target.value);
                                        if (!isNaN(value) && value >= 0) {
                                          updateStructure(s.id, 'heightFt', roundToPrecision(Math.max(0.01, value)));
                                        }
                                        e.target.value = (s.heightFt || 0).toFixed(2);
                                      }}
                                      onKeyDown={e => {
                                        if (e.key === 'Enter') {
                                          e.currentTarget.blur();
                                        }
                                      }}
                                      className="w-12 bg-background border-x border-input px-2 py-1 text-sm focus:ring-1 focus:ring-primary outline-none text-center"
                                      title="Height (ft)"
                                      aria-label="Height (ft)"
                                    />
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        updateStructure(s.id, 'heightFt', Math.max(0.01, (s.heightFt || 0) - 0.01));
                                      }}
                                      className="p-0.5 hover:bg-primary/20 rounded-b transition-colors flex justify-center"
                                      title="Decrease height"
                                      aria-label="Decrease height"
                                    >
                                      <ChevronDownIcon className="w-3 h-3 text-gray-400" />
                                    </button>
                                  </div>
                                </div>
                                <span className="text-xs text-gray-500">ft</span>
                              </>
                            )}
                          </div>
                        </td>
                        <td className="p-3 text-left" onClick={e => e.stopPropagation()}>
                          <div className="flex flex-col w-14">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                updateStructure(s.id, 'dischargeCoefficient', Math.max(0, (s.dischargeCoefficient || 0) + 0.01));
                              }}
                              className="p-0.5 hover:bg-primary/20 rounded-t transition-colors flex justify-center"
                              title="Increase discharge coefficient"
                              aria-label="Increase discharge coefficient"
                            >
                              <ChevronUpIcon className="w-3 h-3 text-gray-400" />
                            </button>
                            <input 
                              type="text"
                              inputMode="decimal"
                              defaultValue={(s.dischargeCoefficient || 0).toFixed(2)}
                              key={`coeff-${s.id}-${s.dischargeCoefficient}`}
                              onBlur={e => {
                                const value = parseFloat(e.target.value);
                                if (!isNaN(value) && value >= 0) {
                                  updateStructure(s.id, 'dischargeCoefficient', roundToPrecision(Math.max(0.01, value)));
                                }
                                e.target.value = (s.dischargeCoefficient || 0).toFixed(2);
                              }}
                              onKeyDown={e => {
                                if (e.key === 'Enter') {
                                  e.currentTarget.blur();
                                }
                              }}
                              className="w-14 bg-background border-x border-input px-2 py-1 text-sm focus:ring-1 focus:ring-primary outline-none text-center"
                              title="Discharge coefficient"
                              aria-label="Discharge coefficient"
                            />
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                updateStructure(s.id, 'dischargeCoefficient', Math.max(0, (s.dischargeCoefficient || 0) - 0.01));
                              }}
                              className="p-0.5 hover:bg-primary/20 rounded-b transition-colors flex justify-center"
                              title="Decrease discharge coefficient"
                              aria-label="Decrease discharge coefficient"
                            >
                              <ChevronDownIcon className="w-3 h-3 text-gray-400" />
                            </button>
                          </div>
                        </td>
                        {/* Discharge values for each storm */}
                        {structureDischarges.map(sd => (
                          <td key={sd.stormEvent} className="p-3 text-center">
                            {sd.discharge > 0 ? (
                              <div className="flex flex-col items-center">
                                <span className="font-mono font-medium text-foreground">{sd.discharge.toFixed(2)}</span>
                                <span className="text-[10px] text-gray-500 capitalize">{sd.flowType}</span>
                              </div>
                            ) : (
                              <span className="text-gray-500 text-xs">—</span>
                            )}
                          </td>
                        ))}
                        <td className="p-3 text-right" onClick={e => e.stopPropagation()}>
                          <button 
                            onClick={() => removeStructure(s.id)}
                            className="text-muted-foreground hover:text-destructive transition-colors p-1"
                            title="Remove structure"
                            aria-label="Remove structure"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                      
                      {/* Expandable calculation details row */}
                      {expandedDerivations.has(s.id) && detailView && (
                        <tr className="bg-muted/20">
                          <td colSpan={7 + summaryData.length} className="p-4">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              {summaryData.map(d => {
                                const detail = d.details.find(det => det.id === s.id);
                                if (!detail || detail.result.dischargeCfs === 0) return null;
                                
                                const solverKey = `${s.id}-${d.res.stormEvent}`;
                                const isSolving = solvingForStorm === solverKey;
                                
                                return (
                                  <div key={d.res.stormEvent} className="bg-background rounded-lg border border-border p-3">
                                    <div className="flex items-center justify-between mb-2">
                                      <div className="flex items-center gap-2">
                                        <span className={`text-xs font-bold px-2 py-0.5 rounded uppercase ${
                                          d.isPassing ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                                        }`}>
                                          {d.res.stormEvent}
                                        </span>
                                        <button
                                          onClick={(e) => handleSolveForStorm(s.id, d.res.stormEvent, e)}
                                          disabled={solvingForStorm !== null}
                                          className={`p-1 rounded transition-colors ${
                                            isSolving
                                              ? 'text-primary'
                                              : 'text-gray-400 hover:text-primary hover:bg-primary/10'
                                          } disabled:opacity-50 disabled:cursor-not-allowed`}
                                          title={`Solve structure size for ${d.res.stormEvent} storm`}
                                        >
                                          {isSolving ? (
                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                          ) : (
                                            <Sparkles className="w-3.5 h-3.5" />
                                          )}
                                        </button>
                                      </div>
                                      <span className="text-xs text-gray-400 capitalize">{detail.result.flowType}</span>
                                    </div>
                                    <div className="font-mono text-[10px] text-muted-foreground bg-muted/50 p-2 rounded mb-2">
                                      {detail.result.formula}
                                    </div>
                                    <div className="text-xs space-y-1">
                                      {Object.entries(detail.result.variables).slice(0, 4).map(([k, v]) => (
                                        <div key={k} className="flex justify-between">
                                          <span className="text-gray-400">{k}:</span>
                                          <span className="font-mono">{typeof v === 'number' ? v.toFixed(3) : v}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
                
                {/* Totals Row */}
                {structures.length > 0 && (
                  <tr className="bg-muted/30 font-medium">
                    <td colSpan={6} className="p-3 text-right text-muted-foreground uppercase text-xs">
                      Total Discharge →
                    </td>
                    {summaryData.map(d => (
                      <td key={d.res.stormEvent} className="p-3 text-center">
                        <span className={`font-mono font-bold ${d.isPassing ? 'text-emerald-500' : 'text-red-500'}`}>
                          {d.totalDischarge.toFixed(2)}
                        </span>
                        <span className="text-xs text-gray-500 ml-1">cfs</span>
                      </td>
                    ))}
                    <td></td>
                  </tr>
                )}
              </tbody>
            </table>
            
            {structures.length === 0 && (
              <div className="p-8 text-center text-muted-foreground text-sm">
                No structures defined. Add a stage to begin.
              </div>
            )}
          </div>
          
          {/* Expand/Collapse Details Toggle */}
          {structures.length > 0 && (
            <div className="p-3 border-t border-border bg-muted/10 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                Click a structure row to expand calculation details
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const allIds = new Set(structures.map(s => s.id));
                    setExpandedDerivations(allIds);
                  }}
                  className="text-xs text-primary hover:underline"
                >
                  Expand All
                </button>
                <span className="text-gray-500">|</span>
                <button
                  onClick={() => setExpandedDerivations(new Set())}
                  className="text-xs text-primary hover:underline"
                >
                  Collapse All
                </button>
              </div>
            </div>
          )}
        </section>

        {/* 3. Visualization Section - Rating Curve & Hydrograph Charts */}
        <section className="bg-card border border-border rounded-lg shadow-sm overflow-hidden">
          {/* Header with toggle */}
          <div className="flex items-center justify-between p-4 border-b border-border bg-muted/20">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary" />
              Solver Visualization
            </h3>
            <button
              onClick={() => setShowVisualization(!showVisualization)}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {showVisualization ? (
                <>
                  <ChevronUp className="w-4 h-4" />
                  <span>Hide Charts</span>
                </>
              ) : (
                <>
                  <ChevronDown className="w-4 h-4" />
                  <span>Show Charts</span>
                </>
              )}
            </button>
          </div>

          {showVisualization && (
            <div className="p-6 space-y-6">
              {structures.length === 0 || results.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <BarChart3 className="w-12 h-12 mx-auto mb-4 opacity-30" />
                  <p className="text-sm">
                    {structures.length === 0 
                      ? 'Add outfall structures to view the rating curve visualization.'
                      : 'No storm data available. Configure storm events in the Hydrology tab.'}
                  </p>
                </div>
              ) : (
                <>
                  {/* Rating Curve Chart */}
                  <div>
                    <RatingCurveChart
                      structures={structures}
                      pondInvertElevation={pondInvertElevation}
                      pondTopElevation={pondTopElevation}
                      stormData={ratingCurveStormData}
                      tailwaterElevations={tailwaterElevations}
                      selectedStorm={selectedVisualizationStorm}
                      onStormClick={(storm) => setSelectedVisualizationStorm(storm)}
                    />
                  </div>

                  {/* Hydrograph Chart */}
                  {hydrographData.length > 0 && (
                    <div>
                      <HydrographChart
                        hydrographs={hydrographData}
                        pondInvertElevation={pondInvertElevation}
                        pondTopElevation={pondTopElevation}
                        selectedStorm={selectedVisualizationStorm || hydrographData[0]?.stormEvent}
                        onStormChange={(storm) => setSelectedVisualizationStorm(storm)}
                      />
                    </div>
                  )}

                  {/* Chart Legend / Explanation */}
                  <div className="bg-muted/20 rounded-lg p-4">
                    <h4 className="text-sm font-semibold mb-3 text-foreground">Understanding the Charts</h4>
                    <div className="grid md:grid-cols-2 gap-4 text-xs text-muted-foreground">
                      <div>
                        <p className="font-medium text-foreground mb-1">Rating Curve (Q vs Head)</p>
                        <ul className="list-disc list-inside space-y-1">
                          <li><span className="text-blue-400">Blue solid line</span> = Total plate Q(H) rating curve</li>
                          <li>Dashed lines = Per-orifice Q curves (toggle in legend)</li>
                          <li>Vertical lines = Design head for each storm</li>
                          <li>Circles = Actual Q at design head (green = OK, red = exceeds)</li>
                          <li>Horizontal dashes = Allowable Q targets per storm</li>
                        </ul>
                        <p className="mt-2 italic">
                          A &quot;good&quot; solution has all circles at or below their allowable Q lines.
                        </p>
                      </div>
                      <div>
                        <p className="font-medium text-foreground mb-1">Hydrograph (WSE & Q vs Time)</p>
                        <ul className="list-disc list-inside space-y-1">
                          <li><span className="text-gray-400">Gray dashed</span> = Inflow hydrograph (Q<sub>in</sub>)</li>
                          <li><span className="text-blue-400">Colored solid</span> = Outflow through structures (Q<sub>out</sub>)</li>
                          <li><span className="text-emerald-400">Green solid</span> = Water surface elevation (WSE)</li>
                          <li><span className="text-red-400">Red dashed</span> = Allowable Q limit</li>
                          <li><span className="text-amber-400">Amber dashed</span> = Pond top (freeboard limit)</li>
                        </ul>
                        <p className="mt-2 italic">
                          Q<sub>out</sub> should stay below Q<sub>allow</sub>; WSE should stay below pond top.
                        </p>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </section>
      </div>

      {/* Right Sidebar - Profile Visualization (Resizable) */}
      <div 
        ref={sidebarRef}
        style={{ width: sidebarWidth }}
        className="bg-card border-l border-border z-10 hidden xl:flex relative"
      >
        {/* Resize Handle */}
        <div
          onMouseDown={startResize}
          className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-primary/20 transition-colors flex items-center justify-center group z-20"
          title="Drag to resize"
        >
          <GripVertical className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
        
        <div className="flex-1 pl-2">
          <OutfallProfileSVG 
            structures={structures} 
            pondInvert={pondInvertElevation} 
            wseList={wseVisList}
            overlaps={overlaps}
            outfallStyle={outfallStyle}
            plateSize={plateSize}
            onStyleChange={setOutfallStyle}
            onPlateSizeChange={setPlateSize}
          />
        </div>
      </div>

      {/* Solver Error/Warning Modal */}
      {solverError && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className={`bg-card border rounded-lg shadow-xl max-w-md w-full p-6 ${
            solverError.isWarning ? 'border-amber-500/50' : 'border-red-500/50'
          }`}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className={`w-5 h-5 ${solverError.isWarning ? 'text-amber-500' : 'text-red-500'}`} />
                <h3 className="text-lg font-semibold">
                  {solverError.isWarning ? 'Partial Solution Applied' : 'Solution Not Found'}
                </h3>
              </div>
              <button
                onClick={() => setSolverError(null)}
                className="p-1 hover:bg-background rounded transition-colors"
                title="Close"
                aria-label="Close"
              >
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>
            <div className="mb-4">
              <p className="text-sm text-gray-300 mb-3">
                <span className="font-medium">Storm:</span>{' '}
                <span className={`text-xs font-bold px-2 py-0.5 rounded uppercase ${
                  solverError.storm === '100yr' 
                    ? 'bg-red-500/20 text-red-400' 
                    : solverError.storm === '25yr' 
                    ? 'bg-yellow-500/20 text-yellow-400' 
                    : 'bg-green-500/20 text-green-400'
                }`}>
                  {solverError.storm}
                </span>
              </p>
              <p className="text-sm text-gray-400">{solverError.message}</p>
              
              {/* Show actual flow achieved for partial solutions */}
              {solverError.isWarning && solverError.actualFlow !== undefined && (
                <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-amber-400 font-medium">Achieved Flow:</span>
                    <span className="text-lg font-bold text-amber-300">{solverError.actualFlow.toFixed(2)} cfs</span>
                  </div>
                  <p className="text-xs text-amber-400/70 mt-1">
                    The orifice dimensions have been applied using the maximum achievable size.
                  </p>
                </div>
              )}
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setSolverError(null)}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  solverError.isWarning 
                    ? 'bg-amber-500 text-black hover:bg-amber-400'
                    : 'bg-primary text-primary-foreground hover:bg-primary/90'
                }`}
              >
                {solverError.isWarning ? 'Got it' : 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Simple Icons
function SettingsIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
  )
}
