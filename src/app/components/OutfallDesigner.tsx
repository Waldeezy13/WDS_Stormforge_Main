'use client';

import React, { useState, useMemo, useRef, useCallback } from 'react';
import { Trash2, Plus, CheckCircle, XCircle, AlertTriangle, ChevronDown, ChevronUp, Droplets, Waves, ArrowDownToLine, GripVertical, Sparkles, Loader2, X, ChevronUp as ChevronUpIcon, ChevronDown as ChevronDownIcon, Layers } from 'lucide-react';
import { OutfallStructure, OutfallStructureType, calculateTotalDischarge, detectOverlaps, OverlapRegion, solveStructureSize, roundToPrecision, getStructureDischarge } from '@/utils/hydraulics';
import { getOrificeStackingOffset } from '@/utils/hydraulicsConfig';
import { ModifiedRationalResult } from '@/utils/rationalMethod';

// --- Outfall Type ---
type OutfallStyle = 'orifice_plate';

// --- Outfall Profile Visualization Component ---
function OutfallProfile({ 
  structures, 
  pondInvert, 
  wseList,
  overlaps,
  outfallStyle,
  plateSize,
  onStyleChange,
  onPlateSizeChange
}: { 
  structures: OutfallStructure[], 
  pondInvert: number, 
  wseList: { label: string; elevation: number; color: string; isPassing: boolean; isTopLine?: boolean }[],
  overlaps: OverlapRegion[],
  outfallStyle: OutfallStyle,
  plateSize: { width: number; height: number },
  onStyleChange: (style: OutfallStyle) => void,
  onPlateSizeChange: (size: { width: number; height: number }) => void
}) {
  // SVG Dimensions - use viewBox for scaling
  const svgWidth = 280;
  const svgHeight = 500;
  // Increased left padding to ensure tick labels don't overlap with plate
  const padding = { top: 30, bottom: 30, left: 55, right: 30 };
  
  // Graph area dimensions
  const graphWidth = svgWidth - padding.left - padding.right;
  const graphHeight = svgHeight - padding.top - padding.bottom;

  // Calculate Elevation Range
  // Include plate height in range calculation
  const maxWSE = Math.max(...wseList.map(w => w.elevation), pondInvert + 5);
  const maxStructEl = Math.max(...structures.map(s => s.invertElevation + (s.type === 'circular' ? (s.diameterFt || 0) : (s.heightFt || 0))), pondInvert);
  const plateTopEl = pondInvert + plateSize.height;
  
  const minEl = pondInvert;
  const maxEl = Math.max(maxWSE, maxStructEl, plateTopEl) + 1;
  const elRange = maxEl - minEl || 10; // Prevent div by zero

  // Scale Helper - Y position from elevation
  const getY = (el: number) => {
    const relativeY = (el - minEl) / elRange;
    return svgHeight - padding.bottom - (relativeY * graphHeight);
  };

  // Ticks - fewer ticks for cleaner display
  const tickCount = 8;
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) => minEl + (elRange * i / tickCount));

  // Calculate horizontal extent needed for structures
  let minX = 0;
  let maxX = 0;
  
  structures.forEach(s => {
    const offset = s.horizontalOffsetFt || 0;
    let leftEdge: number;
    let rightEdge: number;
    
    if (s.type === 'circular') {
      const dia = s.diameterFt || 0;
      leftEdge = offset - dia/2;
      rightEdge = offset + dia/2;
    } else {
      const w = s.widthFt || 0;
      leftEdge = offset - w/2;
      rightEdge = offset + w/2;
    }
    
    minX = Math.min(minX, leftEdge);
    maxX = Math.max(maxX, rightEdge);
  });
  
  // Calculate scale to fit plate within graph area
  // The plate should be centered and fit within the graph area with margins
  const plateMargin = 10; // pixels margin on each side
  const availableWidth = graphWidth - (plateMargin * 2);
  
  // Scale based on plate width - plate should fit nicely in available space
  const xScaleFtPerPixel = Math.max(plateSize.width, 4) / availableWidth;
  const yScaleFtPerPixel = elRange / graphHeight;
  
  // Center of the graph area
  const graphCenterX = padding.left + graphWidth / 2;
  
  // Scale helper for X-axis (feet to pixels) - 0 is at center
  const getX = (xFt: number) => {
    return graphCenterX + (xFt / xScaleFtPerPixel);
  };
  
  // Helper to get width in pixels for a given width in feet
  const getWidthPixels = (widthFt: number) => {
    return widthFt / xScaleFtPerPixel;
  };

  // Calculate plate dimensions in pixels for rendering
  const plateHeightPixels = Math.abs(getY(pondInvert + plateSize.height) - getY(pondInvert));
  const plateRenderWidth = getWidthPixels(plateSize.width);
  const plateRenderX = graphCenterX - plateRenderWidth / 2;
  const plateRenderY = getY(pondInvert + plateSize.height);

  return (
    <div className="h-full bg-card border-l border-border flex flex-col shadow-xl relative">
        <div className="p-4 border-b border-border bg-muted/10 space-y-3">
            <h3 className="text-sm font-semibold">Outfall Profile</h3>
            
            {/* Outfall Style Selector */}
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Outfall Type</label>
              <select 
                value={outfallStyle}
                onChange={(e) => onStyleChange(e.target.value as OutfallStyle)}
                className="w-full bg-background border border-input rounded px-2 py-1.5 text-sm focus:ring-1 focus:ring-primary outline-none"
              >
                <option value="orifice_plate">Orifice Plate</option>
              </select>
            </div>
            
            {/* Plate Size Inputs */}
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Plate Size (ft)</label>
              <div className="flex items-center gap-2">
                <input 
                  type="number" 
                  step="0.5"
                  value={plateSize.width}
                  onChange={(e) => onPlateSizeChange({ ...plateSize, width: parseFloat(e.target.value) || 0 })}
                  className="w-16 bg-background border border-input rounded px-2 py-1 text-sm focus:ring-1 focus:ring-primary outline-none text-center"
                  placeholder="W"
                />
                <span className="text-muted-foreground">×</span>
                <input 
                  type="number" 
                  step="0.5"
                  value={plateSize.height}
                  onChange={(e) => onPlateSizeChange({ ...plateSize, height: parseFloat(e.target.value) || 0 })}
                  className="w-16 bg-background border border-input rounded px-2 py-1 text-sm focus:ring-1 focus:ring-primary outline-none text-center"
                  placeholder="H"
                />
              </div>
            </div>
        </div>
        <div className="flex-1 relative overflow-hidden">
            <svg width="100%" height="100%" viewBox={`0 0 ${svgWidth} ${svgHeight}`} preserveAspectRatio="xMidYMid meet">
                {/* Metallic Gradient Definitions */}
                <defs>
                  {/* Brushed Steel Gradient */}
                  <linearGradient id="metallicGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#4a5568" />
                    <stop offset="15%" stopColor="#718096" />
                    <stop offset="30%" stopColor="#a0aec0" />
                    <stop offset="50%" stopColor="#cbd5e0" />
                    <stop offset="70%" stopColor="#a0aec0" />
                    <stop offset="85%" stopColor="#718096" />
                    <stop offset="100%" stopColor="#4a5568" />
                  </linearGradient>
                  
                  {/* Vertical highlight for 3D effect */}
                  <linearGradient id="metallicHighlight" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#e2e8f0" stopOpacity="0.8" />
                    <stop offset="20%" stopColor="#cbd5e0" stopOpacity="0.4" />
                    <stop offset="80%" stopColor="#4a5568" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#2d3748" stopOpacity="0.8" />
                  </linearGradient>
                  
                  {/* Pattern for brushed metal texture */}
                  <pattern id="brushedTexture" width="4" height="4" patternUnits="userSpaceOnUse">
                    <line x1="0" y1="0" x2="4" y2="0" stroke="#a0aec0" strokeWidth="0.5" opacity="0.3" />
                    <line x1="0" y1="2" x2="4" y2="2" stroke="#718096" strokeWidth="0.3" opacity="0.2" />
                  </pattern>
                  
                  {/* Combined metallic fill */}
                  <pattern id="metalPlate" width="100%" height="100%" patternUnits="objectBoundingBox">
                    <rect width="100%" height="100%" fill="url(#metallicGradient)" />
                    <rect width="100%" height="100%" fill="url(#brushedTexture)" />
                  </pattern>
                </defs>
                {/* Grid / Ticks */}
                {ticks.map(tick => (
                    <g key={tick}>
                        <line 
                            x1={padding.left} y1={getY(tick)} 
                            x2={svgWidth - padding.right} y2={getY(tick)} 
                            stroke="#e2e8f0" strokeWidth="1" strokeDasharray="4 4" 
                            className="dark:stroke-slate-700"
                        />
                        <text 
                            x={padding.left - 8} y={getY(tick)} 
                            fontSize="9" fill="#94a3b8" 
                            textAnchor="end" alignmentBaseline="middle"
                        >
                            {tick.toFixed(1)}'
                        </text>
                    </g>
                ))}

                {/* Pond Bottom */}
                <line 
                    x1={padding.left} y1={getY(minEl)} 
                    x2={svgWidth - padding.right} y2={getY(minEl)} 
                    stroke="#64748b" strokeWidth="2" 
                />

                {/* Center Line Indicator (0 position) */}
                <line 
                    x1={graphCenterX} y1={padding.top} 
                    x2={graphCenterX} y2={svgHeight - padding.bottom} 
                    stroke="#94a3b8" strokeWidth="1" strokeDasharray="2 2" 
                    opacity="0.5"
                />
                <text 
                    x={graphCenterX} y={padding.top - 5} 
                    fontSize="9" fill="#64748b" 
                    textAnchor="middle"
                    className="font-medium"
                >
                    0 (center)
                </text>

                {/* The Metallic Orifice Plate */}
                <g>
                  {/* Main plate body with metallic gradient */}
                  <rect 
                    x={plateRenderX} 
                    y={plateRenderY} 
                    width={plateRenderWidth} 
                    height={plateHeightPixels} 
                    fill="url(#metallicGradient)"
                    stroke="#4a5568"
                    strokeWidth="2"
                  />
                  
                  {/* 3D highlight overlay */}
                  <rect 
                    x={plateRenderX} 
                    y={plateRenderY} 
                    width={plateRenderWidth} 
                    height={plateHeightPixels} 
                    fill="url(#metallicHighlight)"
                  />
                  
                  {/* Brushed texture overlay */}
                  <rect 
                    x={plateRenderX} 
                    y={plateRenderY} 
                    width={plateRenderWidth} 
                    height={plateHeightPixels} 
                    fill="url(#brushedTexture)"
                  />
                  
                  {/* Top edge highlight */}
                  <line 
                    x1={plateRenderX + 2} 
                    y1={plateRenderY + 2} 
                    x2={plateRenderX + plateRenderWidth - 2} 
                    y2={plateRenderY + 2}
                    stroke="#e2e8f0"
                    strokeWidth="1"
                    opacity="0.6"
                  />
                  
                  {/* Bottom edge shadow */}
                  <line 
                    x1={plateRenderX + 2} 
                    y1={plateRenderY + plateHeightPixels - 2} 
                    x2={plateRenderX + plateRenderWidth - 2} 
                    y2={plateRenderY + plateHeightPixels - 2}
                    stroke="#2d3748"
                    strokeWidth="1"
                    opacity="0.6"
                  />
                  
                  {/* Plate label */}
                  <text 
                    x={plateRenderX + plateRenderWidth / 2} 
                    y={plateRenderY - 5}
                    fontSize="8" 
                    fill="#94a3b8" 
                    textAnchor="middle"
                    fontWeight="bold"
                  >
                    {plateSize.width}' × {plateSize.height}' PLATE
                  </text>
                </g>

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
                        {wse.isTopLine ? (
                          <>
                            {/* Pond Top Line - thick solid line */}
                            <line 
                                x1={padding.left} y1={getY(wse.elevation)} 
                                x2={svgWidth - padding.right} y2={getY(wse.elevation)} 
                                stroke={wse.color} strokeWidth="3"
                                opacity="1"
                            />
                            <text 
                                x={padding.left + 2} y={getY(wse.elevation) - 4} 
                                fontSize="9" fill={wse.color} fontWeight="bold"
                                textAnchor="start"
                            >
                                POND TOP
                            </text>
                          </>
                        ) : (
                          <>
                            <line 
                                x1={padding.left} y1={getY(wse.elevation)} 
                                x2={svgWidth - padding.right} y2={getY(wse.elevation)} 
                                stroke={wse.color} strokeWidth="2" strokeDasharray={wse.isPassing ? "" : "5 2"}
                                opacity="0.8"
                            />
                            <text 
                                x={svgWidth - padding.right} y={getY(wse.elevation) - 4} 
                                fontSize="10" fill={wse.color} fontWeight="bold"
                                textAnchor="end"
                            >
                                {wse.label}
                            </text>
                          </>
                        )}
                    </g>
                ))}

            </svg>
        </div>
    </div>
  );
}


