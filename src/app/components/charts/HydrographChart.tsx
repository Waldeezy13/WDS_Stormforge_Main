'use client';

import React, { useState, useMemo, useRef } from 'react';
import { Activity, Droplets, TrendingDown, ChevronDown } from 'lucide-react';
import type { ReturnPeriod } from '@/utils/atlas14';

// Color mapping for storm events
const getEventColor = (event: ReturnPeriod | string): string => {
  switch(event) {
    case '1yr': return '#93c5fd';
    case '2yr': return '#a7f3d0';
    case '5yr': return '#4ade80';
    case '10yr': return '#22c55e';
    case '25yr': return '#facc15';
    case '50yr': return '#f97316';
    case '100yr': return '#ef4444';
    case '500yr': return '#a855f7';
    default: return '#38bdf8';
  }
};

/**
 * Represents a time series data point for the hydrograph
 */
interface HydrographPoint {
  timeMin: number;      // Time in minutes
  inflowCfs: number;    // Inflow rate (cfs)
  outflowCfs: number;   // Outflow rate (cfs)
  storageCf: number;    // Storage volume (cf)
  wse: number;          // Water surface elevation (ft)
}

/**
 * Hydrograph data for a single storm event
 */
export interface StormHydrograph {
  stormEvent: ReturnPeriod | string;
  data: HydrographPoint[];
  peakInflowCfs: number;
  peakInflowTimeMin: number;
  peakOutflowCfs: number;
  peakOutflowTimeMin: number;
  peakWSE: number;
  peakWSETimeMin: number;
  allowableQCfs: number;
  maxWSE: number;          // Maximum allowable WSE (pond top)
}

interface HydrographChartProps {
  hydrographs: StormHydrograph[];
  pondInvertElevation: number;
  pondTopElevation: number;
  selectedStorm?: string | null;
  onStormChange?: (stormEvent: string) => void;
}

/**
 * HydrographChart - WSE and Q vs Time visualization for storm events
 * 
 * Features:
 * - Dual Y-axis: WSE (left) and Q (right)
 * - Inflow hydrograph (dashed)
 * - Outflow hydrograph (solid)
 * - WSE curve
 * - Peak markers and annotations
 * - Storm event selector dropdown
 */
