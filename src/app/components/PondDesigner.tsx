'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Text, Grid, Html } from '@react-three/drei';
import type { ModifiedRationalResult } from '@/utils/rationalMethod';
import { ReturnPeriod } from '@/utils/atlas14';
import { Cuboid, Settings2, AlertTriangle, Droplets, TrendingUp } from 'lucide-react';
import * as THREE from 'three';

// --- 3D Components ---

function Dimensions({ width, length, depth }: { width: number, length: number, depth: number }) {
  return (
    <group position={[0, depth/2, 0]}>
      {/* Length Dimension */}
      <group position={[0, -depth/2, length/2 + 10]}>
         <mesh rotation={[-Math.PI/2, 0, 0]}>
             <boxGeometry args={[width, 0.5, 0.5]} />
             <meshBasicMaterial color="#64748b" />
         </mesh>
         <Text position={[0, 2, 0]} fontSize={3} color="#94a3b8" anchorX="center" anchorY="bottom">
           {length} ft
         </Text>
      </group>

      {/* Width Dimension */}
      <group position={[width/2 + 10, -depth/2, 0]} rotation={[0, -Math.PI/2, 0]}>
         <mesh rotation={[-Math.PI/2, 0, 0]}>
             <boxGeometry args={[length, 0.5, 0.5]} />
             <meshBasicMaterial color="#64748b" />
         </mesh>
         <Text position={[0, 2, 0]} rotation={[0, Math.PI, 0]} fontSize={3} color="#94a3b8" anchorX="center" anchorY="bottom">
           {width} ft
         </Text>
      </group>

      {/* Depth Dimension */}
      <group position={[-width/2 - 10, 0, -length/2]}>
         <mesh position={[0, 0, 0]}>
             <boxGeometry args={[0.5, depth, 0.5]} />
             <meshBasicMaterial color="#64748b" />
         </mesh>
          <Text position={[-2, 0, 0]} rotation={[0, 0, Math.PI/2]} fontSize={3} color="#94a3b8" anchorX="center" anchorY="bottom">
           {depth} ft
         </Text>
      </group>
    </group>
  );
}

function PondMesh({ width, length, depth, waterLevels }: { width: number, length: number, depth: number, waterLevels: { level: number, color: string, label: string }[] }) {
  return (
    <group position={[0, depth / 2, 0]}>
      {/* Pond Bottom/Walls */}
      <mesh position={[0, -depth/2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[width, length]} />
        <meshStandardMaterial color="#334155" side={2} />
      </mesh>
      
      {/* Water Levels */}
      {waterLevels.map((wl, idx) => (
        <group key={idx} position={[0, wl.level - depth/2, 0]}>
           <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[width, length]} />
            <meshStandardMaterial color={wl.color} transparent opacity={0.6} side={2} />
          </mesh>
          <Html position={[width/2 + 2, 0, 0]} center>
             <div className="px-2 py-1 rounded shadow-sm text-xs font-bold whitespace-nowrap" style={{ backgroundColor: wl.color, color: 'black' }}>
                {wl.label}
             </div>
          </Html>
        </group>
      ))}

      {/* Wireframe Outline */}
      <lineSegments position={[0, 0, 0]}>
        <edgesGeometry args={[new THREE.BoxGeometry(width, depth, length)]} />
        <lineBasicMaterial color="#94a3b8" />
      </lineSegments>

      <Dimensions width={width} length={length} depth={depth} />
    </group>
  );
}