interface PondDims {
  length: number;
  width: number;
  depth: number;
}

interface OutfallDesignerProps {
  results: ModifiedRationalResult[];
  pondDims: PondDims;
  pondInvertElevation?: number;
}

// LocalStorage keys for persistence
const STORAGE_KEY_STRUCTURES = 'outfallDesigner_structures';
const STORAGE_KEY_PLATE_SIZE = 'outfallDesigner_plateSize';
const STORAGE_KEY_OUTFALL_STYLE = 'outfallDesigner_outfallStyle';
const STORAGE_KEY_TAILWATER = 'outfallDesigner_tailwater';

export default function OutfallDesigner({ results, pondDims, pondInvertElevation = 0 }: OutfallDesignerProps) {
  // Calculate derived pond values
  const pondAreaSqFt = pondDims.length * pondDims.width;
  const pondTopElevation = pondInvertElevation + pondDims.depth;
  
  // Helper to get initial structures from localStorage or default
  const getInitialStructures = (): OutfallStructure[] => {
    if (typeof window === 'undefined') {
      return [{ id: '1', type: 'circular', invertElevation: pondInvertElevation, horizontalOffsetFt: 0, diameterFt: 1, dischargeCoefficient: 0.6 }];
    }
    const stored = localStorage.getItem(STORAGE_KEY_STRUCTURES);
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
    return [{ id: '1', type: 'circular', invertElevation: pondInvertElevation, horizontalOffsetFt: 0, diameterFt: 1, dischargeCoefficient: 0.6 }];
  };

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

  // Helper to get initial tailwater elevations from localStorage or default
  const getInitialTailwater = (): Record<string, number> => {
    if (typeof window === 'undefined') {
      return {};
    }
    const stored = localStorage.getItem(STORAGE_KEY_TAILWATER);
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
  };

  // Outfall configuration state with persistence
  const [outfallStyle, setOutfallStyleState] = useState<OutfallStyle>(getInitialOutfallStyle);
  const [plateSize, setPlateSizeState] = useState(getInitialPlateSize);
  const [structures, setStructuresState] = useState<OutfallStructure[]>(getInitialStructures);
  const [tailwaterElevations, setTailwaterElevationsState] = useState<Record<string, number>>(getInitialTailwater);
  
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

  const setStructures = (newStructures: OutfallStructure[] | ((prev: OutfallStructure[]) => OutfallStructure[])) => {
    setStructuresState(prev => {
      const resolved = typeof newStructures === 'function' ? newStructures(prev) : newStructures;
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY_STRUCTURES, JSON.stringify(resolved));
      }
      return resolved;
    });
  };

  const setTailwaterElevations = (newTailwater: Record<string, number> | ((prev: Record<string, number>) => Record<string, number>)) => {
    setTailwaterElevationsState(prev => {
      const resolved = typeof newTailwater === 'function' ? newTailwater(prev) : newTailwater;
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY_TAILWATER, JSON.stringify(resolved));
      }
      return resolved;
    });
  };

  const [selectedDetailEvent, setSelectedDetailEvent] = useState<string | null>(null);
  const [expandedDerivations, setExpandedDerivations] = useState<Set<string>>(new Set());
  
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
                            <Waves className="w-3 h-3 text-red-400" title="Fully submerged - tailwater above top of opening" />
                          )}
                          {data.submergenceLevel === 'partial' && (
                            <Waves className="w-3 h-3 text-amber-400" title="Partially submerged - tailwater in opening" />
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
                            <AlertTriangle className="w-4 h-4 text-amber-500" title="Insufficient freeboard" />
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
                              />
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  updateStructure(s.id, 'invertElevation', (s.invertElevation || 0) - 0.01);
                                }}
                                className="p-0.5 hover:bg-primary/20 rounded-b transition-colors flex justify-center"
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
                            />
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                updateStructure(s.id, 'horizontalOffsetFt', (s.horizontalOffsetFt || 0) - 0.01);
                              }}
                              className="p-0.5 hover:bg-primary/20 rounded-b transition-colors flex justify-center"
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
                                  />
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      updateStructure(s.id, 'diameterFt', Math.max(0.01, (s.diameterFt || 0) - 0.01));
                                    }}
                                    className="p-0.5 hover:bg-primary/20 rounded-b transition-colors flex justify-center"
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
                                    />
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        updateStructure(s.id, 'widthFt', Math.max(0.01, (s.widthFt || 0) - 0.01));
                                      }}
                                      className="p-0.5 hover:bg-primary/20 rounded-b transition-colors flex justify-center"
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
                                    />
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        updateStructure(s.id, 'heightFt', Math.max(0.01, (s.heightFt || 0) - 0.01));
                                      }}
                                      className="p-0.5 hover:bg-primary/20 rounded-b transition-colors flex justify-center"
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
                            />
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                updateStructure(s.id, 'dischargeCoefficient', Math.max(0, (s.dischargeCoefficient || 0) - 0.01));
                              }}
                              className="p-0.5 hover:bg-primary/20 rounded-b transition-colors flex justify-center"
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
          <OutfallProfile 
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

function CalculatorIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="16" height="20" x="4" y="2" rx="2"/><line x1="8" x2="16" y1="6" y2="6"/><line x1="16" x2="16" y1="14" y2="18"/><path d="M16 10h.01"/><path d="M12 10h.01"/><path d="M8 10h.01"/><path d="M12 14h.01"/><path d="M8 14h.01"/><path d="M12 18h.01"/><path d="M8 18h.01"/></svg>
  )
}
