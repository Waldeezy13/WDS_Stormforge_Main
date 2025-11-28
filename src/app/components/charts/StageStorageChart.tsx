'use client';

import React from 'react';
import { StageStorageCurve, getStageStorageStats } from '@/utils/stageStorage';

interface StageStorageChartProps {
  curve: StageStorageCurve;
  waterLevels: { volume: number; elevation: number; color: string; label: string }[];
}

/**
 * StageStorageChart - SVG visualization of pond stage-storage curve
 * 
 * Displays:
 * - Stage-storage curve from imported CAD data
 * - Water surface elevation markers for each storm event
 * - Volume/elevation grid with tick labels
 */
export default function StageStorageChart({ curve, waterLevels }: StageStorageChartProps) {
  const chartWidth = 400;
  const chartHeight = 200;
  const padding = { top: 20, right: 60, bottom: 40, left: 60 };
  const plotWidth = chartWidth - padding.left - padding.right;
  const plotHeight = chartHeight - padding.top - padding.bottom;

  const stats = getStageStorageStats(curve);
  
  // Calculate scales
  const minVol = 0;
  const maxVol = Math.max(stats.maxVolume, ...waterLevels.map(w => w.volume)) * 1.1;
  const minElev = stats.minElevation - stats.totalDepth * 0.05;
  const maxElev = stats.maxElevation + stats.totalDepth * 0.1;

  const xScale = (vol: number) => padding.left + (vol - minVol) / (maxVol - minVol) * plotWidth;
  const yScale = (elev: number) => padding.top + plotHeight - (elev - minElev) / (maxElev - minElev) * plotHeight;

  // Build path for the stage-storage curve
  const pathPoints = curve.points.map(p => `${xScale(p.cumulativeVolume)},${yScale(p.elevation)}`).join(' L ');
  const curvePath = `M ${pathPoints}`;
  
  // Build filled area path
  const areaPath = `M ${xScale(0)},${yScale(curve.points[0]?.elevation ?? minElev)} L ${pathPoints} L ${xScale(curve.points[curve.points.length - 1]?.cumulativeVolume ?? 0)},${yScale(minElev)} Z`;

  // Generate tick values
  const volumeTicks = Array.from({ length: 5 }, (_, i) => minVol + (maxVol - minVol) * i / 4);
  const elevTicks = Array.from({ length: 5 }, (_, i) => minElev + (maxElev - minElev) * i / 4);

  return (
    <svg width="100%" viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="overflow-visible">
      {/* Grid lines */}
      {volumeTicks.map((vol, i) => (
        <line
          key={`vgrid-${i}`}
          x1={xScale(vol)}
          y1={padding.top}
          x2={xScale(vol)}
          y2={padding.top + plotHeight}
          stroke="#1e293b"
          strokeWidth="1"
        />
      ))}
      {elevTicks.map((elev, i) => (
        <line
          key={`egrid-${i}`}
          x1={padding.left}
          y1={yScale(elev)}
          x2={padding.left + plotWidth}
          y2={yScale(elev)}
          stroke="#1e293b"
          strokeWidth="1"
        />
      ))}

      {/* Filled area under curve */}
      <path
        d={areaPath}
        fill="url(#stageStorageGradient)"
        opacity="0.3"
      />
      
      {/* Gradient definition */}
      <defs>
        <linearGradient id="stageStorageGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0.2" />
        </linearGradient>
      </defs>

      {/* Stage-storage curve line */}
      <path
        d={curvePath}
        fill="none"
        stroke="#38bdf8"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Data points */}
      {curve.points.map((p, i) => (
        <circle
          key={i}
          cx={xScale(p.cumulativeVolume)}
          cy={yScale(p.elevation)}
          r="3"
          fill="#38bdf8"
          stroke="#020617"
          strokeWidth="1"
        />
      ))}

      {/* Water level indicators */}
      {waterLevels.map((wl, i) => {
        const x = xScale(wl.volume);
        const y = yScale(wl.elevation);
        const isInBounds = wl.volume <= maxVol && wl.elevation >= minElev && wl.elevation <= maxElev;
        
        if (!isInBounds) return null;
        
        return (
          <g key={i}>
            {/* Horizontal line to curve */}
            <line
              x1={padding.left}
              y1={y}
              x2={x}
              y2={y}
              stroke={wl.color}
              strokeWidth="1"
              strokeDasharray="3,3"
              opacity="0.6"
            />
            {/* Vertical line down */}
            <line
              x1={x}
              y1={y}
              x2={x}
              y2={padding.top + plotHeight}
              stroke={wl.color}
              strokeWidth="1"
              strokeDasharray="3,3"
              opacity="0.6"
            />
            {/* Marker circle */}
            <circle
              cx={x}
              cy={y}
              r="5"
              fill={wl.color}
              stroke="#020617"
              strokeWidth="2"
            />
            {/* Label */}
            <text
              x={x + 8}
              y={y + 3}
              fill={wl.color}
              fontSize="9"
              fontWeight="bold"
            >
              {wl.label}
            </text>
          </g>
        );
      })}

      {/* X-axis */}
      <line
        x1={padding.left}
        y1={padding.top + plotHeight}
        x2={padding.left + plotWidth}
        y2={padding.top + plotHeight}
        stroke="#475569"
        strokeWidth="1"
      />
      
      {/* Y-axis */}
      <line
        x1={padding.left}
        y1={padding.top}
        x2={padding.left}
        y2={padding.top + plotHeight}
        stroke="#475569"
        strokeWidth="1"
      />

      {/* X-axis ticks and labels */}
      {volumeTicks.map((vol, i) => (
        <g key={`xtick-${i}`}>
          <line
            x1={xScale(vol)}
            y1={padding.top + plotHeight}
            x2={xScale(vol)}
            y2={padding.top + plotHeight + 5}
            stroke="#475569"
            strokeWidth="1"
          />
          <text
            x={xScale(vol)}
            y={padding.top + plotHeight + 18}
            fill="#94a3b8"
            fontSize="9"
            textAnchor="middle"
          >
            {vol >= 1000 ? `${(vol / 1000).toFixed(0)}k` : vol.toFixed(0)}
          </text>
        </g>
      ))}

      {/* Y-axis ticks and labels */}
      {elevTicks.map((elev, i) => (
        <g key={`ytick-${i}`}>
          <line
            x1={padding.left - 5}
            y1={yScale(elev)}
            x2={padding.left}
            y2={yScale(elev)}
            stroke="#475569"
            strokeWidth="1"
          />
          <text
            x={padding.left - 10}
            y={yScale(elev) + 3}
            fill="#94a3b8"
            fontSize="9"
            textAnchor="end"
          >
            {elev.toFixed(1)}
          </text>
        </g>
      ))}

      {/* Axis labels */}
      <text
        x={padding.left + plotWidth / 2}
        y={chartHeight - 5}
        fill="#64748b"
        fontSize="10"
        textAnchor="middle"
      >
        Volume (cf)
      </text>
      <text
        x={12}
        y={padding.top + plotHeight / 2}
        fill="#64748b"
        fontSize="10"
        textAnchor="middle"
        transform={`rotate(-90, 12, ${padding.top + plotHeight / 2})`}
      >
        Elevation (ft)
      </text>
    </svg>
  );
}