export default function HydrographChart({
  hydrographs,
  pondInvertElevation,
  pondTopElevation,
  selectedStorm,
  onStormChange
}: HydrographChartProps) {
  const chartWidth = 800;
  const chartHeight = 400;
  const padding = { top: 40, right: 80, bottom: 70, left: 80 };
  const plotWidth = chartWidth - padding.left - padding.right;
  const plotHeight = chartHeight - padding.top - padding.bottom;

  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [tooltipData, setTooltipData] = useState<HydrographPoint | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [showDropdown, setShowDropdown] = useState(false);

  // Get the currently selected hydrograph
  const currentHydrograph = useMemo(() => {
    if (!selectedStorm || hydrographs.length === 0) {
      return hydrographs[0] || null;
    }
    return hydrographs.find(h => h.stormEvent === selectedStorm) || hydrographs[0];
  }, [hydrographs, selectedStorm]);

  // Calculate axis ranges
  const { maxTime, maxQ, minWSE, maxWSE } = useMemo(() => {
    if (!currentHydrograph || currentHydrograph.data.length === 0) {
      return { maxTime: 60, maxQ: 10, minWSE: pondInvertElevation, maxWSE: pondTopElevation };
    }

    const data = currentHydrograph.data;
    const times = data.map(d => d.timeMin).filter(Number.isFinite);
    const qs = data.flatMap(d => [d.inflowCfs, d.outflowCfs]).filter(Number.isFinite);
    const wses = data.map(d => d.wse).filter(Number.isFinite);
    const allowableQ = Number.isFinite(currentHydrograph.allowableQCfs) ? currentHydrograph.allowableQCfs : 0;

    return {
      maxTime: (times.length ? Math.max(...times) : 60) * 1.1,
      maxQ: (qs.length ? Math.max(...qs, allowableQ) : Math.max(10, allowableQ)) * 1.1,
      minWSE: (wses.length ? Math.min(pondInvertElevation, ...wses) : pondInvertElevation) - 0.5,
      maxWSE: (wses.length ? Math.max(pondTopElevation, ...wses) : pondTopElevation) + 0.5
    };
  }, [currentHydrograph, pondInvertElevation, pondTopElevation]);

  const safeMaxTime = Number.isFinite(maxTime) && maxTime > 0 ? maxTime : 1;
  const safeMaxQ = Number.isFinite(maxQ) && maxQ > 0 ? maxQ : 1;
  const safeMinWSE = Number.isFinite(minWSE) ? minWSE : pondInvertElevation;
  const safeMaxWSE = Number.isFinite(maxWSE) ? maxWSE : pondTopElevation;
  const safeWSERange = safeMaxWSE - safeMinWSE > 0 ? safeMaxWSE - safeMinWSE : 1;

  // Convert data to SVG coordinates
  const toSVG_Q = (time: number, q: number) => {
    const x = padding.left + (time / safeMaxTime) * plotWidth;
    const y = padding.top + plotHeight - (q / safeMaxQ) * plotHeight;
    return { x, y };
  };

  const toSVG_WSE = (time: number, wse: number) => {
    const x = padding.left + (time / safeMaxTime) * plotWidth;
    const normalizedWSE = (wse - safeMinWSE) / safeWSERange;
    const y = padding.top + plotHeight - normalizedWSE * plotHeight;
    return { x, y };
  };

  // Generate path strings
  const generateQPath = (getData: (p: HydrographPoint) => number): string => {
    if (!currentHydrograph) return '';
    const points = currentHydrograph.data.map(p => toSVG_Q(p.timeMin, getData(p)));
    if (points.length === 0) return '';
    return `M ${points[0].x} ${points[0].y} ${points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ')}`;
  };

  const generateWSEPath = (): string => {
    if (!currentHydrograph) return '';
    const points = currentHydrograph.data.map(p => toSVG_WSE(p.timeMin, p.wse));
    if (points.length === 0) return '';
    return `M ${points[0].x} ${points[0].y} ${points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ')}`;
  };

  // Handle mouse interaction
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || !currentHydrograph) return;
    
    const rect = svgRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    if (x < padding.left || x > padding.left + plotWidth || 
        y < padding.top || y > padding.top + plotHeight) {
      setMousePos(null);
      setTooltipData(null);
      return;
    }
    
    setMousePos({ x, y });
    
    // Find nearest data point
    const time = ((x - padding.left) / plotWidth) * maxTime;
    const nearestIdx = currentHydrograph.data.reduce((best, point, idx) => {
      const bestDiff = Math.abs(currentHydrograph.data[best].timeMin - time);
      const thisDiff = Math.abs(point.timeMin - time);
      return thisDiff < bestDiff ? idx : best;
    }, 0);
    
    setTooltipData(currentHydrograph.data[nearestIdx]);
  };

  const handleMouseLeave = () => {
    setMousePos(null);
    setTooltipData(null);
  };

  // Generate grid lines
  const timeTicks = useMemo(() => {
    const ticks: number[] = [];
    const step = maxTime > 120 ? 30 : maxTime > 60 ? 15 : maxTime > 30 ? 10 : 5;
    for (let t = 0; t <= maxTime; t += step) {
      ticks.push(t);
    }
    return ticks;
  }, [maxTime]);

  const qTicks = useMemo(() => {
    const ticks: number[] = [];
    const step = maxQ > 100 ? 20 : maxQ > 50 ? 10 : maxQ > 20 ? 5 : maxQ > 10 ? 2 : 1;
    for (let q = 0; q <= maxQ; q += step) {
      ticks.push(q);
    }
    return ticks;
  }, [maxQ]);

  const wseTicks = useMemo(() => {
    const ticks: number[] = [];
    const range = maxWSE - minWSE;
    const step = range > 10 ? 2 : range > 5 ? 1 : 0.5;
    for (let wse = Math.ceil(minWSE / step) * step; wse <= maxWSE; wse += step) {
      ticks.push(wse);
    }
    return ticks;
  }, [minWSE, maxWSE]);

  if (!currentHydrograph) {
    return (
      <div className="bg-card border border-border rounded-lg p-8 text-center text-muted-foreground">
        <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p>No hydrograph data available</p>
        <p className="text-xs mt-1">Run the solver to generate time-series data</p>
      </div>
    );
  }

  const stormColor = getEventColor(currentHydrograph.stormEvent);
  const isPassing = currentHydrograph.peakOutflowCfs <= currentHydrograph.allowableQCfs;
  const hasFreeboardIssue = currentHydrograph.peakWSE > pondTopElevation - 1;

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden shadow-xl">
      <div className="px-6 py-4 border-b border-border bg-slate-900/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Activity className="w-5 h-5 text-primary" />
            <h3 className="font-semibold text-lg">Hydrograph: WSE & Q vs Time</h3>
            
            {/* Storm Selector Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowDropdown(!showDropdown)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-600 hover:border-slate-500 transition-colors"
                style={{ borderColor: stormColor }}
              >
                <span 
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: stormColor }}
                />
                <span className="text-sm font-medium" style={{ color: stormColor }}>
                  {currentHydrograph.stormEvent.toUpperCase()}
                </span>
                <ChevronDown className="w-4 h-4 text-gray-400" />
              </button>
              
              {showDropdown && (
                <div className="absolute top-full left-0 mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-xl z-50 min-w-[140px]">
                  {hydrographs.map(h => {
                    const color = getEventColor(h.stormEvent);
                    const isSelected = h.stormEvent === currentHydrograph.stormEvent;
                    const passes = h.peakOutflowCfs <= h.allowableQCfs;
                    
                    return (
                      <button
                        key={h.stormEvent}
                        onClick={() => {
                          onStormChange?.(h.stormEvent as string);
                          setShowDropdown(false);
                        }}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-700 transition-colors ${
                          isSelected ? 'bg-slate-700' : ''
                        }`}
                      >
                        <span 
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: color }}
                        />
                        <span style={{ color }}>{h.stormEvent.toUpperCase()}</span>
                        <span className={`ml-auto text-xs ${passes ? 'text-emerald-400' : 'text-red-400'}`}>
                          {passes ? '✓' : '✗'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          
          {/* Status indicators */}
          <div className="flex items-center gap-4">
            <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium ${
              isPassing ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
            }`}>
              <TrendingDown className="w-3 h-3" />
              Q<sub>peak</sub>: {currentHydrograph.peakOutflowCfs.toFixed(2)} cfs
              {!isPassing && ` > ${currentHydrograph.allowableQCfs.toFixed(2)}`}
            </div>
            <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium ${
              hasFreeboardIssue ? 'bg-amber-500/20 text-amber-400' : 'bg-blue-500/20 text-blue-400'
            }`}>
              <Droplets className="w-3 h-3" />
              WSE<sub>peak</sub>: {currentHydrograph.peakWSE.toFixed(2)} ft
            </div>
          </div>
        </div>
      </div>

      <div className="p-6 overflow-x-auto relative">
        <svg 
          ref={svgRef}
          width={chartWidth} 
          height={chartHeight} 
          className="bg-slate-900/30 rounded cursor-crosshair"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          {/* Grid lines */}
          {timeTicks.map(time => {
            const { x } = toSVG_Q(time, 0);
            return (
              <g key={`grid-x-${time}`}>
                <line
                  x1={x}
                  y1={padding.top}
                  x2={x}
                  y2={padding.top + plotHeight}
                  stroke="#374151"
                  strokeWidth={0.5}
                  strokeDasharray="2,2"
                />
                <text
                  x={x}
                  y={chartHeight - padding.bottom + 20}
                  textAnchor="middle"
                  className="text-xs fill-gray-400"
                >
                  {time}
                </text>
              </g>
            );
          })}
          
          {/* Q grid (left axis) */}
          {qTicks.map((q) => {
            const { y } = toSVG_Q(0, q);
            return (
              <g key={`grid-y-q-${q}`}>
                <line
                  x1={padding.left}
                  y1={y}
                  x2={padding.left + plotWidth}
                  y2={y}
                  stroke="#374151"
                  strokeWidth={0.5}
                  strokeDasharray="2,2"
                />
                <text
                  x={padding.left - 10}
                  y={y + 4}
                  textAnchor="end"
                  className="text-xs fill-blue-400"
                >
                  {q.toFixed(0)}
                </text>
              </g>
            );
          })}

          {/* WSE grid (right axis) */}
          {wseTicks.map((wse) => {
            const { y } = toSVG_WSE(0, wse);
            return (
              <text
                key={`wse-tick-${wse}`}
                x={padding.left + plotWidth + 10}
                y={y + 4}
                textAnchor="start"
                className="text-xs fill-emerald-400"
              >
                {wse.toFixed(1)}
              </text>
            );
          })}

          {/* Axes */}
          <line
            x1={padding.left}
            y1={padding.top + plotHeight}
            x2={padding.left + plotWidth}
            y2={padding.top + plotHeight}
            stroke="#6b7280"
            strokeWidth={2}
          />
          <line
            x1={padding.left}
            y1={padding.top}
            x2={padding.left}
            y2={padding.top + plotHeight}
            stroke="#60a5fa"
            strokeWidth={2}
          />
          <line
            x1={padding.left + plotWidth}
            y1={padding.top}
            x2={padding.left + plotWidth}
            y2={padding.top + plotHeight}
            stroke="#34d399"
            strokeWidth={2}
          />

          {/* Axis Labels */}
          <text
            x={padding.left + plotWidth / 2}
            y={chartHeight - 12}
            textAnchor="middle"
            className="text-sm fill-gray-300 font-medium"
          >
            Time (min)
          </text>
          <text
            x={20}
            y={padding.top + plotHeight / 2}
            textAnchor="middle"
            className="text-sm fill-blue-400 font-medium"
            transform={`rotate(-90, 20, ${padding.top + plotHeight / 2})`}
          >
            Discharge Q (cfs)
          </text>
          <text
            x={chartWidth - 20}
            y={padding.top + plotHeight / 2}
            textAnchor="middle"
            className="text-sm fill-emerald-400 font-medium"
            transform={`rotate(90, ${chartWidth - 20}, ${padding.top + plotHeight / 2})`}
          >
            WSE (ft)
          </text>

          {/* Allowable Q line */}
          <line
            x1={padding.left}
            y1={toSVG_Q(0, currentHydrograph.allowableQCfs).y}
            x2={padding.left + plotWidth}
            y2={toSVG_Q(0, currentHydrograph.allowableQCfs).y}
            stroke="#ef4444"
            strokeWidth={1.5}
            strokeDasharray="8,4"
            opacity={0.7}
          />
          <text
            x={padding.left + 5}
            y={toSVG_Q(0, currentHydrograph.allowableQCfs).y - 5}
            className="text-[10px] fill-red-400 font-medium"
          >
            Q<tspan baselineShift="sub" className="text-[8px]">allow</tspan> = {currentHydrograph.allowableQCfs.toFixed(2)} cfs
          </text>

          {/* Max WSE line (pond top) */}
          <line
            x1={padding.left}
            y1={toSVG_WSE(0, pondTopElevation).y}
            x2={padding.left + plotWidth}
            y2={toSVG_WSE(0, pondTopElevation).y}
            stroke="#f59e0b"
            strokeWidth={1.5}
            strokeDasharray="8,4"
            opacity={0.7}
          />
          <text
            x={padding.left + plotWidth - 5}
            y={toSVG_WSE(0, pondTopElevation).y - 5}
            textAnchor="end"
            className="text-[10px] fill-amber-400 font-medium"
          >
            Pond Top = {pondTopElevation.toFixed(2)} ft
          </text>

          {/* Inflow hydrograph (dashed) */}
          <path
            d={generateQPath(p => p.inflowCfs)}
            fill="none"
            stroke="#94a3b8"
            strokeWidth={2}
            strokeDasharray="6,3"
            opacity={0.7}
          />

          {/* Outflow hydrograph (solid) */}
          <path
            d={generateQPath(p => p.outflowCfs)}
            fill="none"
            stroke={stormColor}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* WSE curve */}
          <path
            d={generateWSEPath()}
            fill="none"
            stroke="#34d399"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Peak markers */}
          {/* Peak outflow */}
          <g>
            <circle
              cx={toSVG_Q(currentHydrograph.peakOutflowTimeMin, currentHydrograph.peakOutflowCfs).x}
              cy={toSVG_Q(currentHydrograph.peakOutflowTimeMin, currentHydrograph.peakOutflowCfs).y}
              r={6}
              fill={stormColor}
              stroke="white"
              strokeWidth={2}
            />
          </g>

          {/* Peak WSE */}
          <g>
            <circle
              cx={toSVG_WSE(currentHydrograph.peakWSETimeMin, currentHydrograph.peakWSE).x}
              cy={toSVG_WSE(currentHydrograph.peakWSETimeMin, currentHydrograph.peakWSE).y}
              r={6}
              fill="#34d399"
              stroke="white"
              strokeWidth={2}
            />
          </g>

          {/* Interactive Crosshair */}
          {mousePos && tooltipData && (
            <g className="pointer-events-none">
              <line
                x1={toSVG_Q(tooltipData.timeMin, 0).x}
                y1={padding.top}
                x2={toSVG_Q(tooltipData.timeMin, 0).x}
                y2={padding.top + plotHeight}
                stroke="#64748b"
                strokeWidth={1}
                strokeDasharray="4,4"
                opacity={0.8}
              />
              
              {/* Q point marker */}
              <circle
                cx={toSVG_Q(tooltipData.timeMin, tooltipData.outflowCfs).x}
                cy={toSVG_Q(tooltipData.timeMin, tooltipData.outflowCfs).y}
                r={5}
                fill={stormColor}
                stroke="white"
                strokeWidth={2}
              />
              
              {/* WSE point marker */}
              <circle
                cx={toSVG_WSE(tooltipData.timeMin, tooltipData.wse).x}
                cy={toSVG_WSE(tooltipData.timeMin, tooltipData.wse).y}
                r={5}
                fill="#34d399"
                stroke="white"
                strokeWidth={2}
              />
            </g>
          )}

          {/* Legend */}
          <g transform={`translate(${padding.left + 15}, ${padding.top + 15})`}>
            <rect x={0} y={0} width={140} height={75} fill="#1e293b" opacity={0.9} rx={4} />
            
            <line x1={10} y1={15} x2={30} y2={15} stroke="#94a3b8" strokeWidth={2} strokeDasharray="6,3" />
            <text x={40} y={18} className="text-[10px] fill-gray-400">Q<tspan baselineShift="sub" className="text-[8px]">in</tspan> (inflow)</text>
            
            <line x1={10} y1={32} x2={30} y2={32} stroke={stormColor} strokeWidth={2.5} />
            <text x={40} y={35} className="text-[10px] fill-gray-300">Q<tspan baselineShift="sub" className="text-[8px]">out</tspan> (outflow)</text>
            
            <line x1={10} y1={49} x2={30} y2={49} stroke="#34d399" strokeWidth={2.5} />
            <text x={40} y={52} className="text-[10px] fill-emerald-400">WSE</text>
            
            <line x1={10} y1={66} x2={30} y2={66} stroke="#ef4444" strokeWidth={1.5} strokeDasharray="8,4" />
            <text x={40} y={69} className="text-[10px] fill-red-400">Q<tspan baselineShift="sub" className="text-[8px]">allow</tspan></text>
          </g>
        </svg>

        {/* Tooltip */}
        {mousePos && tooltipData && (
          <div
            className="absolute pointer-events-none z-50"
            style={{
              left: `${mousePos.x + 16}px`,
              top: `${mousePos.y - 10}px`,
              transform: mousePos.x > chartWidth - 200 ? 'translateX(-110%)' : 'none'
            }}
          >
            <div className="bg-slate-800/95 backdrop-blur-sm border border-slate-600 rounded-lg shadow-xl px-4 py-3 min-w-[180px]">
              <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-600">
                <span className="font-semibold text-sm text-white">
                  t = {tooltipData.timeMin.toFixed(1)} min
                </span>
              </div>
              
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-xs text-gray-400">Q<sub>in</sub></span>
                  <span className="font-mono text-sm text-gray-300">
                    {tooltipData.inflowCfs.toFixed(2)} <span className="text-gray-500 text-xs">cfs</span>
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-xs" style={{ color: stormColor }}>Q<sub>out</sub></span>
                  <span className="font-mono text-sm text-white">
                    {tooltipData.outflowCfs.toFixed(2)} <span className="text-gray-500 text-xs">cfs</span>
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-xs text-emerald-400">WSE</span>
                  <span className="font-mono text-sm text-emerald-300">
                    {tooltipData.wse.toFixed(2)} <span className="text-gray-500 text-xs">ft</span>
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4 pt-1 border-t border-slate-700">
                  <span className="text-xs text-gray-500">Storage</span>
                  <span className="font-mono text-xs text-gray-400">
                    {tooltipData.storageCf.toFixed(0)} <span className="text-gray-600">cf</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Generate synthetic hydrograph data for a storm event
 * Uses Modified Rational Method assumptions for simplified routing
 * 
 * This is a helper function to generate sample hydrograph data
 * In a full implementation, this would come from actual routing calculations
 */
export function generateSyntheticHydrograph(
  stormEvent: ReturnPeriod | string,
  tcMinutes: number,
  peakInflowCfs: number,
  allowableQCfs: number,
  requiredStorageCf: number,
  pondInvertElevation: number,
  pondAreaSqFt: number,
  outflowRatingCurve: (wse: number) => number
): StormHydrograph {
  const data: HydrographPoint[] = [];
  
  // Storm duration typically 2-3× Tc for detention analysis
  const stormDurationMin = tcMinutes * 2.5;
  const totalDurationMin = stormDurationMin * 1.5; // Include recession
  
  const timeStep = Math.max(1, Math.round(tcMinutes / 20)); // ~20 points for rising limb
  
  let currentStorage = 0;
  let peakOutflow = 0;
  let peakOutflowTime = 0;
  let peakWSE = pondInvertElevation;
  let peakWSETime = 0;
  
  for (let t = 0; t <= totalDurationMin; t += timeStep) {
    // Triangular inflow hydrograph (simplified)
    let inflowCfs: number;
    if (t <= tcMinutes) {
      // Rising limb
      inflowCfs = peakInflowCfs * (t / tcMinutes);
    } else if (t <= stormDurationMin) {
      // Recession (linear)
      inflowCfs = peakInflowCfs * (1 - (t - tcMinutes) / (stormDurationMin - tcMinutes));
    } else {
      inflowCfs = 0;
    }
    
    // Calculate current WSE from storage
    const depth = currentStorage / pondAreaSqFt;
    const wse = pondInvertElevation + depth;
    
    // Calculate outflow from rating curve
    const outflowCfs = outflowRatingCurve(wse);
    
    // Update storage (mass balance) - simplified Euler step
    const netInflow = inflowCfs - outflowCfs;
    currentStorage = Math.max(0, currentStorage + netInflow * (timeStep * 60)); // Convert min to sec
    
    // Track peaks
    if (outflowCfs > peakOutflow) {
      peakOutflow = outflowCfs;
      peakOutflowTime = t;
    }
    if (wse > peakWSE) {
      peakWSE = wse;
      peakWSETime = t;
    }
    
    data.push({
      timeMin: t,
      inflowCfs,
      outflowCfs,
      storageCf: currentStorage,
      wse
    });
  }
  
  return {
    stormEvent,
    data,
    peakInflowCfs,
    peakInflowTimeMin: tcMinutes,
    peakOutflowCfs: peakOutflow,
    peakOutflowTimeMin: peakOutflowTime,
    peakWSE,
    peakWSETimeMin: peakWSETime,
    allowableQCfs,
    maxWSE: pondInvertElevation + (requiredStorageCf / pondAreaSqFt) + 1
  };
}
