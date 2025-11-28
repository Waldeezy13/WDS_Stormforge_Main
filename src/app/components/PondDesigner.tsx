'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import type { ModifiedRationalResult } from '@/utils/rationalMethod';
import { ReturnPeriod, InterpolationMethod, getRainfallData } from '@/utils/atlas14';
import { getIntensityInPerHr } from '@/utils/idf';
import { ModifiedRationalMethod } from '@/utils/rationalMethod';
import { Cuboid, Settings2, AlertTriangle, Droplets, TrendingUp, ChevronDown, Calculator, Upload, Plus, Trash2, Table } from 'lucide-react';
import { 
  StageStorageCurve, 
  StageStoragePoint, 
  validateStageStorageCurve, 
  parseStageStorageCSV,
  getElevationAtVolume,
  getStageStorageStats,
  createEmptyStageStorageCurve
} from '@/utils/stageStorage';
import type { PondMode } from '../page';
import { PondMesh } from './pond/PondVisualization3D';
import StageStorageChart from './charts/StageStorageChart';

// --- Required Storage by Storm Section ---
function RequiredVolumesSection({ 
  results, 
  getWaterDepth, 
  getColor,
  pondCapacity
}: { 
  results: ModifiedRationalResult[];
  getWaterDepth: (vol: number) => number;
  getColor: (event: ReturnPeriod) => string;
  pondCapacity: number;
}) {
  // Sort by required storage to find the controlling storm
  const sortedResults = [...results].sort((a, b) => b.requiredStorageCf - a.requiredStorageCf);
  const controllingStorm = sortedResults[0];
  
  if (results.length === 0) {
    return (
      <div className="bg-slate-800/50 border border-border rounded-lg p-6 text-center">
        <AlertTriangle className="w-8 h-8 text-yellow-500 mx-auto mb-2" />
        <p className="text-sm text-gray-400">No design results available. Configure drainage areas first.</p>
      </div>
    );
  }
  
  return (
    <div className="space-y-4">
      {/* Header with Controlling Storm Summary */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-gray-500 uppercase tracking-wider">
          <TrendingUp className="w-3 h-3" />
          Required Storage by Storm
        </div>
        {controllingStorm && (
          <div className="text-xs text-gray-400">
            <span className="text-gray-500">Controlling:</span>{' '}
            <span className="font-semibold text-white">{controllingStorm.stormEvent.toUpperCase()}</span>
          </div>
        )}
      </div>
      
      {/* Controlling Storm - Prominent Card */}
      {controllingStorm && (
        <div className={`relative overflow-hidden rounded-xl border-2 ${
          controllingStorm.requiredStorageCf > pondCapacity 
            ? 'border-red-500 bg-red-950/20' 
            : 'border-emerald-500 bg-emerald-950/20'
        }`}>
          {/* Background accent */}
          <div 
            className="absolute inset-0 opacity-10" 
            style={{ backgroundColor: getColor(controllingStorm.stormEvent) }}
          />
          
          <div className="relative p-5">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div 
                  className="w-3 h-3 rounded-full" 
                  style={{ backgroundColor: getColor(controllingStorm.stormEvent) }}
                />
                <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Design Volume (Controlling Storm)
                </span>
              </div>
              <span className={`text-xs font-bold px-2 py-1 rounded ${
                controllingStorm.requiredStorageCf > pondCapacity 
                  ? 'bg-red-500/20 text-red-400' 
                  : 'bg-emerald-500/20 text-emerald-400'
              }`}>
                {controllingStorm.requiredStorageCf > pondCapacity ? 'UNDERSIZED' : 'OK'}
              </span>
            </div>

            {/* Main Volume Display */}
            <div className="mb-4">
              <div className="text-4xl font-bold text-white tracking-tight">
                {Math.round(controllingStorm.requiredStorageCf).toLocaleString()}
                <span className="text-lg font-normal text-gray-400 ml-2">cf</span>
              </div>
              <div className="text-sm text-gray-400 mt-1">
                Storm: <span className="font-semibold text-white">{controllingStorm.stormEvent.toUpperCase()}</span>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-4 gap-3 pt-4 border-t border-white/10">
              <div>
                <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Water Depth</div>
                <div className="text-lg font-semibold text-primary">{getWaterDepth(controllingStorm.requiredStorageCf).toFixed(2)} ft</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Duration</div>
                <div className="text-lg font-semibold text-gray-300">{controllingStorm.criticalDurationMinutes} min</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Utilization</div>
                <div className={`text-lg font-semibold ${
                  pondCapacity > 0 && (controllingStorm.requiredStorageCf / pondCapacity) * 100 > 100 
                    ? 'text-red-400' 
                    : 'text-emerald-400'
                }`}>
                  {pondCapacity > 0 ? ((controllingStorm.requiredStorageCf / pondCapacity) * 100).toFixed(0) : 0}%
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Peak Inflow</div>
                <div className="text-lg font-semibold text-gray-300">{controllingStorm.peakInflowCfs.toFixed(1)} cfs</div>
              </div>
            </div>
            
            {/* Additional Metrics Row */}
            <div className="grid grid-cols-2 gap-3 pt-3 mt-3 border-t border-white/5">
              <div>
                <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Allowable Release</div>
                <div className="text-sm font-semibold text-gray-300">{controllingStorm.allowableReleaseRateCfs.toFixed(2)} cfs</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Pond Capacity</div>
                <div className={`text-sm font-semibold ${
                  controllingStorm.requiredStorageCf > pondCapacity ? 'text-red-400' : 'text-gray-300'
                }`}>
                  {Math.round(pondCapacity).toLocaleString()} cf
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* All Storms List */}
      <div className="space-y-2">
        <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">
          All Storm Events
        </div>
        {sortedResults.map((result, idx) => {
          const isControlling = idx === 0;
          const waterDepth = getWaterDepth(result.requiredStorageCf);
          const isOverCapacity = result.requiredStorageCf > pondCapacity;
          const utilizationPercent = pondCapacity > 0 ? (result.requiredStorageCf / pondCapacity) * 100 : 0;
          
          return (
            <div 
              key={result.stormEvent}
              className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                isControlling 
                  ? 'bg-slate-800/80 border-slate-600' 
                  : 'bg-slate-900/40 border-border hover:bg-slate-800/40'
              }`}
            >
              {/* Color indicator */}
              <div 
                className="w-2 h-8 rounded-full flex-shrink-0" 
                style={{ backgroundColor: getColor(result.stormEvent) }}
              />
              
              {/* Storm label */}
              <div className="w-16 flex-shrink-0">
                <span className={`text-sm font-semibold ${isControlling ? 'text-white' : 'text-gray-400'}`}>
                  {result.stormEvent.toUpperCase()}
                </span>
                {isControlling && (
                  <div className="text-[10px] text-emerald-400 font-medium">CONTROLS</div>
                )}
              </div>
              
              {/* Volume */}
              <div className="flex-1">
                <div className={`text-sm font-mono ${isOverCapacity ? 'text-red-400' : 'text-gray-200'}`}>
                  {Math.round(result.requiredStorageCf).toLocaleString()} cf
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {result.criticalDurationMinutes} min • {result.peakInflowCfs.toFixed(1)} cfs
                </div>
              </div>
              
              {/* Metrics */}
              <div className="text-right space-y-1">
                <div className={`text-sm font-mono ${isOverCapacity ? 'text-red-400' : 'text-primary'}`}>
                  {waterDepth.toFixed(2)} ft
                </div>
                <div className={`text-xs font-mono ${
                  utilizationPercent > 100 ? 'text-red-400' : 'text-emerald-400'
                }`}>
                  {utilizationPercent.toFixed(0)}% util
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- Main Types ---
type DrainageTotalsSummary = {
  existing: {
    totalArea: number;
    weightedC: number;
    tcMinutes: number;
    flowTotals: Record<ReturnPeriod, number>;
  };
  proposed: {
    totalArea: number;
    weightedC: number;
    tcMinutes: number;
    flowTotals: Record<ReturnPeriod, number>;
  };
} | null;

interface PondDims {
  length: number;
  width: number;
  depth: number;
}

type CalculationMethod = 'modified-rational';

interface PondDesignerProps {
  cityId: number;
  selectedEvents: ReturnPeriod[];
  results: ModifiedRationalResult[];
  drainageTotals: DrainageTotalsSummary;
  pondDims: PondDims;
  onPondDimsChange: (dims: PondDims) => void;
  interpolationMethod: InterpolationMethod;
  setInterpolationMethod: (method: InterpolationMethod) => void;
  pondMode: PondMode;
  onPondModeChange: (mode: PondMode) => void;
  stageStorageCurve: StageStorageCurve | null;
  onStageStorageCurveChange: (curve: StageStorageCurve | null) => void;
  pondInvertElevation: number;
  onPondInvertElevationChange: (elevation: number) => void;
}

// --- Calculation Method Selector Component ---
function MethodSelector({ 
  method, 
  onMethodChange 
}: { 
  method: CalculationMethod; 
  onMethodChange: (method: CalculationMethod) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  
  const methods: { value: CalculationMethod; label: string; description: string }[] = [
    {
      value: 'modified-rational',
      label: 'Modified Rational Method',
      description: 'Iterative method that calculates storage at multiple durations'
    }
  ];

  const selectedMethod = methods.find(m => m.value === method) || methods[0];

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 bg-slate-800/50 border border-border rounded-lg hover:bg-slate-800 transition-colors w-full sm:w-auto"
      >
        <Calculator className="w-4 h-4 text-primary" />
        <span className="text-sm font-medium text-white">{selectedMethod.label}</span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      
      {isOpen && (
        <>
          <div 
            className="fixed inset-0 z-10" 
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute top-full mt-2 left-0 z-20 bg-slate-800 border border-border rounded-lg shadow-xl min-w-[280px] overflow-hidden">
            {methods.map((m) => (
              <button
                key={m.value}
                onClick={() => {
                  onMethodChange(m.value);
                  setIsOpen(false);
                }}
                className={`w-full text-left px-4 py-3 hover:bg-slate-700 transition-colors ${
                  method === m.value ? 'bg-primary/10 border-l-2 border-primary' : ''
                }`}
              >
                <div className="font-medium text-white text-sm">{m.label}</div>
                <div className="text-xs text-gray-400 mt-1">{m.description}</div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// --- Duration Calculations Grid Component ---
function DurationCalculationsGrid({ 
  result,
  results,
  getColor,
  onStormChange,
  iterationFrequency,
  onIterationFrequencyChange,
  cityId,
  interpolationMethod,
  drainageTotals
}: { 
  result: ModifiedRationalResult | null;
  results: ModifiedRationalResult[];
  getColor: (event: ReturnPeriod) => string;
  onStormChange: (storm: ReturnPeriod) => void;
  iterationFrequency: number;
  onIterationFrequencyChange: (frequency: number) => void;
  cityId: number;
  interpolationMethod: InterpolationMethod;
  drainageTotals: DrainageTotalsSummary | null;
}) {
  const [selectedStorm, setSelectedStorm] = useState<ReturnPeriod | null>(
    result?.stormEvent || null
  );
  const [rainfallData, setRainfallData] = useState<Array<{ durationMinutes: number; intensities: Record<ReturnPeriod, number> }>>([]);

  const displayResult = results.find(r => r.stormEvent === selectedStorm) || result;

  // Fetch rainfall data for IDF interpolation
  useEffect(() => {
    if (cityId > 0) {
      async function loadRainfallData() {
        const data = await getRainfallData(cityId);
        setRainfallData(data);
      }
      loadRainfallData();
    }
  }, [cityId]);
  
  // Generate calculations at selected frequency intervals, stopping when storage hits 0
  const filteredCalculations = useMemo(() => {
    if (!displayResult?.durationCalculations) return [];
    const allCalcs = displayResult.durationCalculations;
    
    // Validate we have valid calculations
    if (allCalcs.length === 0) return [];
    
    // Create a map of all calculations by duration (using unique durations)
    const calcMap = new Map<number, typeof allCalcs[0]>();
    allCalcs.forEach(calc => {
      // Only add if not already present (handles any duplicate durations)
      if (!calcMap.has(calc.durationMinutes)) {
        calcMap.set(calc.durationMinutes, calc);
      }
    });
    
    // NOTE: Standard Modified Rational Method starts at Tc (minimum duration where 
    // runoff is "concentrated"). Durations below Tc are shown for IDF curve visualization
    // but storage values for d < Tc are extrapolated and may not be physically meaningful.
    // The minimum calculated duration is Tc: Math.min(...allCalcs.map(c => c.durationMinutes))
    const startDuration = 0; // Show from 0 for visualization (extrapolated below Tc)
    
    // Generate calculations at the selected frequency intervals
    const generatedCalcs: typeof allCalcs = [];
    let foundCritical = false;
    let hasHadStorage = false; // Track if we've seen any positive storage
    
    // Generate at frequency intervals starting from startDuration
    for (let duration = startDuration; duration <= 1440; duration += iterationFrequency) {
      // Check for exact match first
      const exactCalc = calcMap.get(duration);
      
      if (exactCalc) {
        // If we've had storage before and now hit 0, stop after this row
        if (hasHadStorage && exactCalc.storageCf === 0) {
          generatedCalcs.push(exactCalc);
          break;
        }
        
        generatedCalcs.push(exactCalc);
        if (exactCalc.isCritical) foundCritical = true;
        if (exactCalc.storageCf > 0) {
          hasHadStorage = true;
        }
      } else {
        // Find nearest calculations for interpolation
        const lower = allCalcs.filter(c => c.durationMinutes <= duration).sort((a, b) => b.durationMinutes - a.durationMinutes)[0];
        const upper = allCalcs.filter(c => c.durationMinutes >= duration).sort((a, b) => a.durationMinutes - b.durationMinutes)[0];
        
        let interpolatedCalc: typeof allCalcs[0] | null = null;
        
        // Use IDF interpolation to get accurate intensity for any duration
        // getIntensityInPerHr will use exact Atlas 14 values when available, 
        // and interpolate only for durations not in the table
        if (rainfallData.length > 0 && displayResult && drainageTotals) {
          const returnPeriod = displayResult.stormEvent;
          const intensity = getIntensityInPerHr(rainfallData, returnPeriod, duration, interpolationMethod);
          
          // Calculate peak inflow using Modified Rational: Q = C * I * A
          const postDevArea = drainageTotals.proposed.totalArea;
          const postDevC = drainageTotals.proposed.weightedC;
          const peakInflow = ModifiedRationalMethod.calculatePeakFlow(
            { areaAcres: postDevArea, cFactor: postDevC, tcMinutes: duration },
            intensity
          );
          
          // Calculate storage: V = (Qp - Qallow) * duration (in seconds)
          const allowableQ = displayResult.allowableReleaseRateCfs;
          let storage = 0;
          if (peakInflow > allowableQ) {
            const durationSeconds = duration * 60;
            storage = (peakInflow - allowableQ) * durationSeconds;
          }
          
          interpolatedCalc = {
            durationMinutes: duration,
            intensityInHr: intensity,
            peakInflowCfs: peakInflow,
            storageCf: Math.max(0, storage),
            isCritical: false
          };
        } else {
          // Fallback interpolation/extrapolation when rainfall data is not yet loaded
          // Get unique duration points for interpolation
          const uniqueDurations = [...new Set(allCalcs.map(c => c.durationMinutes))].sort((a, b) => a - b);
          const uniqueCalcs = uniqueDurations.map(d => allCalcs.find(c => c.durationMinutes === d)!);
          
          if (lower && upper && lower.durationMinutes !== upper.durationMinutes) {
            // Interpolate between two known points using log-log
            const logDuration = Math.log(Math.max(0.1, duration));
            const logLower = Math.log(lower.durationMinutes);
            const logUpper = Math.log(upper.durationMinutes);
            
            // Safeguard against invalid intensity values
            if (lower.intensityInHr > 0 && upper.intensityInHr > 0) {
              const logIntensityLower = Math.log(lower.intensityInHr);
              const logIntensityUpper = Math.log(upper.intensityInHr);
              
              const t = (logDuration - logLower) / (logUpper - logLower);
              const logIntensity = logIntensityLower + t * (logIntensityUpper - logIntensityLower);
              const intensity = Math.exp(logIntensity);
              
              // Recalculate peak inflow with interpolated intensity
              const peakInflow = (intensity / lower.intensityInHr) * lower.peakInflowCfs;
              
              interpolatedCalc = {
                durationMinutes: duration,
                intensityInHr: intensity,
                peakInflowCfs: peakInflow,
                storageCf: Math.max(0, lower.storageCf + t * (upper.storageCf - lower.storageCf)),
                isCritical: false
              };
            } else {
              // Linear fallback if intensities are invalid
              const t = (duration - lower.durationMinutes) / (upper.durationMinutes - lower.durationMinutes);
              interpolatedCalc = {
                durationMinutes: duration,
                intensityInHr: lower.intensityInHr + t * (upper.intensityInHr - lower.intensityInHr),
                peakInflowCfs: lower.peakInflowCfs + t * (upper.peakInflowCfs - lower.peakInflowCfs),
                storageCf: Math.max(0, lower.storageCf + t * (upper.storageCf - lower.storageCf)),
                isCritical: false
              };
            }
          } else if (duration < uniqueDurations[0] && uniqueCalcs.length >= 2) {
            // Extrapolate below minimum using first two UNIQUE points (log-log)
            // NOTE: For durations below Tc, this is extrapolation for display only.
            // Standard Modified Rational starts at Tc, but we show these for completeness.
            const first = uniqueCalcs[0];
            const second = uniqueCalcs[1];
            
            // Ensure we have two different durations to extrapolate from
            if (first.durationMinutes !== second.durationMinutes && 
                first.intensityInHr > 0 && second.intensityInHr > 0) {
              const safeDuration = Math.max(0.1, duration);
              const logDuration = Math.log(safeDuration);
              const logFirst = Math.log(first.durationMinutes);
              const logSecond = Math.log(second.durationMinutes);
              const logIntensityFirst = Math.log(first.intensityInHr);
              const logIntensitySecond = Math.log(second.intensityInHr);
              
              // t will be negative since we're extrapolating below first point
              const t = (logDuration - logFirst) / (logSecond - logFirst);
              const logIntensity = logIntensityFirst + t * (logIntensitySecond - logIntensityFirst);
              const intensity = Math.exp(logIntensity);
              
              // Recalculate peak inflow with extrapolated intensity
              const peakInflow = (intensity / first.intensityInHr) * first.peakInflowCfs;
              
              // Storage = (Q - Qallow) * duration in seconds
              const allowableQ = displayResult?.allowableReleaseRateCfs || 0;
              let storage = 0;
              if (peakInflow > allowableQ && duration > 0) {
                storage = (peakInflow - allowableQ) * (duration * 60);
              }
              
              interpolatedCalc = {
                durationMinutes: duration,
                intensityInHr: intensity,
                peakInflowCfs: peakInflow,
                storageCf: Math.max(0, storage),
                isCritical: false
              };
            } else {
              // Can't extrapolate properly, use first point's intensity scaled
              interpolatedCalc = {
                ...first,
                durationMinutes: duration,
                storageCf: 0 // Below Tc, storage calculation doesn't apply the same way
              };
            }
          } else if (duration > uniqueDurations[uniqueDurations.length - 1] && uniqueCalcs.length >= 2) {
            // Extrapolate beyond maximum using last two unique points
            const last = uniqueCalcs[uniqueCalcs.length - 1];
            const secondLast = uniqueCalcs[uniqueCalcs.length - 2];
            
            if (last.durationMinutes !== secondLast.durationMinutes &&
                last.intensityInHr > 0 && secondLast.intensityInHr > 0) {
              const logDuration = Math.log(duration);
              const logLast = Math.log(last.durationMinutes);
              const logSecondLast = Math.log(secondLast.durationMinutes);
              const logIntensityLast = Math.log(last.intensityInHr);
              const logIntensitySecondLast = Math.log(secondLast.intensityInHr);
              
              const t = (logDuration - logSecondLast) / (logLast - logSecondLast);
              const logIntensity = logIntensitySecondLast + t * (logIntensityLast - logIntensitySecondLast);
              const intensity = Math.exp(logIntensity);
              
              const peakInflow = (intensity / last.intensityInHr) * last.peakInflowCfs;
              
              interpolatedCalc = {
                durationMinutes: duration,
                intensityInHr: intensity,
                peakInflowCfs: peakInflow,
                storageCf: Math.max(0, last.storageCf), // Storage typically decreases beyond critical
                isCritical: false
              };
            } else {
              interpolatedCalc = {
                ...last,
                durationMinutes: duration
              };
            }
          } else if (lower) {
            // Fallback: only lower bound available
            interpolatedCalc = {
              ...lower,
              durationMinutes: duration,
              storageCf: Math.max(0, lower.storageCf)
            };
          } else if (upper) {
            // Fallback: only upper bound available, can't extrapolate
            // This happens when we have only 1 data point - use it but note limitation
            interpolatedCalc = {
              ...upper,
              durationMinutes: duration,
              // For duration < Tc, storage is 0 per Modified Rational method
              storageCf: duration < upper.durationMinutes ? 0 : upper.storageCf
            };
          }
        }
        
        if (interpolatedCalc) {
          // Validate the interpolated calculation - skip if NaN
          if (isNaN(interpolatedCalc.intensityInHr) || 
              isNaN(interpolatedCalc.peakInflowCfs) || 
              isNaN(interpolatedCalc.storageCf)) {
            // Skip invalid calculations - this can happen during initial load
            continue;
          }
          
          // If we've had storage before and now hit 0, stop after this row
          if (hasHadStorage && interpolatedCalc.storageCf === 0) {
            generatedCalcs.push(interpolatedCalc);
            break;
          }
          
          generatedCalcs.push(interpolatedCalc);
          if (interpolatedCalc.storageCf > 0) {
            hasHadStorage = true;
          }
        }
      }
    }
    
    // Always include the critical calculation if not already included
    if (!foundCritical) {
      const criticalCalc = allCalcs.find(c => c.isCritical);
      if (criticalCalc) {
        const insertIndex = generatedCalcs.findIndex(c => c.durationMinutes > criticalCalc.durationMinutes);
        if (insertIndex >= 0) {
          generatedCalcs.splice(insertIndex, 0, criticalCalc);
        } else if (!generatedCalcs.some(c => c.durationMinutes === criticalCalc.durationMinutes)) {
          generatedCalcs.push(criticalCalc);
        }
      }
    }
    
    // Sort by duration
    return generatedCalcs.sort((a, b) => a.durationMinutes - b.durationMinutes);
  }, [displayResult, iterationFrequency, rainfallData, interpolationMethod, drainageTotals]);

  if (!displayResult || !displayResult.durationCalculations || displayResult.durationCalculations.length === 0) {
    return (
      <div className="bg-slate-800/50 border border-border rounded-lg p-6 text-center">
        <p className="text-sm text-gray-400">No calculation data available.</p>
      </div>
    );
  }

  const isControlling = displayResult.stormEvent === result?.stormEvent;
  
  // Get the minimum Tc from the original calculations (first calculated duration)
  const minTc = Math.min(...displayResult.durationCalculations.map(c => c.durationMinutes));

  return (
    <div className="bg-background border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-3 bg-slate-900/60 border-b border-border">
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <h4 className="text-sm font-semibold text-white flex items-center gap-2">
            <Calculator className="w-4 h-4 text-primary" />
            Duration Iterations
          </h4>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-400">Frequency:</label>
              <select
                value={iterationFrequency}
                onChange={(e) => onIterationFrequencyChange(Number(e.target.value))}
                className="bg-slate-800 border border-border rounded px-2 py-1 text-xs text-white focus:ring-1 focus:ring-primary outline-none"
                title="Iteration frequency"
                aria-label="Iteration frequency"
              >
                <option value={1}>1 min</option>
                <option value={5}>5 min</option>
                <option value={10}>10 min</option>
                <option value={15}>15 min</option>
                <option value={30}>30 min</option>
              </select>
            </div>
            {results.length > 1 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">Storm:</span>
                <select
                  value={selectedStorm || ''}
                  onChange={(e) => {
                    const storm = e.target.value as ReturnPeriod;
                    setSelectedStorm(storm);
                    onStormChange(storm);
                  }}
                  className="bg-slate-800 border border-border rounded px-2 py-1 text-xs text-white focus:ring-1 focus:ring-primary outline-none"
                  title="Storm event"
                  aria-label="Storm event"
                >
                  {results.map(r => (
                    <option key={r.stormEvent} value={r.stormEvent}>
                      {r.stormEvent.toUpperCase()}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div 
            className="w-3 h-3 rounded-full" 
            style={{ backgroundColor: getColor(displayResult.stormEvent) }}
          />
          <p className="text-xs text-gray-400">
            Storage calculated at each duration. Critical duration (maximum storage) is highlighted.
            {isControlling && (
              <span className="ml-2 text-primary font-semibold">• CONTROLLING STORM</span>
            )}
            <span className="ml-2 text-yellow-400/70">• &lt; Tc = Below Time of Concentration (extrapolated)</span>
          </p>
        </div>
        <div className="mt-2 pt-2 border-t border-border/50">
          <div className="flex items-center gap-4 text-xs flex-wrap">
            <div>
              <span className="text-gray-500">Allowable Release Rate:</span>
              <span className="ml-2 font-mono text-white">{displayResult.allowableReleaseRateCfs.toFixed(2)} cfs</span>
            </div>
            <div>
              <span className="text-gray-500">Max Storage:</span>
              <span className="ml-2 font-mono text-primary font-semibold">
                {Math.round(displayResult.requiredStorageCf).toLocaleString()} cf
              </span>
            </div>
            <div>
              <span className="text-gray-500">Min Tc:</span>
              <span className="ml-2 font-mono text-yellow-400">{minTc} min</span>
            </div>
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-900/40 text-xs uppercase text-gray-400 font-medium">
            <tr>
              <th className="px-4 py-3 text-left">Duration (min)</th>
              <th className="px-4 py-3 text-right">Intensity (in/hr)</th>
              <th className="px-4 py-3 text-right">Peak Inflow (cfs)</th>
              <th className="px-4 py-3 text-right">ΔQ (cfs)</th>
              <th className="px-4 py-3 text-right">Storage (cf)</th>
              <th className="px-4 py-3 text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filteredCalculations.map((calc, idx) => {
              const isCritical = calc.isCritical;
              const isBelowTc = calc.durationMinutes < minTc;
              const deltaQ = calc.peakInflowCfs - displayResult.allowableReleaseRateCfs;
              const hasValidValues = !isNaN(calc.intensityInHr) && !isNaN(calc.peakInflowCfs) && !isNaN(calc.storageCf);
              
              return (
                <tr
                  key={idx}
                  className={`transition-colors ${
                    isCritical
                      ? 'bg-primary/10 border-l-2 border-primary'
                      : isBelowTc
                        ? 'bg-yellow-500/5 opacity-70'
                        : 'hover:bg-white/5'
                  }`}
                >
                  <td className="px-4 py-2">
                    <div className={`font-mono ${isBelowTc ? 'text-yellow-400/70' : 'text-white'}`}>
                      {calc.durationMinutes}
                    </div>
                    {calc.durationMinutes >= 60 && (
                      <div className="text-xs text-gray-500">
                        {Math.round(calc.durationMinutes / 60 * 10) / 10} hr
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className={`font-mono ${isBelowTc ? 'text-gray-500' : 'text-gray-300'}`}>
                      {hasValidValues ? calc.intensityInHr.toFixed(3) : '-'}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className={`font-mono ${isBelowTc ? 'text-gray-500' : 'text-gray-300'}`}>
                      {hasValidValues ? calc.peakInflowCfs.toFixed(2) : '-'}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className={`font-mono ${isBelowTc ? 'text-gray-500' : deltaQ > 0 ? 'text-red-400' : 'text-gray-500'}`}>
                      {hasValidValues ? (deltaQ > 0 ? `+${deltaQ.toFixed(2)}` : deltaQ.toFixed(2)) : '-'}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className={`font-mono font-semibold ${isBelowTc ? 'text-gray-500' : isCritical ? 'text-primary' : 'text-gray-200'}`}>
                      {hasValidValues && calc.storageCf > 0 ? Math.round(calc.storageCf).toLocaleString() : '-'}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {isCritical && (
                      <span className="inline-flex items-center px-2 py-1 rounded text-xs font-semibold bg-primary/20 text-primary">
                        CRITICAL
                      </span>
                    )}
                    {isBelowTc && !isCritical && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-yellow-500/20 text-yellow-400" title="Duration is below Time of Concentration - values are extrapolated">
                        &lt; Tc
                      </span>
                    )}
                    {!isBelowTc && calc.storageCf === 0 && !isCritical && (
                      <span className="text-xs text-gray-500">No storage</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// --- Main Pond Designer Component ---
export default function PondDesigner({ 
  cityId, 
  selectedEvents, 
  results, 
  drainageTotals, 
  pondDims, 
  onPondDimsChange, 
  interpolationMethod, 
  setInterpolationMethod,
  pondMode,
  onPondModeChange,
  stageStorageCurve,
  onStageStorageCurveChange,
  pondInvertElevation,
  onPondInvertElevationChange: _onPondInvertElevationChange
}: PondDesignerProps) {
  const [calculationMethod, setCalculationMethod] = useState<CalculationMethod>('modified-rational');
  const [iterationFrequency, setIterationFrequency] = useState<number>(1);
  const [csvPasteText, setCsvPasteText] = useState('');
  const [tableErrors, setTableErrors] = useState<string[]>([]);
  const [allowableFlows, setAllowableFlows] = useState<Record<ReturnPeriod, number>>({
    '2yr': 0,
    '5yr': 0,
    '10yr': 0,
    '25yr': 0,
    '50yr': 0,
    '100yr': 0,
  });

  // Calculate pond capacity - use stage-storage curve in custom mode
  const pondCapacity = useMemo(() => {
    if (pondMode === 'custom' && stageStorageCurve && stageStorageCurve.points.length > 0) {
      const stats = getStageStorageStats(stageStorageCurve);
      return stats.maxVolume;
    }
    return pondDims.length * pondDims.width * pondDims.depth;
  }, [pondDims, pondMode, stageStorageCurve]);

  // Find the controlling (design) storm result
  const designResult = useMemo(() => {
    if (results.length === 0) return null;
    return results.reduce((max, r) => r.requiredStorageCf > max.requiredStorageCf ? r : max, results[0]);
  }, [results]);

  // Initialize/update allowable flows when drainage totals change
  useEffect(() => {
    if (!drainageTotals) return;
    setAllowableFlows((prev) => {
      const next: Record<ReturnPeriod, number> = { ...prev };
      (Object.keys(drainageTotals.existing.flowTotals) as ReturnPeriod[]).forEach((event) => {
        const existingFlow = drainageTotals.existing.flowTotals[event] ?? 0;
        next[event] = prev[event] === 0 ? existingFlow : prev[event];
      });
      return next;
    });
  }, [drainageTotals]);

  const resetAllowableToExisting = () => {
    if (!drainageTotals) return;
    setAllowableFlows(() => {
      const next: Record<ReturnPeriod, number> = {
        '2yr': 0,
        '5yr': 0,
        '10yr': 0,
        '25yr': 0,
        '50yr': 0,
        '100yr': 0,
      };
      (Object.keys(drainageTotals.existing.flowTotals) as ReturnPeriod[]).forEach((event) => {
        next[event] = drainageTotals.existing.flowTotals[event] ?? 0;
      });
      return next;
    });
  };

  // Helper to convert Volume (cf) to Water Depth (ft) in the pond
  const getWaterDepth = (volumeCf: number) => {
    if (pondMode === 'custom' && stageStorageCurve && stageStorageCurve.points.length >= 2) {
      const elevation = getElevationAtVolume(stageStorageCurve, volumeCf);
      const baseElevation = stageStorageCurve.points[0]?.elevation ?? pondInvertElevation;
      return elevation - baseElevation;
    }
    const area = pondDims.length * pondDims.width;
    return area > 0 ? volumeCf / area : 0;
  };

  // Helper to get water surface elevation from volume
  const getWaterElevation = (volumeCf: number) => {
    if (pondMode === 'custom' && stageStorageCurve && stageStorageCurve.points.length >= 2) {
      return getElevationAtVolume(stageStorageCurve, volumeCf);
    }
    const area = pondDims.length * pondDims.width;
    const depth = area > 0 ? volumeCf / area : 0;
    return pondInvertElevation + depth;
  };

  // Handle CSV paste for stage-storage table
  const handleCsvPaste = () => {
    if (!csvPasteText.trim()) return;
    
    const { points, errors } = parseStageStorageCSV(csvPasteText);
    
    if (errors.length > 0) {
      setTableErrors(errors);
      return;
    }
    
    if (points.length < 2) {
      setTableErrors(['At least 2 data points are required']);
      return;
    }
    
    const validationErrors = validateStageStorageCurve(points);
    if (validationErrors.length > 0) {
      setTableErrors(validationErrors.map(e => `Row ${e.row + 1}: ${e.message}`));
      return;
    }
    
    setTableErrors([]);
    const newCurve: StageStorageCurve = {
      name: stageStorageCurve?.name || 'Imported Pond',
      invertElevation: points[0]?.elevation ?? pondInvertElevation,
      points
    };
    onStageStorageCurveChange(newCurve);
    setCsvPasteText('');
  };

  // Add a new row to stage-storage table
  const addTableRow = () => {
    if (!stageStorageCurve) {
      onStageStorageCurveChange(createEmptyStageStorageCurve('New Pond', pondInvertElevation));
      return;
    }
    
    const lastPoint = stageStorageCurve.points[stageStorageCurve.points.length - 1];
    const newPoint: StageStoragePoint = {
      elevation: (lastPoint?.elevation ?? pondInvertElevation) + 1,
      cumulativeVolume: (lastPoint?.cumulativeVolume ?? 0) + 1000,
      area: lastPoint?.area ?? 1000,
      perimeter: lastPoint?.perimeter ?? 130
    };
    
    onStageStorageCurveChange({
      ...stageStorageCurve,
      points: [...stageStorageCurve.points, newPoint]
    });
  };

  // Remove a row from stage-storage table
  const removeTableRow = (index: number) => {
    if (!stageStorageCurve || stageStorageCurve.points.length <= 2) return;
    
    const newPoints = stageStorageCurve.points.filter((_, i) => i !== index);
    onStageStorageCurveChange({
      ...stageStorageCurve,
      points: newPoints,
      invertElevation: newPoints[0]?.elevation ?? stageStorageCurve.invertElevation
    });
  };

  // Update a cell in stage-storage table
  const updateTableCell = (index: number, field: keyof StageStoragePoint, value: number) => {
    if (!stageStorageCurve) return;
    
    const newPoints = [...stageStorageCurve.points];
    newPoints[index] = { ...newPoints[index], [field]: value };
    
    // Validate and show errors
    const validationErrors = validateStageStorageCurve(newPoints);
    setTableErrors(validationErrors.map(e => `Row ${e.row + 1}: ${e.message}`));
    
    onStageStorageCurveChange({
      ...stageStorageCurve,
      points: newPoints,
      invertElevation: newPoints[0]?.elevation ?? stageStorageCurve.invertElevation
    });
  };

  // Color mapping for visualizations
  const getColor = (event: ReturnPeriod) => {
    switch(event) {
      case '2yr': return '#a7f3d0';
      case '5yr': return '#4ade80';
      case '10yr': return '#22c55e';
      case '25yr': return '#facc15';
      case '50yr': return '#f97316';
      case '100yr': return '#ef4444';
      default: return '#38bdf8';
    }
  };

  return (
    <div
      className="flex flex-col lg:flex-row bg-background text-foreground overflow-hidden"
      style={{ height: 'calc(100vh - 8rem)' }}
    >
      {/* Sidebar / Controls */}
      <aside className="w-full lg:w-2/3 bg-card border-r border-border flex flex-col h-full z-10 shadow-xl">
        {/* Header - Stretched to edges */}
        <div className="px-6 py-4 border-b border-border bg-slate-900/40">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <Settings2 className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold">Pond Design</h2>
            </div>
            <div className="flex items-center gap-3">
              <MethodSelector 
                method={calculationMethod} 
                onMethodChange={setCalculationMethod}
              />
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-400">IDF:</label>
                <select
                  value={interpolationMethod}
                  onChange={(e) => setInterpolationMethod(e.target.value as InterpolationMethod)}
                  className="bg-slate-800 border border-border rounded px-3 py-1.5 text-xs text-white focus:ring-1 focus:ring-primary outline-none"
                  title="IDF interpolation method"
                  aria-label="IDF interpolation method"
                >
                  <option value="log-log">Log-Log</option>
                  <option value="linear">Linear</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Design Volume Quick Summary - Stretched to edges */}
        {designResult && (
          <div className={`px-6 py-2 border-b border-border ${
            designResult.requiredStorageCf > pondCapacity 
              ? 'bg-red-950/10 border-red-500/20' 
              : 'bg-emerald-950/10 border-emerald-500/20'
          }`}>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <div 
                  className="w-2 h-2 rounded-full flex-shrink-0" 
                  style={{ backgroundColor: getColor(designResult.stormEvent) }}
                />
                <span className="text-[10px] text-gray-500 uppercase tracking-wider">Design Volume:</span>
                <span className="text-sm font-bold text-white">
                  {Math.round(designResult.requiredStorageCf).toLocaleString()} cf
                </span>
                <span className="text-[10px] text-gray-500">
                  ({designResult.stormEvent.toUpperCase()}, {designResult.criticalDurationMinutes} min)
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <div className="text-gray-400">
                  Depth: <span className="text-primary font-semibold">{getWaterDepth(designResult.requiredStorageCf).toFixed(2)} ft</span>
                </div>
                <div className="text-gray-400">
                  Util: <span className={`font-semibold ${
                    pondCapacity > 0 && (designResult.requiredStorageCf / pondCapacity) * 100 > 100 
                      ? 'text-red-400' 
                      : 'text-emerald-400'
                  }`}>
                    {pondCapacity > 0 ? ((designResult.requiredStorageCf / pondCapacity) * 100).toFixed(0) : 0}%
                  </span>
                </div>
                <div className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  designResult.requiredStorageCf > pondCapacity 
                    ? 'bg-red-500/20 text-red-400' 
                    : 'bg-emerald-500/20 text-emerald-400'
                }`}>
                  {designResult.requiredStorageCf > pondCapacity ? 'UNDERSIZED' : 'OK'}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Scrollable Content Area */}
        <div className="p-6 overflow-y-auto flex-1">
          <div className="space-y-6">
            {/* Section 1: Drainage Summary */}
            <section className="space-y-3">
              <div className="flex items-center justify-between border-b border-border pb-2">
                <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider flex items-center gap-2">
                  <Droplets className="w-4 h-4" />
                  Drainage Summary
                </h3>
                {drainageTotals && (
                  <button
                    type="button"
                    onClick={resetAllowableToExisting}
                    className="text-[11px] px-2 py-1 border border-border rounded text-gray-400 hover:text-primary hover:border-primary transition-colors"
                  >
                    Reset Allowable Q
                  </button>
                )}
              </div>

              {drainageTotals ? (
                <div className="bg-background border border-border rounded-md overflow-hidden">
                  <table className="w-full text-xs sm:text-sm text-left">
                    <thead className="bg-slate-900/60 text-[11px] uppercase text-gray-400 font-medium">
                      <tr>
                        <th className="px-3 py-2">Storm</th>
                        <th className="px-3 py-2 text-right">Existing Q</th>
                        <th className="px-3 py-2 text-right">Proposed Q</th>
                        <th className="px-3 py-2 text-right">Allowable Q</th>
                        <th className="px-3 py-2 text-right">ΔQ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border bg-card/40">
                      {selectedEvents.map(event => {
                        const existingFlow = drainageTotals.existing.flowTotals[event] ?? 0;
                        const proposedFlow = drainageTotals.proposed.flowTotals[event] ?? 0;
                        const allowable = (allowableFlows[event] ?? existingFlow);
                        const diff = proposedFlow - allowable;
                        const isIncrease = diff > 0;

                        return (
                          <tr key={event} className="hover:bg-white/5 transition-colors">
                            <td className="px-3 py-2 font-medium text-gray-200">{event.toUpperCase()}</td>
                            <td className="px-3 py-2 text-right font-mono text-gray-400">{existingFlow.toFixed(2)}</td>
                            <td className="px-3 py-2 text-right font-mono text-gray-200">{proposedFlow.toFixed(2)}</td>
                            <td className="px-3 py-2 text-right">
                              <input
                                type="number"
                                step="0.01"
                                value={allowable.toFixed(2)}
                                onChange={(e) => {
                                  const value = parseFloat(e.target.value);
                                  setAllowableFlows((prev) => ({
                                    ...prev,
                                    [event]: Number.isFinite(value) ? value : 0,
                                  }));
                                }}
                                className="w-full max-w-[5rem] bg-background border border-border rounded px-2 py-1 text-xs font-mono text-right focus:ring-1 focus:ring-primary outline-none"
                                title="Allowable flow rate (cfs)"
                                aria-label="Allowable flow rate (cfs)"
                              />
                            </td>
                            <td className={`px-3 py-2 text-right font-mono font-semibold ${isIncrease ? 'text-red-400' : 'text-green-400'}`}>
                              {diff > 0 ? '+' : ''}{diff.toFixed(2)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-gray-500">
                  Configure drainage areas first to see existing vs proposed flows.
                </p>
              )}
            </section>

            {/* Section 2.5: Duration Calculations Grid - At Top */}
            {designResult && calculationMethod === 'modified-rational' && (
              <section className="space-y-3">
                <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider border-b border-border pb-2 flex items-center gap-2">
                  <Calculator className="w-4 h-4" />
                  Calculation Details
                </h3>
                <DurationCalculationsGrid 
                  result={designResult}
                  results={results}
                  getColor={getColor}
                  onStormChange={() => {}}
                  iterationFrequency={iterationFrequency}
                  onIterationFrequencyChange={setIterationFrequency}
                  cityId={cityId}
                  interpolationMethod={interpolationMethod}
                  drainageTotals={drainageTotals}
                />
              </section>
            )}

            {/* Section 2: Required Storage by Storm - Consolidated Design Volume and All Storms */}
            {results.length > 0 && (
              <section className="space-y-3">
                <RequiredVolumesSection 
                  results={results}
                  getWaterDepth={getWaterDepth}
                  getColor={getColor}
                  pondCapacity={pondCapacity}
                />
              </section>
            )}

          </div>
        </div>
      </aside>

      {/* Right Side - Pond Geometry and 3D Visualization */}
      <main className="w-full lg:w-1/3 flex flex-col h-full relative bg-gradient-to-b from-slate-900 to-slate-950 overflow-y-auto">
        {/* Pond Mode Toggle */}
        <div className="p-4 border-b border-border bg-slate-900/50">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs text-gray-400 uppercase tracking-wider">Pond Mode:</span>
            <div className="flex bg-slate-800 rounded-lg p-1">
              <button
                onClick={() => onPondModeChange('generic')}
                aria-label="Use generic rectangular pond mode"
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                  pondMode === 'generic' 
                    ? 'bg-primary text-white' 
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <Cuboid className="w-3 h-3 inline mr-1" />
                Generic
              </button>
              <button
                onClick={() => onPondModeChange('custom')}
                aria-label="Use custom stage-storage table mode"
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                  pondMode === 'custom' 
                    ? 'bg-primary text-white' 
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <Table className="w-3 h-3 inline mr-1" />
                Custom
              </button>
            </div>
          </div>
          <p className="text-xs text-gray-500">
            {pondMode === 'generic' 
              ? 'Simple rectangular prism - enter dimensions manually' 
              : 'Import stage-storage table from CAD for accurate calculations'}
          </p>
        </div>

        {/* Pond Geometry Section - Generic Mode */}
        {pondMode === 'generic' && (
          <div className="p-6 border-b border-border bg-slate-900/50">
            <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider border-b border-border pb-2 mb-4 flex items-center gap-2">
              <Cuboid className="w-4 h-4"/> Pond Geometry
            </h3>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Length (ft)</label>
                <input 
                  type="number" 
                  value={pondDims.length} 
                  onChange={e => onPondDimsChange({...pondDims, length: parseFloat(e.target.value) || 0})}
                  className="w-full bg-background border border-border rounded px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none transition-all"
                  placeholder="Length"
                  title="Pond length in feet"
                  aria-label="Pond length in feet"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Width (ft)</label>
                <input 
                  type="number" 
                  value={pondDims.width} 
                  onChange={e => onPondDimsChange({...pondDims, width: parseFloat(e.target.value) || 0})}
                  className="w-full bg-background border border-border rounded px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none transition-all"
                  placeholder="Width"
                  title="Pond width in feet"
                  aria-label="Pond width in feet"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Depth (ft)</label>
                <input 
                  type="number" 
                  value={pondDims.depth} 
                  onChange={e => onPondDimsChange({...pondDims, depth: parseFloat(e.target.value) || 0})}
                  className="w-full bg-background border border-border rounded px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none transition-all"
                  placeholder="Depth"
                  title="Pond depth in feet"
                  aria-label="Pond depth in feet"
                />
              </div>
            </div>
            
            {/* Pond Capacity Summary */}
            <div className="bg-slate-800/50 rounded-lg p-4 flex items-center justify-between">
              <div>
                <div className="text-xs text-gray-500 uppercase tracking-wider">Pond Capacity</div>
                <div className="text-xl font-bold text-white">{pondCapacity.toLocaleString()} <span className="text-sm font-normal text-gray-400">cf</span></div>
              </div>
              <div className="text-right">
                <div className="text-xs text-gray-500 uppercase tracking-wider">Surface Area</div>
                <div className="text-lg font-semibold text-gray-300">{(pondDims.length * pondDims.width).toLocaleString()} <span className="text-sm font-normal text-gray-500">sf</span></div>
              </div>
            </div>
          </div>
        )}

        {/* Stage-Storage Table - Custom Mode */}
        {pondMode === 'custom' && (
          <div className="p-4 border-b border-border bg-slate-900/50 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider flex items-center gap-2">
                <Table className="w-4 h-4"/> Stage-Storage Table
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={addTableRow}
                  className="p-1.5 bg-slate-700 hover:bg-slate-600 rounded text-gray-300 hover:text-white transition-colors"
                  title="Add row"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Pond Name Input */}
            <div>
              <label className="block text-xs text-gray-400 mb-1">Pond Name</label>
              <input
                type="text"
                value={stageStorageCurve?.name || ''}
                onChange={(e) => {
                  if (stageStorageCurve) {
                    onStageStorageCurveChange({ ...stageStorageCurve, name: e.target.value });
                  } else {
                    onStageStorageCurveChange(createEmptyStageStorageCurve(e.target.value, pondInvertElevation));
                  }
                }}
                placeholder="Enter pond name"
                title="Pond name for identification"
                aria-label="Pond name for identification"
                className="w-full bg-background border border-border rounded px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none transition-all"
              />
            </div>

            {/* CSV Paste Area */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs text-gray-400">Paste CSV Data</label>
                <span className="text-[10px] text-gray-500">elevation, volume, area, perimeter</span>
              </div>
              <textarea
                value={csvPasteText}
                onChange={(e) => setCsvPasteText(e.target.value)}
                placeholder="Paste CSV data here (comma or tab separated)..."
                title="Paste stage-storage CSV data"
                aria-label="Paste stage-storage CSV data"
                className="w-full h-20 bg-background border border-border rounded px-3 py-2 text-xs font-mono focus:ring-2 focus:ring-primary outline-none resize-none"
              />
              <button
                onClick={handleCsvPaste}
                disabled={!csvPasteText.trim()}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-primary/20 hover:bg-primary/30 text-primary rounded text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Upload className="w-4 h-4" />
                Import CSV Data
              </button>
            </div>

            {/* Validation Errors */}
            {tableErrors.length > 0 && (
              <div className="bg-red-950/30 border border-red-500/30 rounded p-3">
                <div className="flex items-center gap-2 text-red-400 text-xs font-medium mb-1">
                  <AlertTriangle className="w-3 h-3" />
                  Validation Errors
                </div>
                <ul className="text-xs text-red-300 space-y-0.5">
                  {tableErrors.slice(0, 3).map((err, i) => (
                    <li key={i}>• {err}</li>
                  ))}
                  {tableErrors.length > 3 && (
                    <li className="text-red-400">... and {tableErrors.length - 3} more</li>
                  )}
                </ul>
              </div>
            )}

            {/* Editable Table */}
            {stageStorageCurve && stageStorageCurve.points.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-800/50 text-[10px] uppercase text-gray-400">
                    <tr>
                      <th className="px-2 py-2 text-left">Elev (ft)</th>
                      <th className="px-2 py-2 text-right">Vol (cf)</th>
                      <th className="px-2 py-2 text-right">Area (sf)</th>
                      <th className="px-2 py-2 text-right">Perim (ft)</th>
                      <th className="px-1 py-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {stageStorageCurve.points.map((point, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/30">
                        <td className="px-1 py-1">
                          <input
                            type="number"
                            step="0.1"
                            value={point.elevation}
                            onChange={(e) => updateTableCell(idx, 'elevation', parseFloat(e.target.value) || 0)}
                            className="w-full bg-background border border-border rounded px-2 py-1 text-xs font-mono focus:ring-1 focus:ring-primary outline-none"
                            title={`Elevation at row ${idx + 1}`}
                          />
                        </td>
                        <td className="px-1 py-1">
                          <input
                            type="number"
                            step="100"
                            value={point.cumulativeVolume}
                            onChange={(e) => updateTableCell(idx, 'cumulativeVolume', parseFloat(e.target.value) || 0)}
                            className="w-full bg-background border border-border rounded px-2 py-1 text-xs font-mono text-right focus:ring-1 focus:ring-primary outline-none"
                            title={`Cumulative volume at row ${idx + 1}`}
                          />
                        </td>
                        <td className="px-1 py-1">
                          <input
                            type="number"
                            step="100"
                            value={point.area}
                            onChange={(e) => updateTableCell(idx, 'area', parseFloat(e.target.value) || 0)}
                            className="w-full bg-background border border-border rounded px-2 py-1 text-xs font-mono text-right focus:ring-1 focus:ring-primary outline-none"
                            title={`Surface area at row ${idx + 1}`}
                          />
                        </td>
                        <td className="px-1 py-1">
                          <input
                            type="number"
                            step="1"
                            value={point.perimeter}
                            onChange={(e) => updateTableCell(idx, 'perimeter', parseFloat(e.target.value) || 0)}
                            className="w-full bg-background border border-border rounded px-2 py-1 text-xs font-mono text-right focus:ring-1 focus:ring-primary outline-none"
                            title={`Perimeter at row ${idx + 1}`}
                          />
                        </td>
                        <td className="px-1 py-1 text-center">
                          <button
                            onClick={() => removeTableRow(idx)}
                            disabled={stageStorageCurve.points.length <= 2}
                            className="p-1 text-gray-500 hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            title="Remove row"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Stage-Storage Summary */}
            {stageStorageCurve && stageStorageCurve.points.length >= 2 && (
              <div className="bg-slate-800/50 rounded-lg p-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-gray-500 uppercase tracking-wider">Max Capacity</div>
                    <div className="text-lg font-bold text-white">
                      {getStageStorageStats(stageStorageCurve).maxVolume.toLocaleString()} <span className="text-sm font-normal text-gray-400">cf</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 uppercase tracking-wider">Total Depth</div>
                    <div className="text-lg font-semibold text-gray-300">
                      {getStageStorageStats(stageStorageCurve).totalDepth.toFixed(1)} <span className="text-sm font-normal text-gray-500">ft</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 uppercase tracking-wider">Max Area</div>
                    <div className="text-lg font-semibold text-gray-300">
                      {getStageStorageStats(stageStorageCurve).maxArea.toLocaleString()} <span className="text-sm font-normal text-gray-500">sf</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 uppercase tracking-wider">Elev Range</div>
                    <div className="text-lg font-semibold text-gray-300">
                      {getStageStorageStats(stageStorageCurve).minElevation.toFixed(1)} - {getStageStorageStats(stageStorageCurve).maxElevation.toFixed(1)} <span className="text-sm font-normal text-gray-500">ft</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Stage-Storage Chart */}
        {pondMode === 'custom' && stageStorageCurve && stageStorageCurve.points.length >= 2 && (
          <div className="p-4 border-b border-border bg-slate-900/30">
            <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <TrendingUp className="w-4 h-4"/> Stage-Storage Curve
            </h3>
            <StageStorageChart 
              curve={stageStorageCurve}
              waterLevels={results.map(r => ({
                volume: r.requiredStorageCf,
                elevation: getWaterElevation(r.requiredStorageCf),
                color: getColor(r.stormEvent),
                label: r.stormEvent.toUpperCase()
              }))}
            />
          </div>
        )}

        {/* 3D Visualization */}
        <div className="flex-1 min-h-[300px]">
          <Canvas className="w-full h-full" camera={{ position: [180, 180, 180], fov: 45 }}>
            <color attach="background" args={['#020617']} />
            <ambientLight intensity={0.5} />
            <pointLight position={[100, 100, 100]} intensity={1} />
            <Grid infiniteGrid fadeDistance={500} sectionColor="#1e293b" cellColor="#0f172a" />
            
            <PondMesh 
              width={pondMode === 'custom' && stageStorageCurve 
                ? Math.sqrt(getStageStorageStats(stageStorageCurve).maxArea) 
                : pondDims.width} 
              length={pondMode === 'custom' && stageStorageCurve 
                ? Math.sqrt(getStageStorageStats(stageStorageCurve).maxArea) 
                : pondDims.length} 
              depth={pondMode === 'custom' && stageStorageCurve 
                ? getStageStorageStats(stageStorageCurve).totalDepth 
                : pondDims.depth}
              waterLevels={results.map(r => ({
                level: getWaterDepth(r.requiredStorageCf),
                color: getColor(r.stormEvent),
                label: r.stormEvent.toUpperCase()
              }))}
            />
            
            <OrbitControls 
              makeDefault 
              minPolarAngle={0} 
              maxPolarAngle={Math.PI / 2.1} 
              enableDamping={true}
              dampingFactor={0.05}
              rotateSpeed={0.5}
              zoomSpeed={0.8}
              panSpeed={0.5}
            />
          </Canvas>
        </div>
        
        <div className="absolute bottom-4 left-0 right-0 text-center pointer-events-none">
            <p className="text-xs text-gray-500">Left Click to Rotate • Right Click to Pan • Scroll to Zoom</p>
        </div>
      </main>
    </div>
  );
}
