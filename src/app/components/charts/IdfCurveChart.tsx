'use client';

import React, { useState, useMemo, useRef } from 'react';
import { ReturnPeriod, InterpolationMethod, RainfallMethod, getIntensityFromData, getInterpolationMethodLabel, getRainfallMethodLabel, type ManualIdfCoefficientsByPeriod } from '@/utils/atlas14';
import { TrendingUp } from 'lucide-react';

// Color mapping for storm events
const getEventColor = (event: ReturnPeriod): string => {
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

interface IdfCurveChartProps {
  rainfallData: Array<{ durationMinutes: number; intensities: Record<ReturnPeriod, number> }>;
  selectedEvents: ReturnPeriod[];
  rainfallMethod: RainfallMethod;
  manualIdfCoefficients: ManualIdfCoefficientsByPeriod;
  interpolationMethod: InterpolationMethod;
}

/**
 * IdfCurveChart - Interactive IDF (Intensity-Duration-Frequency) curve visualization
 * 
 * Features:
 * - Log-log scale axes (standard for IDF relationships)
 * - Interactive crosshairs with tooltips
 * - Data point markers for source data
 * - Smooth curve interpolation between points
 */
export default function IdfCurveChart({ 
  rainfallData, 
  selectedEvents, 
  rainfallMethod,
  manualIdfCoefficients,
  interpolationMethod 
}: IdfCurveChartProps) {
  const chartWidth = 800;
  const chartHeight = 500;
  const padding = { top: 40, right: 120, bottom: 70, left: 90 };
  const plotWidth = chartWidth - padding.left - padding.right;
  const plotHeight = chartHeight - padding.top - padding.bottom;

  // Crosshair and tooltip state
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [tooltipData, setTooltipData] = useState<{
    duration: number;
    intensities: { event: ReturnPeriod; intensity: number; color: string }[];
    isDataPoint: boolean;
    nearestDuration?: number;
  } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Generate curves for each selected event using logarithmic sampling
  const curves = useMemo(() => {
    // Find the actual max duration from the data
    const dataMaxDuration = rainfallData.length > 0 
      ? Math.max(...rainfallData.map(r => r.durationMinutes))
      : 1440;
    
    // Generate logarithmically-spaced sample points for smooth curves on log scale
    // This keeps array size reasonable (~500 points) regardless of duration range
    const numPoints = 500;
    const logMin = Math.log10(1);
    const logMax = Math.log10(dataMaxDuration);
    const sampleDurations: number[] = [];
    for (let i = 0; i <= numPoints; i++) {
      const logVal = logMin + (logMax - logMin) * (i / numPoints);
      sampleDurations.push(Math.pow(10, logVal));
    }
    
    return selectedEvents.map(event => {
      // Build curve using the log-spaced sample points
      const curve = sampleDurations.map(duration => ({
        durationMinutes: duration,
        intensityInPerHr: getIntensityFromData(rainfallData, event, duration, rainfallMethod, interpolationMethod, manualIdfCoefficients)
      })).filter(p => p.intensityInPerHr > 0);
      
      return { event, curve, color: getEventColor(event) };
    });
  }, [rainfallData, selectedEvents, rainfallMethod, manualIdfCoefficients, interpolationMethod]);

  // Calculate axis ranges dynamically from the data
  const { minDuration, maxDuration } = useMemo(() => {
    if (rainfallData.length === 0) return { minDuration: 1, maxDuration: 1440 };
    const durations = rainfallData.map(r => r.durationMinutes);
    return {
      minDuration: Math.max(1, Math.min(...durations)),
      maxDuration: Math.max(...durations)
    };
  }, [rainfallData]);

  const { minIntensity, maxIntensity } = useMemo(() => {
    const allIntensities = curves.flatMap(c => c.curve.map(p => p.intensityInPerHr)).filter(i => i > 0);
    if (allIntensities.length === 0) return { minIntensity: 0.1, maxIntensity: 10 };
    const min = Math.min(...allIntensities);
    const max = Math.max(...allIntensities);
    return {
      minIntensity: Math.max(0.01, min * 0.9), // Add padding below
      maxIntensity: max * 1.1 // Add padding above
    };
  }, [curves]);

  // Convert point to SVG coordinates (log-log scale)
  const toSVG = (duration: number, intensity: number) => {
    // Log scale for duration (x-axis)
    const logDuration = Math.log10(Math.max(duration, minDuration));
    const logMinDuration = Math.log10(minDuration);
    const logMaxDuration = Math.log10(maxDuration);
    const x = padding.left + ((logDuration - logMinDuration) / (logMaxDuration - logMinDuration)) * plotWidth;
    
    // Log scale for intensity (y-axis)
    const logIntensity = Math.log10(Math.max(intensity, minIntensity));
    const logMinIntensity = Math.log10(minIntensity);
    const logMaxIntensity = Math.log10(maxIntensity);
    const y = padding.top + plotHeight - ((logIntensity - logMinIntensity) / (logMaxIntensity - logMinIntensity)) * plotHeight;
    
    return { x, y };
  };

  // Convert SVG coordinates back to data values (inverse of toSVG)
  const fromSVG = (svgX: number, svgY: number) => {
    const logMinDuration = Math.log10(minDuration);
    const logMaxDuration = Math.log10(maxDuration);
    const logMinIntensity = Math.log10(minIntensity);
    const logMaxIntensity = Math.log10(maxIntensity);
    
    const logDuration = logMinDuration + ((svgX - padding.left) / plotWidth) * (logMaxDuration - logMinDuration);
    const duration = Math.pow(10, logDuration);
    
    const logIntensity = logMaxIntensity - ((svgY - padding.top) / plotHeight) * (logMaxIntensity - logMinIntensity);
    const intensity = Math.pow(10, logIntensity);
    
    return { duration, intensity };
  };

  // Find the nearest data point duration to a given duration
  const findNearestDataPoint = (duration: number): number => {
    const durations = rainfallData.map(r => r.durationMinutes);
    let nearest = durations[0];
    let minDiff = Math.abs(Math.log10(duration) - Math.log10(nearest));
    
    for (const d of durations) {
      const diff = Math.abs(Math.log10(duration) - Math.log10(d));
      if (diff < minDiff) {
        minDiff = diff;
        nearest = d;
      }
    }
    return nearest;
  };

  // Get interpolated intensity for a given duration and event using proper IDF interpolation
  const getInterpolatedIntensity = (duration: number, event: ReturnPeriod): number => {
    return getIntensityFromData(rainfallData, event, duration, rainfallMethod, interpolationMethod, manualIdfCoefficients);
  };

  // Handle mouse move on chart
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    
    const rect = svgRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Check if mouse is within plot area
    if (x < padding.left || x > padding.left + plotWidth || 
        y < padding.top || y > padding.top + plotHeight) {
      setMousePos(null);
      setTooltipData(null);
      return;
    }
    
    setMousePos({ x, y });
    
    // Convert to data coordinates
    const { duration } = fromSVG(x, y);
    
    // Clamp duration to valid range
    const clampedDuration = Math.max(minDuration, Math.min(maxDuration, duration));
    
    // Find nearest data point
    const nearestDuration = findNearestDataPoint(clampedDuration);
    
    // Calculate log-space distance to nearest point to determine if we should snap
    const logDistance = Math.abs(Math.log10(clampedDuration) - Math.log10(nearestDuration));
    const snapThreshold = 0.08; // Snap if within ~20% in log space
    
    const isNearDataPoint = logDistance < snapThreshold;
    const displayDuration = isNearDataPoint ? nearestDuration : clampedDuration;
    
    // Get intensities for all selected events
    const intensities = selectedEvents.map(event => {
      let intensity: number;
      if (isNearDataPoint) {
        // Use actual data point
        const dataRow = rainfallData.find(r => r.durationMinutes === nearestDuration);
        intensity = dataRow?.intensities[event] ?? 0;
      } else {
        // Use interpolated value
        intensity = getInterpolatedIntensity(displayDuration, event);
      }
      return {
        event,
        intensity,
        color: getEventColor(event)
      };
    }).filter(i => i.intensity > 0);
    
    setTooltipData({
      duration: displayDuration,
      intensities,
      isDataPoint: isNearDataPoint,
      nearestDuration: isNearDataPoint ? undefined : nearestDuration
    });
  };

  const handleMouseLeave = () => {
    setMousePos(null);
    setTooltipData(null);
  };

  // Format duration for display
  const formatDuration = (d: number): string => {
    if (d < 60) return `${d.toFixed(d % 1 === 0 ? 0 : 1)} min`;
    if (d < 1440) return `${(d / 60).toFixed(d % 60 === 0 ? 0 : 1)} hr`;
    return `${(d / 1440).toFixed(1)} day`;
  };

  // Generate path for a curve
  const generatePath = (curve: Array<{ durationMinutes: number; intensityInPerHr: number }>) => {
    if (curve.length === 0) return '';
    const points = curve.map(p => toSVG(p.durationMinutes, p.intensityInPerHr));
    return `M ${points[0].x} ${points[0].y} ${points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ')}`;
  };

  // Generate grid lines and labels (log scale for both axes)
  // Include longer durations if data extends beyond 24 hours
  const durationTicks = useMemo(() => {
    const baseTicks = [1, 5, 10, 15, 30, 60, 120, 180, 360, 720, 1440];
    // Add multi-day ticks if needed (2-day, 3-day, 4-day, 7-day, 10-day, 30-day, 60-day)
    const extendedTicks = [...baseTicks, 2880, 4320, 5760, 10080, 14400, 43200, 86400];
    return extendedTicks.filter(d => d >= minDuration && d <= maxDuration);
  }, [minDuration, maxDuration]);

  // Format tick label for duration axis
  const formatTickLabel = (duration: number): string => {
    if (duration < 60) return `${duration}m`;
    if (duration < 1440) return `${duration / 60}h`;
    return `${duration / 1440}d`;
  };
  
  // Generate logarithmic intensity ticks
  const intensityTicks = useMemo(() => {
    const logMin = Math.log10(minIntensity);
    const logMax = Math.log10(maxIntensity);
    const logRange = logMax - logMin;
    const numTicks = 6;
    const ticks: number[] = [];
    
    // Generate ticks at nice logarithmic intervals
    for (let i = 0; i <= numTicks; i++) {
      const logValue = logMin + (logRange / numTicks) * i;
      ticks.push(Math.pow(10, logValue));
    }
    
    return ticks;
  }, [minIntensity, maxIntensity]);

  return (
    <div className="mb-8 bg-card border border-border rounded-lg overflow-hidden shadow-xl">
      <div className="px-6 py-4 border-b border-border bg-slate-900/50">
        <div className="flex items-center gap-2 mb-2">
          <TrendingUp className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-lg">IDF Curves</h3>
          <span className={`text-xs font-normal ml-2 py-0.5 px-2 rounded-full ${
            rainfallMethod === 'manual-idf'
              ? 'bg-amber-900/50 text-amber-300'
              : interpolationMethod === 'log-log' 
              ? 'bg-emerald-900/50 text-emerald-400' 
              : 'bg-amber-900/50 text-amber-400'
          }`}>
            {rainfallMethod === 'manual-idf'
              ? getRainfallMethodLabel(rainfallMethod)
              : `${getRainfallMethodLabel(rainfallMethod)} - ${getInterpolationMethodLabel(interpolationMethod)}`}
          </span>
        </div>
        <p className="text-xs text-gray-500">
          {rainfallMethod === 'manual-idf'
            ? 'Curves are computed directly from the municipal B/D/E equation. Points are shown only for supported storms.'
            : interpolationMethod === 'log-log' 
              ? 'Curves appear as straight lines between data points (standard for IDF relationships).'
              : 'Curves appear curved between data points on the log-log scale graph.'}
          {' '}Data points (●) are from imported rainfall data.
        </p>
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
          {durationTicks.map(duration => {
            const { x } = toSVG(duration, 0);
            return (
              <g key={`grid-x-${duration}`}>
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
                  {formatTickLabel(duration)}
                </text>
              </g>
            );
          })}
          {intensityTicks.map((intensity, i) => {
            const { y } = toSVG(1, intensity);
            return (
              <g key={`grid-y-${i}`}>
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
                  {intensity < 1 ? intensity.toFixed(2) : intensity < 10 ? intensity.toFixed(1) : Math.round(intensity)}
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

          {/* X-axis label (Duration) */}
          <text
            x={padding.left + plotWidth / 2}
            y={chartHeight - 12}
            textAnchor="middle"
            className="text-sm fill-gray-300 font-medium"
          >
            Duration (log scale)
          </text>

          {/* Y-axis label (Intensity) */}
          <text
            x={20}
            y={padding.top + plotHeight / 2}
            textAnchor="middle"
            className="text-sm fill-gray-300 font-medium"
            transform={`rotate(-90, 20, ${padding.top + plotHeight / 2})`}
          >
            Intensity, in/hr (log scale)
          </text>

          {/* Plot curves */}
          {curves.map(({ event, curve, color }) => (
            <g key={event}>
              <path
                d={generatePath(curve)}
                fill="none"
                stroke={color}
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
          ))}

          {/* Plot data points from table */}
          {rainfallData.map((row) => {
            return selectedEvents.map(event => {
              const intensity = row.intensities[event];
              if (!intensity || intensity === 0) return null;
              const { x, y } = toSVG(row.durationMinutes, intensity);
              return (
                <circle
                  key={`point-${event}-${row.durationMinutes}`}
                  cx={x}
                  cy={y}
                  r={4}
                  fill={getEventColor(event)}
                  stroke="#1e293b"
                  strokeWidth={1.5}
                />
              );
            });
          })}

          {/* Legend - positioned in right margin */}
          <g transform={`translate(${padding.left + plotWidth + 15}, ${padding.top + 10})`}>
            <text x={0} y={-2} className="text-[10px] fill-gray-500 font-medium uppercase">
              Return Period
            </text>
            {curves.map(({ event, color }, idx) => (
              <g key={event} transform={`translate(0, ${idx * 22 + 15})`}>
                <line x1={0} y1={0} x2={18} y2={0} stroke={color} strokeWidth={2.5} />
                <circle cx={9} cy={0} r={3} fill={color} stroke="#1e293b" strokeWidth={1} />
                <text x={24} y={4} className="text-xs fill-gray-300 font-medium">
                  {event.toUpperCase()}
                </text>
              </g>
            ))}
          </g>

          {/* Interactive Crosshair */}
          {mousePos && tooltipData && (
            <g className="pointer-events-none">
              {/* Vertical crosshair line */}
              <line
                x1={toSVG(tooltipData.duration, minIntensity).x}
                y1={padding.top}
                x2={toSVG(tooltipData.duration, minIntensity).x}
                y2={padding.top + plotHeight}
                stroke={tooltipData.isDataPoint ? '#38bdf8' : '#64748b'}
                strokeWidth={1}
                strokeDasharray={tooltipData.isDataPoint ? 'none' : '4,4'}
                opacity={0.8}
              />
              
              {/* Horizontal crosshair lines for each intensity */}
              {tooltipData.intensities.map(({ event, intensity, color }) => {
                const pos = toSVG(tooltipData.duration, intensity);
                return (
                  <g key={`crosshair-${event}`}>
                    <line
                      x1={padding.left}
                      y1={pos.y}
                      x2={padding.left + plotWidth}
                      y2={pos.y}
                      stroke={color}
                      strokeWidth={1}
                      strokeDasharray="4,4"
                      opacity={0.5}
                    />
                    {/* Highlight circle at intersection */}
                    <circle
                      cx={pos.x}
                      cy={pos.y}
                      r={tooltipData.isDataPoint ? 7 : 5}
                      fill={tooltipData.isDataPoint ? color : 'transparent'}
                      stroke={color}
                      strokeWidth={2}
                      opacity={tooltipData.isDataPoint ? 1 : 0.8}
                    />
                  </g>
                );
              })}
            </g>
          )}
        </svg>

        {/* Tooltip (positioned outside SVG for better styling) */}
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
              {/* Duration header */}
              <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-600">
                <span className={`inline-block w-2 h-2 rounded-full ${tooltipData.isDataPoint ? 'bg-sky-400' : 'bg-slate-500'}`} />
                <span className="font-semibold text-sm text-white">
                  {formatDuration(tooltipData.duration)}
                </span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                  tooltipData.isDataPoint 
                    ? 'bg-sky-500/20 text-sky-400' 
                    : 'bg-slate-600/50 text-slate-400'
                }`}>
                  {tooltipData.isDataPoint ? 'Source Data' : rainfallMethod === 'manual-idf' ? 'Computed' : 'Interpolated'}
                </span>
              </div>
              
              {/* Intensity values */}
              <div className="space-y-1.5">
                {tooltipData.intensities.map(({ event, intensity, color }) => (
                  <div key={event} className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <span 
                        className="w-3 h-0.5 rounded"
                        style={{ backgroundColor: color }}
                      />
                      <span className="text-xs font-medium text-gray-300">
                        {event.toUpperCase()}
                      </span>
                    </div>
                    <span className="font-mono text-sm text-white">
                      {intensity.toFixed(2)} <span className="text-gray-500 text-xs">in/hr</span>
                    </span>
                  </div>
                ))}
              </div>
              
              {/* Nearest data point hint when interpolated */}
              {!tooltipData.isDataPoint && tooltipData.nearestDuration && (
                <div className="mt-2 pt-2 border-t border-slate-700 text-[10px] text-slate-500">
                  Nearest data point: {formatDuration(tooltipData.nearestDuration)}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
