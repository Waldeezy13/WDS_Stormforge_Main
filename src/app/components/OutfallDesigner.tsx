'use client';

import React, { useState, useMemo } from 'react';
import { Trash2, Plus, CheckCircle, XCircle, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { OutfallStructure, OutfallStructureType, calculateTotalDischarge, detectOverlaps, OverlapRegion } from '@/utils/hydraulics';
import { ModifiedRationalResult } from '@/utils/rationalMethod';

// --- Outfall Profile Visualization Component ---
function OutfallProfile({ 
  structures, 
  pondInvert, 
  wseList,
  overlaps
}: { 
  structures: OutfallStructure[], 
  pondInvert: number, 
  wseList: { label: string; elevation: number; color: string; isPassing: boolean }[],
  overlaps: OverlapRegion[]
}) {
  // Dimensions
  const width = 200;
  const height = 500;
  const padding = { top: 40, bottom: 40, left: 40, right: 20 };

  // Calculate Elevation Range
  // Min: Pond Invert
  // Max: Max WSE + 1ft buffer, or Top of highest structure + 1ft
  const maxWSE = Math.max(...wseList.map(w => w.elevation), pondInvert + 5);
  const maxStructEl = Math.max(...structures.map(s => s.invertElevation + (s.type === 'circular' ? (s.diameterFt || 0) : (s.heightFt || 0))), pondInvert);
  
  const minEl = pondInvert;
  const maxEl = Math.max(maxWSE, maxStructEl) + 1;
  const elRange = maxEl - minEl || 10; // Prevent div by zero

  // Scale Helper
  const getY = (el: number) => {
    const relativeY = (el - minEl) / elRange;
    return height - padding.bottom - (relativeY * (height - padding.top - padding.bottom));
  };

  // Ticks
  const tickCount = 10;
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) => minEl + (elRange * i / tickCount));

  // Calculate horizontal extent needed (considering both left and right from center)
  // Find the leftmost and rightmost extents
  let minX = 0;
  let maxX = 0;
  
  structures.forEach(s => {
    const offset = s.horizontalOffsetFt || 0; // 0 = center, negative = left, positive = right
    let leftEdge: number;
    let rightEdge: number;
    
    if (s.type === 'circular') {
      const dia = s.diameterFt || 0;
      leftEdge = offset - dia/2;
      rightEdge = offset + dia/2;
    } else {
      const w = s.widthFt || 0;
      leftEdge = offset - w/2; // Center the rectangle on offset
      rightEdge = offset + w/2;
    }
    
    minX = Math.min(minX, leftEdge);
    maxX = Math.max(maxX, rightEdge);
  });
  
  // Use a fixed plate width in pixels
  const plateWidthPixels = width - padding.left - padding.right - 20; // Leave some margin
  const plateX = padding.left + 10; // Small margin from left
  const plateCenterX = plateX + plateWidthPixels / 2; // Center of plate in pixels
  
  // Calculate Y-scale (feet per pixel) - this is our base scale for keeping circles round
  const yScaleFtPerPixel = elRange / (height - padding.top - padding.bottom);
  
  // Calculate what horizontal extent would fit using the same scale as Y (to keep circles round)
  // We need to fit from minX to maxX, so total width needed is maxX - minX
  const totalWidthNeededFt = Math.max(maxX - minX, 1); // At least 1ft
  const defaultPlateWidthFt = plateWidthPixels * yScaleFtPerPixel;
  
  // Determine if we need to scale X independently
  // If structures fit within default width, use Y-scale for X (circles stay round)
  // Otherwise, scale X to fit all structures (circles will become ellipses)
  const needsXScale = totalWidthNeededFt > defaultPlateWidthFt;
  const plateWidthFt = needsXScale ? totalWidthNeededFt + 2 : defaultPlateWidthFt; // Add 2ft buffer (1ft each side)
  
  // X-scale (feet per pixel) - matches Y-scale if possible, otherwise scaled to fit
  const xScaleFtPerPixel = needsXScale ? plateWidthFt / plateWidthPixels : yScaleFtPerPixel;
  
  // Scale helper for X-axis (feet to pixels) - 0 is at center
  const getX = (xFt: number) => {
    // xFt is offset from center (0 = center, negative = left, positive = right)
    return plateCenterX + (xFt / xScaleFtPerPixel);
  };
  
  // Helper to get width in pixels for a given width in feet
  const getWidthPixels = (widthFt: number) => {
    return widthFt / xScaleFtPerPixel;
  };

  return (
    <div className="h-full bg-card border-l border-border flex flex-col shadow-xl relative">
        <div className="p-4 border-b border-border bg-muted/10">
            <h3 className="text-sm font-semibold">Outfall Profile</h3>
        </div>
        <div className="flex-1 relative overflow-hidden">
            <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet">
                {/* Grid / Ticks */}
                {ticks.map(tick => (
                    <g key={tick}>
                        <line 
                            x1={padding.left} y1={getY(tick)} 
                            x2={width - padding.right} y2={getY(tick)} 
                            stroke="#e2e8f0" strokeWidth="1" strokeDasharray="4 4" 
                            className="dark:stroke-slate-700"
                        />
                        <text 
                            x={padding.left - 5} y={getY(tick)} 
                            fontSize="10" fill="#94a3b8" 
                            textAnchor="end" alignmentBaseline="middle"
                        >
                            {tick.toFixed(1)}'
                        </text>
                    </g>
                ))}

                {/* Pond Bottom */}
                <line 
                    x1={padding.left} y1={getY(minEl)} 
                    x2={width - padding.right} y2={getY(minEl)} 
                    stroke="#64748b" strokeWidth="2" 
                />

                {/* Center Line Indicator (0 position) */}
                <line 
                    x1={plateCenterX} y1={padding.top} 
                    x2={plateCenterX} y2={height - padding.bottom} 
                    stroke="#94a3b8" strokeWidth="1" strokeDasharray="2 2" 
                    opacity="0.5"
                />
                <text 
                    x={plateCenterX} y={padding.top - 5} 
                    fontSize="9" fill="#64748b" 
                    textAnchor="middle"
                    className="font-medium"
                >
                    0 (center)
                </text>

                {/* The Plate */}
                <rect 
                    x={plateX} y={padding.top} 
                    width={plateWidthPixels} height={height - padding.top - padding.bottom} 
                    fill="#cbd5e1" className="dark:fill-slate-700"
                />

                {/* Structures */}
                {structures.map(s => {
                    const offset = s.horizontalOffsetFt || 0;
                    
                    if (s.type === 'circular') {
                        const dia = s.diameterFt || 0;
                        // Offset is already relative to center (0 = center)
                        const centerX = getX(offset);
                        const centerY = getY(s.invertElevation + dia/2);
                        
                        // Use Y-scale for vertical diameter (height)
                        const pixelHeight = Math.abs(getY(s.invertElevation + dia) - getY(s.invertElevation));
                        const radiusY = pixelHeight / 2;
                        
                        // Use X-scale for horizontal diameter (width)
                        // If scales match, circles stay round; if not, they become ellipses
                        const pixelWidth = dia / xScaleFtPerPixel;
                        const radiusX = pixelWidth / 2;
                        
                        // Avoid NaN by checking if values are valid
                        if (isNaN(radiusX) || isNaN(radiusY) || radiusX <= 0 || radiusY <= 0 || isNaN(centerX) || isNaN(centerY)) return null;

                        // Use circle if scales match (within small tolerance), otherwise ellipse
                        if (Math.abs(radiusX - radiusY) < 0.5) {
                            return (
                                <circle 
                                    key={s.id}
                                    cx={centerX}
                                    cy={centerY}
                                    r={radiusY}
                                    fill="#1e293b" stroke="white" strokeWidth="1"
                                    className="dark:fill-black"
                                />
                            );
                        } else {
                            return (
                                <ellipse 
                                    key={s.id}
                                    cx={centerX}
                                    cy={centerY}
                                    rx={radiusX}
                                    ry={radiusY}
                                    fill="#1e293b" stroke="white" strokeWidth="1"
                                    className="dark:fill-black"
                                />
                            );
                        }
                    } else {
                        const h = s.heightFt || 0;
                        const w = s.widthFt || 0;
                        // Scale height accurately using Y-scale
                        const pixelHeight = Math.abs(getY(s.invertElevation + h) - getY(s.invertElevation));
                        // Scale width using X-scale
                        const pixelWidth = getWidthPixels(w);

                        // Offset is relative to center, so center the rectangle on the offset
                        const rectX = getX(offset) - pixelWidth / 2;
                        const rectY = getY(s.invertElevation + h);

                        // Check for NaNs
                        if (isNaN(pixelHeight) || isNaN(pixelWidth) || isNaN(rectX) || isNaN(rectY) || pixelHeight <= 0 || pixelWidth <= 0) return null;

                        return (
                            <rect 
                                key={s.id}
                                x={rectX}
                                y={rectY}
                                width={pixelWidth}
                                height={pixelHeight}
                                fill="#1e293b" stroke="white" strokeWidth="1"
                                className="dark:fill-black"
                            />
                        );
                    }
                })}

                {/* Overlap Regions - Draw RED zones ON TOP of structures */}
                {overlaps.map((overlap, idx) => {
                    // Overlap coordinates are absolute, need to convert to center-relative
                    // Find center of overlap region
                    const overlapCenterX = (overlap.x1 + overlap.x2) / 2;
                    const overlapWidthFt = overlap.x2 - overlap.x1;
                    
                    const overlapX1 = getX(overlapCenterX) - getWidthPixels(overlapWidthFt) / 2;
                    const overlapX2 = getX(overlapCenterX) + getWidthPixels(overlapWidthFt) / 2;
                    const overlapY1 = getY(overlap.y2); // Top of overlap (lower Y in SVG)
                    const overlapY2 = getY(overlap.y1); // Bottom of overlap (higher Y in SVG)
                    
                    const overlapWidth = overlapX2 - overlapX1;
                    const overlapHeight = overlapY2 - overlapY1;
                    
                    if (isNaN(overlapX1) || isNaN(overlapX2) || isNaN(overlapY1) || isNaN(overlapY2) || overlapWidth <= 0 || overlapHeight <= 0) return null;
                    
                    return (
                        <g key={`overlap-${idx}`}>
                            {/* Red fill */}
                            <rect
                                x={overlapX1}
                                y={overlapY1}
                                width={overlapWidth}
                                height={overlapHeight}
                                fill="#ef4444"
                                fillOpacity="0.5"
                            />
                            {/* Red border */}
                            <rect
                                x={overlapX1}
                                y={overlapY1}
                                width={overlapWidth}
                                height={overlapHeight}
                                fill="none"
                                stroke="#dc2626"
                                strokeWidth="2"
                                strokeDasharray="4 2"
                            />
                        </g>
                    );
                })}

                {/* Water Levels */}
                {wseList.map((wse, i) => (
                    <g key={wse.label}>
                        <line 
                            x1={padding.left} y1={getY(wse.elevation)} 
                            x2={width - padding.right} y2={getY(wse.elevation)} 
                            stroke={wse.color} strokeWidth="2" strokeDasharray={wse.isPassing ? "" : "5 2"}
                            opacity="0.8"
                        />
                        <text 
                            x={width - padding.right} y={getY(wse.elevation) - 4} 
                            fontSize="10" fill={wse.color} fontWeight="bold"
                            textAnchor="end"
                        >
                            {wse.label}
                        </text>
                    </g>
                ))}

            </svg>
        </div>
    </div>
  );
}


