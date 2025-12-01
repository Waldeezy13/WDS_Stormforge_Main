'use client';

import React, { useState, useMemo, useRef } from 'react';
import { TrendingUp, Circle, Square, Eye, EyeOff } from 'lucide-react';
import { OutfallStructure, getStructureDischarge, calculateTotalDischarge } from '@/utils/hydraulics';
import type { ReturnPeriod } from '@/utils/atlas14';

// Color mapping for storm events
const getEventColor = (event: ReturnPeriod | string): string => {
  switch(event) {
    case '1yr': return '#93c5fd'; // Light blue
    case '2yr': return '#a7f3d0'; // Light green
    case '5yr': return '#4ade80'; // Green
    case '10yr': return '#22c55e'; // Darker green
    case '25yr': return '#facc15'; // Yellow
    case '50yr': return '#f97316'; // Orange
    case '100yr': return '#ef4444'; // Red
    case '500yr': return '#a855f7'; // Purple
    default: return '#38bdf8'; // Sky blue
  }
};

// Color mapping for orifice structures
const STRUCTURE_COLORS = [
  '#60a5fa', // Blue
  '#34d399', // Emerald
  '#fbbf24', // Amber
  '#f472b6', // Pink
  '#a78bfa', // Violet
  '#fb923c', // Orange
  '#2dd4bf', // Teal
  '#e879f9', // Fuchsia
];

interface StormDataPoint {
  stormEvent: ReturnPeriod | string;
  allowableQCfs: number;
  designHeadFt: number;  // Head at peak WSE
  actualQCfs: number;    // Actual Q from rating curve at peak head
  wse: number;           // Water surface elevation
}

interface RatingCurveChartProps {
  structures: OutfallStructure[];
  pondInvertElevation: number;
  pondTopElevation: number;
  stormData: StormDataPoint[];
  tailwaterElevations: Record<string, number>;
  onStormClick?: (stormEvent: string) => void;
  selectedStorm?: string | null;
}

/**
 * RatingCurveChart - Interactive Q vs Head (Rating Curve) visualization
 * 
 * Features:
 * - Total plate rating curve (Q_total vs H)
 * - Per-orifice rating curves (toggleable)
 * - Storm design points showing (H_peak, Q_actual) and Q_allowable lines
 * - Interactive crosshairs with tooltips
 */