// --- Design Volume Card Component ---
function DesignVolumeCard({ 
  designResult, 
  pondCapacity,
  getWaterDepth,
  getColor 
}: { 
  designResult: ModifiedRationalResult | null;
  pondCapacity: number;
  getWaterDepth: (vol: number) => number;
  getColor: (event: ReturnPeriod) => string;
}) {
  if (!designResult) {
    return (
      <div className="bg-slate-800/50 border border-border rounded-lg p-6 text-center">
        <AlertTriangle className="w-8 h-8 text-yellow-500 mx-auto mb-2" />
        <p className="text-sm text-gray-400">No design results available. Configure drainage areas first.</p>
      </div>
    );
  }

  const requiredVol = designResult.requiredStorageCf;
  const waterDepth = getWaterDepth(requiredVol);
  const isOverCapacity = requiredVol > pondCapacity;
  const utilizationPercent = pondCapacity > 0 ? (requiredVol / pondCapacity) * 100 : 0;

  return (
    <div className={`relative overflow-hidden rounded-xl border-2 ${isOverCapacity ? 'border-red-500 bg-red-950/20' : 'border-emerald-500 bg-emerald-950/20'}`}>
      {/* Background accent */}
      <div 
        className="absolute inset-0 opacity-10" 
        style={{ backgroundColor: getColor(designResult.stormEvent) }}
      />
      
      <div className="relative p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div 
              className="w-3 h-3 rounded-full" 
              style={{ backgroundColor: getColor(designResult.stormEvent) }}
            />
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
              Design Volume
            </span>
          </div>
          <span className={`text-xs font-bold px-2 py-1 rounded ${isOverCapacity ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
            {isOverCapacity ? 'UNDERSIZED' : 'OK'}
          </span>
        </div>

        {/* Main Volume Display */}
        <div className="mb-4">
          <div className="text-4xl font-bold text-white tracking-tight">
            {Math.round(requiredVol).toLocaleString()}
            <span className="text-lg font-normal text-gray-400 ml-2">cf</span>
          </div>
          <div className="text-sm text-gray-400 mt-1">
            Controlling Storm: <span className="font-semibold text-white">{designResult.stormEvent.toUpperCase()}</span>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-3 pt-4 border-t border-white/10">
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Water Depth</div>
            <div className="text-lg font-semibold text-primary">{waterDepth.toFixed(2)} ft</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Duration</div>
            <div className="text-lg font-semibold text-gray-300">{designResult.criticalDurationMinutes} min</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Utilization</div>
            <div className={`text-lg font-semibold ${utilizationPercent > 100 ? 'text-red-400' : 'text-emerald-400'}`}>
              {utilizationPercent.toFixed(0)}%
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Required Volumes Section ---
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
  
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs text-gray-500 uppercase tracking-wider">
        <TrendingUp className="w-3 h-3" />
        Required Storage by Storm
      </div>
      <div className="space-y-2">
        {sortedResults.map((result, idx) => {
          const isControlling = idx === 0;
          const waterDepth = getWaterDepth(result.requiredStorageCf);
          const isOverCapacity = result.requiredStorageCf > pondCapacity;
          
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
              </div>
              
              {/* Water depth */}
              <div className="text-right">
                <div className={`text-sm font-mono ${isOverCapacity ? 'text-red-400' : 'text-primary'}`}>
                  {waterDepth.toFixed(2)} ft
                </div>
                <div className="text-[10px] text-gray-500">depth</div>
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

interface PondDesignerProps {
  cityId: number;
  selectedEvents: ReturnPeriod[];
  results: ModifiedRationalResult[];
  drainageTotals: DrainageTotalsSummary;
  pondDims: PondDims;
  onPondDimsChange: (dims: PondDims) => void;
}

// --- Main Pond Designer Component ---
export default function PondDesigner({ cityId, selectedEvents, results, drainageTotals, pondDims, onPondDimsChange }: PondDesignerProps) {
  const [allowableFlows, setAllowableFlows] = useState<Record<ReturnPeriod, number>>({
    '2yr': 0,
    '5yr': 0,
    '10yr': 0,
    '25yr': 0,
    '50yr': 0,
    '100yr': 0,
  });

  // Calculate pond capacity
  const pondCapacity = useMemo(() => {
    return pondDims.length * pondDims.width * pondDims.depth;
  }, [pondDims]);

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
    const area = pondDims.length * pondDims.width;
    return area > 0 ? volumeCf / area : 0;
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
      <aside className="w-full lg:w-1/2 bg-card border-r border-border flex flex-col h-full z-10 shadow-xl">
        <div className="p-6 overflow-y-auto flex-1">
          <div className="flex items-center gap-2 mb-6">
            <Settings2 className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">Pond Design</h2>
          </div>

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

            {/* Section 2: Design Volume (Prominent) */}
            <section className="space-y-4">
              <DesignVolumeCard 
                designResult={designResult}
                pondCapacity={pondCapacity}
                getWaterDepth={getWaterDepth}
                getColor={getColor}
              />
              
              {results.length > 0 && (
                <RequiredVolumesSection 
                  results={results}
                  getWaterDepth={getWaterDepth}
                  getColor={getColor}
                  pondCapacity={pondCapacity}
                />
              )}
            </section>

            {/* Section 3: Pond Geometry */}
            <section className="space-y-4">
              <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider border-b border-border pb-2 flex items-center gap-2">
                <Cuboid className="w-4 h-4"/> Pond Geometry
              </h3>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Length (ft)</label>
                  <input 
                    type="number" 
                    value={pondDims.length} 
                    onChange={e => onPondDimsChange({...pondDims, length: parseFloat(e.target.value) || 0})}
                    className="w-full bg-background border border-border rounded px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Width (ft)</label>
                  <input 
                    type="number" 
                    value={pondDims.width} 
                    onChange={e => onPondDimsChange({...pondDims, width: parseFloat(e.target.value) || 0})}
                    className="w-full bg-background border border-border rounded px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Depth (ft)</label>
                  <input 
                    type="number" 
                    value={pondDims.depth} 
                    onChange={e => onPondDimsChange({...pondDims, depth: parseFloat(e.target.value) || 0})}
                    className="w-full bg-background border border-border rounded px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none transition-all"
                  />
                </div>
              </div>
              
              {/* Pond Capacity Summary */}
              <div className="bg-slate-900/50 rounded-lg p-4 flex items-center justify-between">
                <div>
                  <div className="text-xs text-gray-500 uppercase tracking-wider">Pond Capacity</div>
                  <div className="text-xl font-bold text-white">{pondCapacity.toLocaleString()} <span className="text-sm font-normal text-gray-400">cf</span></div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-500 uppercase tracking-wider">Surface Area</div>
                  <div className="text-lg font-semibold text-gray-300">{(pondDims.length * pondDims.width).toLocaleString()} <span className="text-sm font-normal text-gray-500">sf</span></div>
                </div>
              </div>
            </section>

          </div>
        </div>
      </aside>

      {/* Main Content Area - 3D Visualization */}
      <main className="w-full lg:w-1/2 flex flex-col h-full relative bg-gradient-to-b from-slate-900 to-slate-950">
        <div className="flex-1">
          <Canvas className="w-full h-full" camera={{ position: [180, 180, 180], fov: 45 }}>
            <color attach="background" args={['#020617']} />
            <ambientLight intensity={0.5} />
            <pointLight position={[100, 100, 100]} intensity={1} />
            <Grid infiniteGrid fadeDistance={500} sectionColor="#1e293b" cellColor="#0f172a" />
            
            <PondMesh 
              width={pondDims.width} 
              length={pondDims.length} 
              depth={pondDims.depth}
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
