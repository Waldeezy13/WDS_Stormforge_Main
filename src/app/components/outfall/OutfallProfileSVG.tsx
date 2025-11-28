'use client';

import React from 'react';
import { OutfallStructure, OverlapRegion } from '@/utils/hydraulics';

// --- Outfall Type ---
export type OutfallStyle = 'orifice_plate';

interface OutfallProfileProps {
  structures: OutfallStructure[];
  pondInvert: number;
  wseList: { label: string; elevation: number; color: string; isPassing: boolean; isTopLine?: boolean }[];
  overlaps: OverlapRegion[];
  outfallStyle: OutfallStyle;
  plateSize: { width: number; height: number };
  onStyleChange: (style: OutfallStyle) => void;
  onPlateSizeChange: (size: { width: number; height: number }) => void;
}

/**
 * OutfallProfileSVG - Renders the metallic orifice plate profile visualization
 * 
 * This component displays:
 * - A metallic orifice plate with brushed steel effect
 * - Circular and rectangular openings (orifices)
 * - Water surface elevation lines for each storm event
 * - Overlap warning regions in red
 */
export default function OutfallProfileSVG({ 
  structures, 
  pondInvert, 
  wseList,
  overlaps,
  outfallStyle,
  plateSize,
  onStyleChange,
  onPlateSizeChange
}: OutfallProfileProps) {
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
                title="Select outfall structure type"
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
                            {tick.toFixed(1)}&apos;
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
                    {plateSize.width}&apos; × {plateSize.height}&apos; PLATE
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
                {wseList.map((wse) => (
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