interface OutfallDesignerProps {
  results: ModifiedRationalResult[];
  pondAreaSqFt: number; // Surface area to convert Volume to Depth (assuming vertical walls)
  pondInvertElevation?: number;
}

export default function OutfallDesigner({ results, pondAreaSqFt, pondInvertElevation = 0 }: OutfallDesignerProps) {
  // --- State ---
  const [structures, setStructures] = useState<OutfallStructure[]>([
    { id: '1', type: 'circular', invertElevation: pondInvertElevation + 0.5, horizontalOffsetFt: 0, diameterFt: 1, dischargeCoefficient: 0.6 }
  ]); // horizontalOffsetFt: 0 = center, negative = left, positive = right
  const [selectedDetailEvent, setSelectedDetailEvent] = useState<string | null>(null);
  const [expandedDerivations, setExpandedDerivations] = useState<Set<string>>(new Set());
  
  // Detect overlaps
  const overlaps = useMemo(() => detectOverlaps(structures), [structures]);
  
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

  // --- Helper: Calculate WSE from Volume ---
  const getWSE = (volumeCf: number) => {
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
    const { totalDischarge, details } = calculateTotalDischarge(structures, wse);
    const isPassing = totalDischarge <= res.allowableReleaseRateCfs;
    return { res, wse, totalDischarge, details, isPassing };
  });

  // Determine which event to show detailed breakdown for (default to first if none selected)
  const detailView = selectedDetailEvent 
    ? summaryData.find(d => d.res.stormEvent === selectedDetailEvent)
    : summaryData[0];
  
  // Prepare WSE List for Visualization
  const wseVisList = summaryData.map(d => ({
    label: d.res.stormEvent.toUpperCase(),
    elevation: d.wse,
    color: d.res.stormEvent === '100yr' ? '#ef4444' : d.res.stormEvent === '25yr' ? '#facc15' : '#4ade80',
    isPassing: d.isPassing
  }));

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
                    Stages {overlap.structures.join(' & ')} overlap horizontally at {overlap.x1.toFixed(2)}' - {overlap.x2.toFixed(2)}' (elevation {overlap.y1.toFixed(2)}' - {overlap.y2.toFixed(2)}')
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
        
        {/* 1. Top Summary Row - Design Storms */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {summaryData.map((data) => (
            <button
                key={data.res.stormEvent}
                onClick={() => setSelectedDetailEvent(data.res.stormEvent)}
                className={`relative p-4 rounded-lg border transition-all text-left group ${
                selectedDetailEvent === data.res.stormEvent 
                    ? 'ring-2 ring-primary shadow-md' 
                    : 'hover:shadow-sm opacity-90 hover:opacity-100'
                } ${
                data.isPassing 
                    ? 'bg-emerald-500/10 border-emerald-500/20 hover:bg-emerald-500/20' 
                    : 'bg-red-500/10 border-red-500/20 hover:bg-red-500/20'
                }`}
            >
                <div className="flex items-center justify-between mb-3">
                <span className={`text-xs font-bold px-2 py-1 rounded uppercase ${
                    data.isPassing ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-red-500/20 text-red-600 dark:text-red-400'
                }`}>
                    {data.res.stormEvent}
                </span>
                {data.isPassing ? (
                    <CheckCircle className="w-5 h-5 text-emerald-500" />
                ) : (
                    <XCircle className="w-5 h-5 text-red-500" />
                )}
                </div>
                
                <div className="space-y-2">
                <div className="flex justify-between items-baseline">
                    <span className="text-xs text-muted-foreground">Target</span>
                    <span className="text-sm font-medium">{data.res.allowableReleaseRateCfs.toFixed(2)} cfs</span>
                </div>
                <div className="flex justify-between items-baseline">
                    <span className="text-xs text-muted-foreground">Actual</span>
                    <span className={`text-lg font-bold font-mono ${data.isPassing ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                    {data.totalDischarge.toFixed(2)} cfs
                    </span>
                </div>
                <div className="pt-2 mt-2 border-t border-border/30 flex justify-between text-xs text-muted-foreground">
                    <span>WSE: {data.wse.toFixed(2)} ft</span>
                    <span className="text-[10px] opacity-70">Click for details</span>
                </div>
                </div>
            </button>
            ))}
        </section>

        <div className="grid lg:grid-cols-4 gap-6 items-start">
            
            {/* 2. Structure Editor (Left Column) */}
            <section className="lg:col-span-3 bg-card border border-border rounded-lg shadow-sm p-4">
            <div className="flex items-center justify-between mb-4">
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

            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                <thead className="bg-muted text-muted-foreground">
                    <tr>
                    <th className="p-2 rounded-tl-md">Invert El. (ft)</th>
                    <th className="p-2">Horiz. Offset (ft)<br/><span className="text-[10px] text-gray-400">0=center, -left, +right</span></th>
                    <th className="p-2">Type</th>
                    <th className="p-2">Dimensions (ft)</th>
                    <th className="p-2">Coeff (C)</th>
                    <th className="p-2 rounded-tr-md w-10"></th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-border">
                    {structures.map((s) => (
                    <tr key={s.id} className={`group hover:bg-muted/50 ${overlaps.some(o => o.structures.includes(s.id)) ? 'bg-red-500/5' : ''}`}>
                        <td className="p-2">
                        <input 
                            type="number" step="0.1"
                            value={s.invertElevation}
                            onChange={e => updateStructure(s.id, 'invertElevation', parseFloat(e.target.value) || 0)}
                            className="w-20 bg-background border border-input rounded px-2 py-1 focus:ring-1 focus:ring-primary outline-none"
                        />
                        </td>
                        <td className="p-2">
                        <input 
                            type="number" step="0.1"
                            value={s.horizontalOffsetFt || 0}
                            onChange={e => updateStructure(s.id, 'horizontalOffsetFt', parseFloat(e.target.value) || 0)}
                            className="w-20 bg-background border border-input rounded px-2 py-1 focus:ring-1 focus:ring-primary outline-none"
                        />
                        </td>
                        <td className="p-2">
                        <select 
                            value={s.type}
                            onChange={e => updateStructure(s.id, 'type', e.target.value as OutfallStructureType)}
                            className="bg-background border border-input rounded px-2 py-1 focus:ring-1 focus:ring-primary outline-none"
                        >
                            <option value="circular">Circular (Orifice)</option>
                            <option value="rectangular">Rectangular (Weir/Orifice)</option>
                        </select>
                        </td>
                        <td className="p-2">
                        <div className="flex gap-2">
                            {s.type === 'circular' ? (
                            <div className="flex items-center gap-1">
                                <span className="text-xs text-gray-400">Dia:</span>
                                <input 
                                type="number" step="0.1"
                                value={s.diameterFt || 0}
                                onChange={e => updateStructure(s.id, 'diameterFt', parseFloat(e.target.value) || 0)}
                                className="w-16 bg-background border border-input rounded px-2 py-1 focus:ring-1 focus:ring-primary outline-none"
                            />
                            </div>
                            ) : (
                            <>
                                <div className="flex items-center gap-1">
                                <span className="text-xs text-gray-400">W:</span>
                                <input 
                                    type="number" step="0.1"
                                    value={s.widthFt || 0}
                                    onChange={e => updateStructure(s.id, 'widthFt', parseFloat(e.target.value) || 0)}
                                    className="w-14 bg-background border border-input rounded px-2 py-1 focus:ring-1 focus:ring-primary outline-none"
                                />
                                </div>
                                <div className="flex items-center gap-1">
                                <span className="text-xs text-gray-400">H:</span>
                                <input 
                                    type="number" step="0.1"
                                    value={s.heightFt || 0}
                                    onChange={e => updateStructure(s.id, 'heightFt', parseFloat(e.target.value) || 0)}
                                    className="w-14 bg-background border border-input rounded px-2 py-1 focus:ring-1 focus:ring-primary outline-none"
                                />
                                </div>
                            </>
                            )}
                        </div>
                        </td>
                        <td className="p-2">
                        <input 
                            type="number" step="0.01"
                            value={s.dischargeCoefficient}
                            onChange={e => updateStructure(s.id, 'dischargeCoefficient', parseFloat(e.target.value) || 0)}
                            className="w-16 bg-background border border-input rounded px-2 py-1 focus:ring-1 focus:ring-primary outline-none"
                        />
                        </td>
                        <td className="p-2 text-right">
                        <button 
                            onClick={() => removeStructure(s.id)}
                            className="text-muted-foreground hover:text-destructive transition-colors p-1"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                        </td>
                    </tr>
                    ))}
                </tbody>
                </table>
                {structures.length === 0 && (
                <div className="p-8 text-center text-muted-foreground text-sm">
                    No structures defined. Add a stage to begin.
                </div>
                )}
            </div>
            </section>

            {/* 3. Detail View (Right Column) */}
            {detailView && (
            <section className="lg:col-span-1 bg-card border border-border rounded-lg shadow-sm overflow-hidden">
                <div className="bg-muted/30 p-3 border-b border-border">
                <h3 className="font-semibold flex items-center gap-2 text-sm">
                    <CalculatorIcon className="w-4 h-4 text-primary" />
                    Detailed Breakdown: <span className="uppercase">{detailView.res.stormEvent}</span>
                </h3>
                </div>
                
                <div className="p-4">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Calculation Details</p>
                    
                    {detailView.details.length > 0 ? (
                    <div className="space-y-3">
                        {detailView.details.map((d) => (
                        <div key={d.id} className="bg-muted/30 rounded-md border border-border/50 p-3 text-xs">
                            <div className="flex justify-between items-center mb-2 pb-2 border-b border-border/30">
                            <span className="font-bold text-foreground">Stage {d.id}</span>
                            <span className="bg-background px-2 py-0.5 rounded text-[10px] border border-border capitalize">{d.result.flowType}</span>
                            </div>
                            
                            <div className="mb-2 pb-2 border-b border-border/30">
                            <div className="text-muted-foreground text-[10px] mb-1">Discharge (Q):</div>
                            <div className="font-mono font-medium text-foreground text-sm">{d.result.dischargeCfs.toFixed(2)} <span className="text-[10px] text-gray-500">cfs</span></div>
                            </div>
                            
                            <div className="bg-background p-2 rounded border border-border/50 font-mono text-[10px] text-muted-foreground break-all mb-2">
                            {d.result.formula}
                            </div>
                            
                            {/* Variable definitions with units and common names - Table format for alignment */}
                            <div className="mt-2">
                                <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">Variables</div>
                                <table className="w-full text-[10px]">
                                    <tbody>
                                        {Object.entries(d.result.variables).map(([k, v]) => {
                                            // Map variable names to common names and units
                                            const varInfo: Record<string, { name: string; unit: string }> = {
                                                'C': { name: 'Discharge Coefficient', unit: '' },
                                                'A': { name: 'Area', unit: 'ft²' },
                                                'g': { name: 'Gravity', unit: 'ft/s²' },
                                                'h': { name: 'Head', unit: 'ft' },
                                                'H': { name: 'Head', unit: 'ft' },
                                                'L': { name: 'Length', unit: 'ft' },
                                                'WSE': { name: 'Water Surface Elevation', unit: 'ft' },
                                                'Invert': { name: 'Invert Elevation', unit: 'ft' },
                                                'headFt': { name: 'Head', unit: 'ft' }
                                            };
                                            
                                            const info = varInfo[k] || { name: k, unit: '' };
                                            const displayName = varInfo[k] ? `${k} (${info.name})` : k;
                                            
                                            return (
                                                <tr key={k} className="border-b border-border/30">
                                                    <td className="py-0.5 pr-4 text-muted-foreground font-medium align-top">
                                                        {displayName}:
                                                    </td>
                                                    <td className="py-0.5 pr-2 text-right font-mono text-foreground align-top whitespace-nowrap">
                                                        {typeof v === 'number' ? v.toFixed(4) : v}
                                                    </td>
                                                    <td className="py-0.5 text-left font-mono text-[9px] text-gray-500 align-top w-12">
                                                        {info.unit}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                                
                                {/* Derivations - Show intermediate calculations (Collapsible) */}
                                {d.result.derivations && d.result.derivations.length > 0 && (
                                    <div className="mt-3 pt-2 border-t border-border/50">
                                        <button
                                            onClick={() => toggleDerivation(d.id)}
                                            className="w-full flex items-center justify-between text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1.5 hover:text-gray-300 transition-colors"
                                        >
                                            <span>Intermediate Calculations</span>
                                            {expandedDerivations.has(d.id) ? (
                                                <ChevronUp className="w-3 h-3" />
                                            ) : (
                                                <ChevronDown className="w-3 h-3" />
                                            )}
                                        </button>
                                        {expandedDerivations.has(d.id) && (
                                            <div className="space-y-1.5 animate-in slide-in-from-top-2 duration-200">
                                                {d.result.derivations.map((deriv, idx) => (
                                                    <div key={idx} className="text-[9px] text-gray-400/80 font-mono">
                                                        <div className="flex items-start gap-2">
                                                            <span className="text-gray-500 font-medium min-w-[60px]">{deriv.variable}:</span>
                                                            <span className="flex-1 text-gray-400">{deriv.calculation}</span>
                                                            <span className="text-gray-500 min-w-[40px] text-right">{deriv.value.toFixed(4)} {deriv.unit}</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                        ))}
                    </div>
                    ) : (
                    <div className="p-4 text-center text-muted-foreground text-xs italic">
                        No active discharge stages for this event.
                    </div>
                    )}
                </div>
            </section>
            )}
        </div>
      </div>

      {/* Right Sidebar - Profile Visualization */}
      <div className="w-80 bg-card border-l border-border z-10 hidden xl:block">
          <OutfallProfile 
            structures={structures} 
            pondInvert={pondInvertElevation} 
            wseList={wseVisList}
            overlaps={overlaps}
          />
      </div>
    </div>
  );
}

// Simple Icons
function SettingsIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
  )
}

function CalculatorIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="16" height="20" x="4" y="2" rx="2"/><line x1="8" x2="16" y1="6" y2="6"/><line x1="16" x2="16" y1="14" y2="18"/><path d="M16 10h.01"/><path d="M12 10h.01"/><path d="M8 10h.01"/><path d="M12 14h.01"/><path d="M8 14h.01"/><path d="M12 18h.01"/><path d="M8 18h.01"/></svg>
  )
}