export default function RatingCurveChart({
  structures,
  pondInvertElevation,
  pondTopElevation,
  stormData,
  tailwaterElevations,
  onStormClick,
  selectedStorm
}: RatingCurveChartProps) {
  const chartWidth = 800;
  const chartHeight = 450;
  const padding = { top: 40, right: 180, bottom: 70, left: 80 };
  const plotWidth = chartWidth - padding.left - padding.right;
  const plotHeight = chartHeight - padding.top - padding.bottom;

  // State for toggling individual orifice curves
  const [showTotal, setShowTotal] = useState(true);
  const [visibleStructures, setVisibleStructures] = useState<Set<string>>(new Set());
  const [showAllowableLines, setShowAllowableLines] = useState(true);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [tooltipData, setTooltipData] = useState<{
    head: number;
    totalQ: number;
    perStructure: { id: string; q: number; color: string }[];
  } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Calculate rating curve data points
  const { ratingCurve, maxHead, maxQ } = useMemo(() => {
    // Max head is pond depth (top - invert)
    const maxH = Math.max(pondTopElevation - pondInvertElevation, 1);
    
    // Generate rating curve points
    const numPoints = 100;
    const curve: Array<{
      head: number;
      wse: number;
      totalQ: number;
      perStructure: Array<{ id: string; q: number; flowType: string }>;
    }> = [];

    let maxQFound = 0;

    for (let i = 0; i <= numPoints; i++) {
      const head = (i / numPoints) * maxH;
      const wse = pondInvertElevation + head;
      
      // Calculate total discharge at this WSE
      const { totalDischarge, details } = calculateTotalDischarge(structures, wse, undefined);
      
      curve.push({
        head,
        wse,
        totalQ: totalDischarge,
        perStructure: details.map(d => ({
          id: d.id,
          q: d.result.dischargeCfs,
          flowType: d.result.flowType
        }))
      });

      maxQFound = Math.max(maxQFound, totalDischarge);
    }

    // Also consider storm allowable Q values for Y-axis scaling
    const maxAllowable = Math.max(...stormData.map(d => d.allowableQCfs), 0);
    const maxActual = Math.max(...stormData.map(d => d.actualQCfs), 0);
    const overallMaxQ = Math.max(maxQFound, maxAllowable, maxActual) * 1.1;

    return { ratingCurve: curve, maxHead: maxH, maxQ: overallMaxQ };
  }, [structures, pondInvertElevation, pondTopElevation, stormData]);

  // Convert data to SVG coordinates
  const toSVG = (head: number, q: number) => {
    const x = padding.left + (head / maxHead) * plotWidth;
    const y = padding.top + plotHeight - (q / maxQ) * plotHeight;
    return { x, y };
  };

  // Convert SVG to data coordinates
  const fromSVG = (svgX: number, svgY: number) => {
    const head = ((svgX - padding.left) / plotWidth) * maxHead;
    const q = ((padding.top + plotHeight - svgY) / plotHeight) * maxQ;
    return { head, q };
  };

  // Generate path for rating curve
  const generatePath = (getData: (point: typeof ratingCurve[0]) => number): string => {
    if (ratingCurve.length === 0) return '';
    
    const points = ratingCurve.map(p => {
      const q = getData(p);
      if (q <= 0) return null;
      return toSVG(p.head, q);
    }).filter(Boolean) as { x: number; y: number }[];

    if (points.length === 0) return '';
    return `M ${points[0].x} ${points[0].y} ${points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ')}`;
  };

  // Handle mouse move
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    
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
    
    const { head } = fromSVG(x, y);
    const clampedHead = Math.max(0, Math.min(maxHead, head));
    
    // Find nearest rating curve point
    const nearestIdx = Math.round((clampedHead / maxHead) * (ratingCurve.length - 1));
    const point = ratingCurve[Math.max(0, Math.min(ratingCurve.length - 1, nearestIdx))];
    
    setTooltipData({
      head: point.head,
      totalQ: point.totalQ,
      perStructure: point.perStructure.map((ps, idx) => ({
        id: ps.id,
        q: ps.q,
        color: STRUCTURE_COLORS[idx % STRUCTURE_COLORS.length]
      }))
    });
  };

  const handleMouseLeave = () => {
    setMousePos(null);
    setTooltipData(null);
  };

  // Toggle structure visibility
  const toggleStructure = (id: string) => {
    setVisibleStructures(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Generate grid lines
  const headTicks = useMemo(() => {
    const ticks: number[] = [];
    const step = maxHead > 10 ? 2 : maxHead > 5 ? 1 : 0.5;
    for (let h = 0; h <= maxHead; h += step) {
      ticks.push(h);
    }
    return ticks;
  }, [maxHead]);

  const qTicks = useMemo(() => {
    const ticks: number[] = [];
    const step = maxQ > 100 ? 20 : maxQ > 50 ? 10 : maxQ > 20 ? 5 : maxQ > 10 ? 2 : 1;
    for (let q = 0; q <= maxQ; q += step) {
      ticks.push(q);
    }
    return ticks;
  }, [maxQ]);

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden shadow-xl">
      <div className="px-6 py-4 border-b border-border bg-slate-900/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            <h3 className="font-semibold text-lg">Rating Curve: Q vs Head</h3>
          </div>
          <div className="flex items-center gap-4">
            {/* Toggle buttons */}
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={showTotal}
                onChange={(e) => setShowTotal(e.target.checked)}
                className="rounded border-gray-600"
              />
              <span className="text-gray-300">Total Q</span>
            </label>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={showAllowableLines}
                onChange={(e) => setShowAllowableLines(e.target.checked)}
                className="rounded border-gray-600"
              />
              <span className="text-gray-300">Allowable Q Lines</span>
            </label>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          Plate rating curve showing discharge capacity at each head. Storm markers show design points.
        </p>
      </div>

      <div className="p-6 flex gap-4">
        {/* Main Chart */}
        <div className="flex-1 overflow-x-auto relative">
          <svg 
            ref={svgRef}
            width={chartWidth} 
            height={chartHeight} 
            className="bg-slate-900/30 rounded cursor-crosshair"
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
          >
            {/* Grid lines */}
            {headTicks.map(head => {
              const { x } = toSVG(head, 0);
              return (
                <g key={`grid-x-${head}`}>
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
                    {head.toFixed(1)}
                  </text>
                </g>
              );
            })}
            {qTicks.map((q) => {
              const { y } = toSVG(0, q);
              return (
                <g key={`grid-y-${q}`}>
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
                    className="text-xs fill-gray-400"
                  >
                    {q.toFixed(0)}
                  </text>
                </g>
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
              stroke="#6b7280"
              strokeWidth={2}
            />

            {/* Axis Labels */}
            <text
              x={padding.left + plotWidth / 2}
              y={chartHeight - 12}
              textAnchor="middle"
              className="text-sm fill-gray-300 font-medium"
            >
              Head above Invert (ft)
            </text>
            <text
              x={20}
              y={padding.top + plotHeight / 2}
              textAnchor="middle"
              className="text-sm fill-gray-300 font-medium"
              transform={`rotate(-90, 20, ${padding.top + plotHeight / 2})`}
            >
              Discharge Q (cfs)
            </text>

            {/* Per-structure rating curves */}
            {structures.map((struct, idx) => {
              if (!visibleStructures.has(struct.id)) return null;
              const color = STRUCTURE_COLORS[idx % STRUCTURE_COLORS.length];
              
              return (
                <path
                  key={`struct-${struct.id}`}
                  d={generatePath(p => {
                    const ps = p.perStructure.find(s => s.id === struct.id);
                    return ps?.q ?? 0;
                  })}
                  fill="none"
                  stroke={color}
                  strokeWidth={1.5}
                  strokeDasharray="4,2"
                  opacity={0.7}
                />
              );
            })}

            {/* Total rating curve */}
            {showTotal && (
              <path
                d={generatePath(p => p.totalQ)}
                fill="none"
                stroke="#60a5fa"
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* Allowable Q horizontal lines */}
            {showAllowableLines && stormData.map(storm => {
              const { y } = toSVG(0, storm.allowableQCfs);
              const color = getEventColor(storm.stormEvent);
              
              return (
                <g key={`allowable-${storm.stormEvent}`}>
                  <line
                    x1={padding.left}
                    y1={y}
                    x2={padding.left + plotWidth}
                    y2={y}
                    stroke={color}
                    strokeWidth={1}
                    strokeDasharray="8,4"
                    opacity={0.5}
                  />
                  <text
                    x={padding.left + plotWidth + 5}
                    y={y + 4}
                    className="text-[10px] fill-current"
                    style={{ fill: color }}
                  >
                    Q<tspan className="text-[8px]" baselineShift="sub">allow</tspan> {storm.stormEvent}
                  </text>
                </g>
              );
            })}

            {/* Storm design points */}
            {stormData.map(storm => {
              const point = toSVG(storm.designHeadFt, storm.actualQCfs);
              const color = getEventColor(storm.stormEvent);
              const isPassing = storm.actualQCfs <= storm.allowableQCfs;
              const isSelected = selectedStorm === storm.stormEvent;
              
              return (
                <g 
                  key={`storm-${storm.stormEvent}`}
                  onClick={() => onStormClick?.(storm.stormEvent)}
                  className="cursor-pointer"
                >
                  {/* Vertical line at design head */}
                  <line
                    x1={point.x}
                    y1={padding.top}
                    x2={point.x}
                    y2={padding.top + plotHeight}
                    stroke={color}
                    strokeWidth={isSelected ? 2 : 1}
                    strokeDasharray={isSelected ? 'none' : '4,4'}
                    opacity={isSelected ? 0.8 : 0.4}
                  />
                  
                  {/* Design point marker */}
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r={isSelected ? 8 : 6}
                    fill={isPassing ? color : '#ef4444'}
                    stroke={isSelected ? 'white' : '#1e293b'}
                    strokeWidth={isSelected ? 2 : 1.5}
                  />
                  
                  {/* Label */}
                  <text
                    x={point.x}
                    y={point.y - 12}
                    textAnchor="middle"
                    className={`text-[10px] font-bold ${isSelected ? 'fill-white' : 'fill-current'}`}
                    style={{ fill: isSelected ? 'white' : color }}
                  >
                    {storm.stormEvent.toUpperCase()}
                  </text>
                </g>
              );
            })}

            {/* Interactive Crosshair */}
            {mousePos && tooltipData && (
              <g className="pointer-events-none">
                <line
                  x1={toSVG(tooltipData.head, 0).x}
                  y1={padding.top}
                  x2={toSVG(tooltipData.head, 0).x}
                  y2={padding.top + plotHeight}
                  stroke="#64748b"
                  strokeWidth={1}
                  strokeDasharray="4,4"
                  opacity={0.8}
                />
                <line
                  x1={padding.left}
                  y1={toSVG(0, tooltipData.totalQ).y}
                  x2={padding.left + plotWidth}
                  y2={toSVG(0, tooltipData.totalQ).y}
                  stroke="#60a5fa"
                  strokeWidth={1}
                  strokeDasharray="4,4"
                  opacity={0.5}
                />
                <circle
                  cx={toSVG(tooltipData.head, tooltipData.totalQ).x}
                  cy={toSVG(tooltipData.head, tooltipData.totalQ).y}
                  r={5}
                  fill="#60a5fa"
                  stroke="white"
                  strokeWidth={2}
                />
              </g>
            )}
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
                    H = {tooltipData.head.toFixed(2)} ft
                  </span>
                </div>
                
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-0.5 rounded bg-blue-400" />
                      <span className="text-xs font-medium text-gray-300">Total Q</span>
                    </div>
                    <span className="font-mono text-sm text-white">
                      {tooltipData.totalQ.toFixed(2)} <span className="text-gray-500 text-xs">cfs</span>
                    </span>
                  </div>
                  
                  {tooltipData.perStructure.filter(ps => ps.q > 0).map(ps => (
                    <div key={ps.id} className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2">
                        <span 
                          className="w-3 h-0.5 rounded"
                          style={{ backgroundColor: ps.color }}
                        />
                        <span className="text-xs text-gray-400">Orifice #{ps.id}</span>
                      </div>
                      <span className="font-mono text-xs text-gray-300">
                        {ps.q.toFixed(2)} cfs
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Legend / Structure Toggles */}
        <div className="w-40 space-y-3">
          <div className="text-xs text-gray-400 font-medium uppercase tracking-wide">
            Curve Visibility
          </div>
          
          {/* Total curve toggle */}
          <label className="flex items-center gap-2 p-2 rounded hover:bg-slate-800/50 cursor-pointer transition-colors">
            <div 
              className={`w-4 h-4 rounded flex items-center justify-center ${
                showTotal ? 'bg-blue-500' : 'bg-slate-700'
              }`}
            >
              {showTotal && <Eye className="w-3 h-3 text-white" />}
            </div>
            <span className="text-xs text-gray-300">Total Q(H)</span>
            <div className="ml-auto w-6 h-0.5 bg-blue-400 rounded" />
          </label>
          
          {/* Per-structure toggles */}
          {structures.length > 0 && (
            <>
              <div className="text-xs text-gray-500 uppercase tracking-wide mt-4">
                Per-Orifice Curves
              </div>
              {structures.map((struct, idx) => {
                const color = STRUCTURE_COLORS[idx % STRUCTURE_COLORS.length];
                const isVisible = visibleStructures.has(struct.id);
                const isCircular = struct.type === 'circular';
                
                return (
                  <label 
                    key={struct.id}
                    className="flex items-center gap-2 p-2 rounded hover:bg-slate-800/50 cursor-pointer transition-colors"
                  >
                    <button
                      onClick={() => toggleStructure(struct.id)}
                      className={`w-4 h-4 rounded flex items-center justify-center transition-colors ${
                        isVisible ? 'bg-slate-700' : 'bg-slate-800'
                      }`}
                      style={{ backgroundColor: isVisible ? color : undefined }}
                    >
                      {isVisible ? (
                        <Eye className="w-3 h-3 text-white" />
                      ) : (
                        <EyeOff className="w-3 h-3 text-gray-500" />
                      )}
                    </button>
                    <div className="flex items-center gap-1">
                      {isCircular ? (
                        <Circle className="w-3 h-3" style={{ color }} />
                      ) : (
                        <Square className="w-3 h-3" style={{ color }} />
                      )}
                      <span className="text-xs text-gray-300">#{struct.id}</span>
                    </div>
                    <div 
                      className="ml-auto w-6 h-0.5 rounded"
                      style={{ 
                        backgroundColor: color,
                        opacity: isVisible ? 1 : 0.3
                      }}
                    />
                  </label>
                );
              })}
            </>
          )}
          
          {/* Storm Legend */}
          <div className="text-xs text-gray-500 uppercase tracking-wide mt-4">
            Storm Points
          </div>
          <div className="space-y-1">
            {stormData.map(storm => {
              const color = getEventColor(storm.stormEvent);
              const isPassing = storm.actualQCfs <= storm.allowableQCfs;
              
              return (
                <div 
                  key={storm.stormEvent}
                  className={`flex items-center gap-2 p-1.5 rounded cursor-pointer transition-colors ${
                    selectedStorm === storm.stormEvent ? 'bg-slate-700' : 'hover:bg-slate-800/50'
                  }`}
                  onClick={() => onStormClick?.(storm.stormEvent)}
                >
                  <div 
                    className={`w-3 h-3 rounded-full border-2 ${
                      isPassing ? 'border-current' : 'border-red-500 bg-red-500'
                    }`}
                    style={{ borderColor: isPassing ? color : undefined }}
                  />
                  <span className="text-xs font-medium" style={{ color }}>
                    {storm.stormEvent.toUpperCase()}
                  </span>
                  <span className={`ml-auto text-[10px] ${isPassing ? 'text-emerald-400' : 'text-red-400'}`}>
                    {isPassing ? '✓' : '✗'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
