'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Plus, Trash2, Calculator, Table as TableIcon, ArrowRight, Waves, Upload, FileJson, GitBranch } from 'lucide-react';
import { ReturnPeriod } from '@/utils/atlas14';
import type { DrainageArea } from '@/utils/drainageCalculations';
import { RationalMethod } from '@/utils/drainageCalculations';
import DrainageImport from './DrainageImport';
import { getImportMetadata, DrainageImportInfo } from '@/utils/stormforgeImport'

type AreaToggles = {
  isIncluded: boolean;
  isBypass: boolean;
};

export type DesignPointConfig = {
  id: string;
  name: string;
  note: string;
  toggles: Record<string, AreaToggles>;
};;



type DrainageTotals = {
  totalArea: number;
  weightedC: number;
  tcMinutes: number;
  flowTotals: Record<ReturnPeriod, number>;
  bypassFlowTotals: Record<ReturnPeriod, number>;
  bypassArea: number;
};

const DEFAULT_AREAS: DrainageArea[] = [
  { id: '1', type: 'existing', name: 'Ex. Area 1', areaAcres: 5.0, cFactor: 0.35, tcMinutes: 15, isIncluded: true, isBypass: false },
  { id: '2', type: 'existing', name: 'Ex. Area 2', areaAcres: 2.0, cFactor: 0.40, tcMinutes: 12, isIncluded: true, isBypass: false },
  { id: '3', type: 'proposed', name: 'Prop. Roof', areaAcres: 3.5, cFactor: 0.90, tcMinutes: 10, isIncluded: true, isBypass: false },
  { id: '4', type: 'proposed', name: 'Prop. Pavement', areaAcres: 1.5, cFactor: 0.85, tcMinutes: 10, isIncluded: true, isBypass: false },
  { id: '5', type: 'proposed', name: 'Prop. Landscape', areaAcres: 2.0, cFactor: 0.30, tcMinutes: 20, isIncluded: true, isBypass: false },
];



interface DrainageProps {

  cityId: number;

  selectedEvents: ReturnPeriod[];

  onTotalsChange?: (totals: { existing: DrainageTotals; proposed: DrainageTotals }) => void;

  onReturnPeriodsDetected?: (periods: ReturnPeriod[]) => void;

}



export default function Drainage({ cityId, selectedEvents, onTotalsChange, onReturnPeriodsDetected }: DrainageProps) {
  // --- State ---
  const [importModalType, setImportModalType] = useState<'existing' | 'proposed' | null>(null);
  
  // Load import metadata directly during initialization (no effect needed)
  const [importMeta, setImportMeta] = useState<{ existing: DrainageImportInfo | null; proposed: DrainageImportInfo | null }>(() => {
    if (typeof window === 'undefined') return { existing: null, proposed: null };
    return getImportMetadata();
  });

  const [designPoints, setDesignPoints] = useState<DesignPointConfig[]>(() => {
    if (typeof window === 'undefined') return [{ id: 'dp-1', name: 'Design Point 1', note: '', toggles: {} }];
    try {
      const raw = window.localStorage.getItem('wds-stormforge-design-points');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch(e) {}
    return [{ id: 'dp-1', name: 'Design Point 1', note: '', toggles: {} }];
  });
  
  const [activeDpId, setActiveDpId] = useState<string>(() => {
    if (typeof window === 'undefined') return 'dp-1';
    try {
       const saved = window.localStorage.getItem('wds-stormforge-active-dp');
       if (saved) return saved;
    } catch(e) {}
    return 'dp-1';
  });

  const activeDp = useMemo(() => designPoints.find(dp => dp.id === activeDpId) || designPoints[0], [designPoints, activeDpId]);

  const [areas, setAreas] = useState<DrainageArea[]>(() => {
    if (typeof window === 'undefined') {
      return DEFAULT_AREAS;
    }
    try {
      const raw = window.localStorage.getItem('wds-stormforge-drainage-areas');
      if (raw === null) return DEFAULT_AREAS;
      const parsed = JSON.parse(raw) as DrainageArea[];
      if (Array.isArray(parsed)) {
        // Migrate old data: add isBypass if missing
        return parsed.map(a => ({ ...a, isBypass: a.isBypass ?? false }));
      }
      return DEFAULT_AREAS;
    } catch (error) {
      console.error('Error loading saved drainage areas:', error);
      return DEFAULT_AREAS;
    }
  });



  const activeAreas = useMemo(() => {
    return areas.map(a => {
      const toggle = activeDp?.toggles[a.id];
      if (toggle) {
        return { ...a, isIncluded: toggle.isIncluded, isBypass: toggle.isBypass };
      }
      return a;
    });
  }, [areas, activeDp]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('wds-stormforge-design-points', JSON.stringify(designPoints));
      window.localStorage.setItem('wds-stormforge-active-dp', activeDpId);
    }
  }, [designPoints, activeDpId]);

  // Autosave areas whenever they change

  useEffect(() => {

    if (typeof window === 'undefined') return;

    try {

      window.localStorage.setItem('wds-stormforge-drainage-areas', JSON.stringify(areas));

    } catch (error) {

      console.error('Error saving drainage areas:', error);

    }

  }, [areas]);



  // --- Calculations ---

  type DrainageAreaWithResults = DrainageArea & { results: Record<ReturnPeriod, { intensity: number, peakFlowCfs: number }> };

  const [results, setResults] = useState<DrainageAreaWithResults[]>([]);

  // Storage key for calculation results (shared with page.tsx for export)
  const CALC_RESULTS_KEY = 'wds-stormforge-calc-results';

  useEffect(() => {

    if (cityId === 0) {

      setResults([]);
      localStorage.removeItem(CALC_RESULTS_KEY);

      return;

    }



    async function calculateResults() {

      const calculatedResults = await Promise.all(

        areas.map(async area => {

          const areaResults: Record<ReturnPeriod, { intensity: number, peakFlowCfs: number }> = {} as Record<ReturnPeriod, { intensity: number, peakFlowCfs: number }>;

          for (const event of selectedEvents) {

            const result = await RationalMethod.calculateRunoff(area, event, cityId);

            areaResults[event] = { intensity: result.intensity, peakFlowCfs: result.peakFlowCfs };

          }

          return { ...area, results: areaResults };

        })

      );

      setResults(calculatedResults);
      
      // Store calculation results in localStorage for export
      const calcResultsForStorage: Record<string, { returnPeriod: string; intensity: number; peakFlowCfs: number }[]> = {};
      for (const result of calculatedResults) {
        calcResultsForStorage[result.id] = Object.entries(result.results).map(([event, data]) => ({
          returnPeriod: event,
          intensity: data.intensity,
          peakFlowCfs: data.peakFlowCfs,
        }));
      }
      localStorage.setItem(CALC_RESULTS_KEY, JSON.stringify(calcResultsForStorage));

    }



    calculateResults();

  }, [areas, cityId, selectedEvents]);



  // --- Handlers ---

  const addArea = (type: 'existing' | 'proposed') => {

    const newId = (Math.max(0, ...areas.map(a => parseInt(a.id))) + 1).toString();

    setAreas([...areas, { 

      id: newId, 

      type,

      name: `${type === 'existing' ? 'Ex.' : 'Prop.'} Area`, 

      areaAcres: 0, 

      cFactor: 0, 

      tcMinutes: 10,

      isIncluded: true,

      isBypass: false

    }]);

  };



  const removeArea = (id: string) => {

    setAreas(areas.filter(a => a.id !== id));

  };



  const updateArea = (id: string, field: keyof DrainageArea, value: string | number | boolean) => {

    setAreas(areas.map(a => {

      if (a.id === id) {

        return { ...a, [field]: value };

      }

      return a;

    }));

  };



  const addDesignPoint = () => {
    const existingNumbers = designPoints
      .map(dp => {
        const match = dp.name.match(/^Design Point (\d+)$/i);
        return match ? parseInt(match[1], 10) : 0;
      })
      .filter(n => !isNaN(n));
      
    const maxNum = existingNumbers.length > 0 ? Math.max(...existingNumbers) : 0;
    const nextNum = maxNum + 1;

    const newDp = {
       id: crypto.randomUUID(),
       name: `Design Point ${nextNum}`,
       note: '',
       toggles: {}
    };
    setDesignPoints([...designPoints, newDp]);
    setActiveDpId(newDp.id);
  };

  const updateDpNote = (id: string, note: string) => {
    setDesignPoints(prev => prev.map(dp => dp.id === id ? { ...dp, note } : dp));
  };

  const toggleInclusion = (id: string) => {
    const area = activeAreas.find(a => a.id === id);
    if (!area) return;
    const currentIncluded = area.isIncluded;

    setDesignPoints(prev => prev.map(dp => {
      if (dp.id !== activeDpId) return dp;
      return {
        ...dp,
        toggles: {
          ...dp.toggles,
          [id]: {
            ...dp.toggles[id],
            isIncluded: !currentIncluded,
            isBypass: dp.toggles[id]?.isBypass ?? area.isBypass ?? false
          }
        }
      };
    }));
  };

  const toggleBypass = (id: string) => {
    const area = activeAreas.find(a => a.id === id);
    if (!area) return;
    const currentBypass = area.isBypass ?? false;

    setDesignPoints(prev => prev.map(dp => {
      if (dp.id !== activeDpId) return dp;
      return {
        ...dp,
        toggles: {
          ...dp.toggles,
          [id]: {
            ...dp.toggles[id],
            isIncluded: dp.toggles[id]?.isIncluded ?? area.isIncluded,
            isBypass: !currentBypass
          }
        }
      };
    }));
  };



  const activeResults = useMemo(() => {
      const mapped = results.map(r => {
           const activeState = activeAreas.find(a => a.id === r.id);
           if (activeState) {
                return { ...r, isIncluded: activeState.isIncluded, isBypass: activeState.isBypass };
           }
           return r;
      });

      // Sort areas to naturally group active/bypass/excluded rows
      return mapped.sort((a, b) => {
         // Group 1: Included
         if (a.isIncluded !== b.isIncluded) {
            return a.isIncluded ? -1 : 1;
         }
         // Group 2: Not Bypass (Routed)
         if (a.isIncluded && (a.isBypass !== b.isBypass)) {
            return a.isBypass ? 1 : -1;
         }
         // Tie-breaker: Preserve numerical ID order
         return parseInt(a.id) - parseInt(b.id);
      });
  }, [results, activeAreas]);

  // Calculate Totals for a specific type

  const calculateTotals = useCallback((type: 'existing' | 'proposed'): DrainageTotals => {

      // Only sum included, non-bypass areas for pond routing

      const pondAreas = areas.filter(a => a.type === type && a.isIncluded && !(a.isBypass ?? false));

      const bypassAreas = areas.filter(a => a.type === type && a.isIncluded && (a.isBypass ?? false));

      

      const totalArea = pondAreas.reduce((sum, a) => sum + a.areaAcres, 0);

      const bypassArea = bypassAreas.reduce((sum, a) => sum + a.areaAcres, 0);

      const weightedC = totalArea > 0 ? pondAreas.reduce((sum, a) => sum + (a.cFactor * a.areaAcres), 0) / totalArea : 0;

      const tcMinutes = pondAreas.reduce((max, a) => Math.max(max, a.tcMinutes), 0);

      

      // Flow totals for pond-routed areas

      const flowTotals = selectedEvents.reduce((acc, event) => {

          acc[event] = results

            .filter(r => r.type === type && r.isIncluded && !(r.isBypass ?? false))

            .reduce((sum, r) => sum + r.results[event].peakFlowCfs, 0);

          return acc;

      }, {} as Record<ReturnPeriod, number>);



      // Bypass flow totals

      const bypassFlowTotals = selectedEvents.reduce((acc, event) => {

          acc[event] = results

            .filter(r => r.type === type && r.isIncluded && (r.isBypass ?? false))

            .reduce((sum, r) => sum + r.results[event].peakFlowCfs, 0);

          return acc;

      }, {} as Record<ReturnPeriod, number>);



      return { totalArea, weightedC, tcMinutes, flowTotals, bypassFlowTotals, bypassArea };

  }, [activeAreas, results, selectedEvents]);



  const existingTotals = useMemo(() => calculateTotals('existing'), [calculateTotals]);

  const proposedTotals = useMemo(() => calculateTotals('proposed'), [calculateTotals]);



  // Expose summarized totals to parent for pond/outfall design

  useEffect(() => {

    if (!onTotalsChange) return;

    onTotalsChange({ existing: existingTotals, proposed: proposedTotals });

  }, [existingTotals, proposedTotals, onTotalsChange]);



  // Handle import completion
  const handleImportComplete = useCallback((newAreas: DrainageArea[]) => {
    setAreas(newAreas);
    setImportMeta(getImportMetadata());
  }, []);

  // Helper to render a section table
  const renderSection = (title: string, type: 'existing' | 'proposed', totals: ReturnType<typeof calculateTotals>) => {
    const meta = importMeta[type];
    
    return (
      <div className="bg-card border border-border rounded-lg shadow-lg overflow-hidden flex flex-col mb-8">
        <div className="px-6 py-4 border-b border-border bg-slate-900/50 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <h3 className="font-semibold text-lg text-white flex items-center gap-2">
              {type === 'existing' ? <TableIcon className="w-5 h-5 text-gray-400" /> : <TableIcon className="w-5 h-5 text-primary" />}
              {title}
            </h3>
            {meta && (
              <div className="flex items-center gap-1.5 px-2 py-1 bg-primary/10 border border-primary/30 rounded text-xs text-primary" title={`Imported from ${meta.sourceDrawing || meta.sourceFile} on ${new Date(meta.importedAt).toLocaleDateString()}`}>
                <FileJson className="w-3 h-3" />
                <span>{meta.itemCount} from C3D</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setImportModalType(type)}
              className="flex items-center gap-1 bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary text-xs px-3 py-1.5 rounded transition-colors"
              title={`Import ${type} drainage areas from Civil 3D`}
              aria-label={`Import ${type} drainage areas from Civil 3D`}
            >
              <Upload className="w-3 h-3" /> Import C3D
            </button>
            <button 
              onClick={() => addArea(type)}
              className="flex items-center gap-1 bg-slate-800 hover:bg-slate-700 border border-border text-xs px-3 py-1.5 rounded transition-colors"
              title={`Add new ${type} drainage area`}
              aria-label={`Add new ${type} drainage area`}
            >
              <Plus className="w-3 h-3" /> Add Area
            </button>
          </div>
        </div>

       

       <div className="overflow-x-auto">

          <table className="w-full text-sm text-left border-collapse">

            <thead className="bg-slate-900/30 text-xs uppercase text-gray-400 font-medium">

              <tr>

                <th className="px-4 py-3 border-b border-border min-w-[50px] text-center">Inc.</th>

                <th className="px-4 py-3 border-b border-border min-w-[50px] text-center">Bypass</th>

                <th className="px-4 py-3 border-b border-border min-w-[150px]">Area Name</th>

                <th className="px-4 py-3 border-b border-border text-right min-w-[100px]">Area (ac)</th>

                <th className="px-4 py-3 border-b border-border text-right min-w-[100px]">C Factor</th>

                <th className="px-4 py-3 border-b border-border text-right min-w-[100px]">Tc (min)</th>

                

                {selectedEvents.map(event => (

                  <React.Fragment key={event}>

                     <th className="px-4 py-3 border-b border-l border-border text-center text-gray-500 w-[100px]">

                        I-{event}

                     </th>

                     <th className="px-4 py-3 border-b border-border text-right font-bold text-gray-300 w-[100px]">

                        Q-{event}

                     </th>

                  </React.Fragment>

                ))}

                

                <th className="px-4 py-3 border-b border-border w-[50px]"></th>

              </tr>

            </thead>

            <tbody className="divide-y divide-border">

              {activeResults.filter(r => r.type === type).map((row) => (

                <tr key={row.id} className={`hover:bg-white/5 transition-colors group ${!row.isIncluded ? 'opacity-50 bg-slate-900/20' : (row.isBypass ?? false) ? 'bg-stone-900/40' : ''}`}>

                  <td className="px-4 py-2 text-center">

                    <button 

                      onClick={() => toggleInclusion(row.id)}

                      className={`transition-colors p-1 rounded-full ${row.isIncluded ? 'text-primary hover:text-primary/80 bg-primary/10' : 'text-gray-600 hover:text-gray-400 bg-gray-800'}`}

                      title={row.isIncluded ? "Included in totals" : "Excluded from totals"}

                    >

                      <Waves className="w-4 h-4" />

                    </button>

                  </td>

                  <td className="px-4 py-2 text-center">

                    <button 

                      onClick={() => toggleBypass(row.id)}

                      className={`transition-colors p-1 rounded-full ${(row.isBypass ?? false) ? 'text-amber-400 hover:text-amber-300 bg-amber-500/20' : 'text-gray-600 hover:text-gray-400 bg-gray-800'}`}

                      title={(row.isBypass ?? false) ? "Bypass: Routes around pond" : "Routes to pond"}

                    >

                      <GitBranch className="w-4 h-4" />

                    </button>

                  </td>

                  <td className="px-4 py-2">

                    <input 

                      type="text" 

                      value={row.name}

                      onChange={(e) => updateArea(row.id, 'name', e.target.value)}

                      className="w-full bg-transparent border border-transparent hover:border-border focus:border-primary rounded px-2 py-1 outline-none transition-all"

                      title="Drainage area name"

                      aria-label="Drainage area name"

                    />

                  </td>

                  <td className="px-4 py-2 text-right">

                     <input 

                      type="number" step="0.01"

                      value={row.areaAcres}

                      onChange={(e) => updateArea(row.id, 'areaAcres', parseFloat(e.target.value) || 0)}

                      className="w-full text-right bg-transparent border border-transparent hover:border-border focus:border-primary rounded px-2 py-1 outline-none transition-all font-mono"

                      title="Area in acres"

                      aria-label="Area in acres"

                    />

                  </td>

                  <td className="px-4 py-2 text-right">

                     <input 

                      type="number" step="0.01" max="1"

                      value={row.cFactor}

                      onChange={(e) => updateArea(row.id, 'cFactor', parseFloat(e.target.value) || 0)}

                      className="w-full text-right bg-transparent border border-transparent hover:border-border focus:border-primary rounded px-2 py-1 outline-none transition-all font-mono"

                      title="Runoff coefficient (C-factor)"

                      aria-label="Runoff coefficient (C-factor)"

                    />

                  </td>

                  <td className="px-4 py-2 text-right">

                     <input 

                      type="number" 

                      value={row.tcMinutes}

                      onChange={(e) => updateArea(row.id, 'tcMinutes', parseFloat(e.target.value) || 0)}

                      className="w-full text-right bg-transparent border border-transparent hover:border-border focus:border-primary rounded px-2 py-1 outline-none transition-all font-mono"

                      title="Time of concentration in minutes"

                      aria-label="Time of concentration in minutes"

                    />

                  </td>



                  {selectedEvents.map(event => {

                    const eventResult = row.results?.[event];

                    return (

                    <React.Fragment key={event}>

                       <td className="px-4 py-2 text-center border-l border-border text-gray-500 font-mono text-xs">

                          {row.isIncluded && eventResult ? eventResult.intensity.toFixed(2) : '-'}

                       </td>

                       <td className="px-4 py-2 text-right font-mono font-medium text-primary">

                          {row.isIncluded && eventResult ? eventResult.peakFlowCfs.toFixed(2) : '-'}

                       </td>

                    </React.Fragment>

                  );

                  })}



                  <td className="px-4 py-2 text-center">

                    <button 

                      onClick={() => removeArea(row.id)}

                      className="text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"

                      title="Remove drainage area"

                      aria-label="Remove drainage area"

                    >

                      <Trash2 className="w-4 h-4" />

                    </button>

                  </td>

                </tr>

              ))}

               {/* Empty State for Section */}

               {activeResults.filter(r => r.type === type).length === 0 && (

                  <tr>

                    <td colSpan={8 + (selectedEvents.length * 2)} className="px-4 py-8 text-center text-gray-500 text-sm italic">

                      No drainage areas added yet.

                    </td>

                  </tr>

               )}

            </tbody>

            

            <tfoot className="bg-slate-900/80 border-t-2 border-border font-semibold">
                <tr>
                    <td colSpan={3} className="px-4 py-3 text-right uppercase text-xs text-gray-400">Pond Flow (Included, Non-Bypass):</td>
                    <td className="px-4 py-3 text-right font-mono text-white">{totals.totalArea.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right font-mono text-gray-300">{totals.weightedC.toFixed(2)}</td>
                    <td className="px-4 py-3 text-center text-gray-500">-</td>
                    {selectedEvents.map(event => (
                        <React.Fragment key={event}>
                            <td className="px-4 py-3 border-l border-border"></td>
                            <td className="px-4 py-3 text-right font-mono text-accent text-lg">
                                {(totals.flowTotals[event] ?? 0).toFixed(2)}
                            </td>
                        </React.Fragment>
                    ))}
                    <td></td>
                </tr>
                {/* Bypass totals row - only show if there are bypass areas */}
                {totals.bypassArea > 0 && (
                  <tr className="bg-stone-900/40">
                    <td colSpan={3} className="px-4 py-3 text-right uppercase text-xs text-amber-400">
                      <span className="flex items-center justify-end gap-1">
                        <GitBranch className="w-3 h-3" />
                        Bypass Flow:
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-amber-300">{totals.bypassArea.toFixed(2)}</td>
                    <td className="px-4 py-3 text-center text-gray-500">-</td>
                    <td className="px-4 py-3 text-center text-gray-500">-</td>
                    {selectedEvents.map(event => (
                        <React.Fragment key={event}>
                            <td className="px-4 py-3 border-l border-border"></td>
                            <td className="px-4 py-3 text-right font-mono text-amber-400 text-lg">
                                {(totals.bypassFlowTotals[event] ?? 0).toFixed(2)}
                            </td>
                        </React.Fragment>
                    ))}
                    <td></td>
                  </tr>
                )}
            </tfoot>
          </table>
        </div>
      </div>
    );
  };



  // Comparison Card - Flow Diagram Style
  const renderComparison = () => {
    const hasExistingBypass = existingTotals.bypassArea > 0;
    const hasProposedBypass = proposedTotals.bypassArea > 0;
    
    return (
     <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {selectedEvents.map(event => {
           // Existing flows
           const exPondFlow = existingTotals.flowTotals[event] ?? 0;
           const exBypassFlow = existingTotals.bypassFlowTotals[event] ?? 0;
           const exTotalFlow = exPondFlow + exBypassFlow;
           
           // Proposed flows
           const propPondFlow = proposedTotals.flowTotals[event] ?? 0;
           const propBypassFlow = proposedTotals.bypassFlowTotals[event] ?? 0;
           const propTotalFlow = propPondFlow + propBypassFlow;
           
           // Change calculations
           const diff = propTotalFlow - exTotalFlow;
           const isIncrease = diff > 0;
           
           // Allowable pond release = existing total - proposed bypass
           const allowablePondRelease = Math.max(0, exTotalFlow - propBypassFlow);
           
           // Design Point Target = Allowable Pond Release + Bypass
           const targetDesignPointFlow = allowablePondRelease + propBypassFlow;

           // Determine states for visualization
           const exState = hasExistingBypass ? 'split' : 'single';
           const propState = hasProposedBypass ? 'split' : 'single';

           return (
             <div key={event} className="bg-card border border-border rounded-xl shadow-sm overflow-hidden flex flex-col">
                {/* Header */}
                <div className="px-4 py-3 bg-slate-900/50 border-b border-border flex justify-between items-center">
                  <h4 className="text-gray-200 font-semibold">{event} Storm Event</h4>
                  <div className={`text-xs font-mono px-2 py-0.5 rounded ${isIncrease ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                    {isIncrease ? '+' : ''}{diff.toFixed(2)} cfs
                  </div>
                </div>
                
                <div className="p-5 flex-1 flex flex-col justify-center">
                  {/* 5-Column Grid: [Existing] [Arrow] [Proposed] [Arrow] [DesignPt] */}
                  <div className="grid grid-cols-[1fr_40px_1fr_40px_1fr] gap-2 items-center">
                    
                    {/* HEADERS */}
                    <div className="text-[10px] uppercase text-gray-500 font-medium text-center mb-2">Existing</div>
                    <div></div>
                    <div className="text-[10px] uppercase text-gray-500 font-medium text-center mb-2">Proposed</div>
                    <div></div>
                    <div className="text-[10px] uppercase text-gray-500 font-medium text-center mb-2">Design Pt</div>

                    {/* COLUMN 1: EXISTING */}
                    <div className="flex flex-col items-center justify-center gap-6 h-full min-h-[80px]">
                      {exState === 'single' ? (
                        <div className="flex flex-col items-center">
                           <div className="bg-slate-800 border border-slate-700 text-gray-300 px-3 py-1.5 rounded text-lg font-mono font-semibold min-w-[70px] text-center">
                             {exTotalFlow.toFixed(2)}
                           </div>
                           <span className="text-[9px] text-gray-500 mt-1">total</span>
                        </div>
                      ) : (
                        <>
                          <div className="flex flex-col items-center">
                             <div className="bg-slate-800 border border-slate-700 text-gray-300 px-2 py-1 rounded text-sm font-mono min-w-[60px] text-center">
                               {exPondFlow.toFixed(2)}
                             </div>
                             <span className="text-[9px] text-gray-600 mt-0.5">pond area</span>
                          </div>
                          <div className="flex flex-col items-center">
                             <div className="bg-slate-800 border border-slate-700 text-gray-300 px-2 py-1 rounded text-sm font-mono min-w-[60px] text-center">
                               {exBypassFlow.toFixed(2)}
                             </div>
                             <span className="text-[9px] text-gray-600 mt-0.5">bypass area</span>
                          </div>
                        </>
                      )}
                    </div>

                    {/* ARROW 1: EX -> PROP */}
                    <div className="h-full w-full relative">
                       <svg className="absolute inset-0 w-full h-full overflow-visible" viewBox="0 0 40 100" preserveAspectRatio="none">
                          {exState === 'single' && propState === 'single' && (
                            <path d="M 0 50 L 40 50" stroke="#4b5563" strokeWidth="1.5" fill="none" markerEnd="url(#arrowhead)" />
                          )}
                          {exState === 'single' && propState === 'split' && (
                            <>
                              <path d="M 0 50 C 20 50, 20 20, 40 20" stroke="#4b5563" strokeWidth="1.5" fill="none" />
                              <path d="M 0 50 C 20 50, 20 80, 40 80" stroke="#4b5563" strokeWidth="1.5" fill="none" />
                            </>
                          )}
                          {exState === 'split' && propState === 'split' && (
                            <>
                              <path d="M 0 20 L 40 20" stroke="#4b5563" strokeWidth="1.5" fill="none" />
                              <path d="M 0 80 L 40 80" stroke="#4b5563" strokeWidth="1.5" fill="none" />
                            </>
                          )}
                          {exState === 'split' && propState === 'single' && (
                            <>
                              <path d="M 0 20 C 20 20, 20 50, 40 50" stroke="#4b5563" strokeWidth="1.5" fill="none" />
                              <path d="M 0 80 C 20 80, 20 50, 40 50" stroke="#4b5563" strokeWidth="1.5" fill="none" />
                            </>
                          )}
                       </svg>
                    </div>

                    {/* COLUMN 2: PROPOSED */}
                    <div className="flex flex-col items-center justify-center gap-6 h-full min-h-[80px]">
                      {propState === 'single' ? (
                        <div className="flex gap-2 items-center">
                            <div className="flex flex-col items-center">
                               <div className="bg-blue-900/20 border border-blue-800/50 text-blue-200 px-2 py-1.5 rounded text-lg font-mono font-semibold min-w-[60px] text-center">
                                 {propTotalFlow.toFixed(2)}
                               </div>
                               <span className="text-[9px] text-blue-500/70 mt-1">pond inflow</span>
                            </div>
                            <div className="h-8 w-px bg-gray-700 mx-1"></div>
                            <div className="flex flex-col items-center">
                               <div className="bg-emerald-900/20 border border-emerald-800/50 text-emerald-200 px-2 py-1.5 rounded text-lg font-mono font-semibold min-w-[60px] text-center">
                                 {allowablePondRelease.toFixed(2)}
                               </div>
                               <span className="text-[9px] text-emerald-500/70 mt-1">allowable</span>
                            </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex gap-2 items-center">
                              <div className="flex flex-col items-center">
                                 <div className="bg-blue-900/20 border border-blue-800/50 text-blue-200 px-2 py-1 rounded text-sm font-mono min-w-[50px] text-center shadow-[0_0_10px_rgba(59,130,246,0.1)]">
                                   {propPondFlow.toFixed(2)}
                                 </div>
                                 <span className="text-[9px] text-blue-500/70 mt-0.5">pond inflow</span>
                              </div>
                              <div className="h-6 w-px bg-gray-700 mx-1"></div>
                              <div className="flex flex-col items-center">
                                 <div className="bg-emerald-900/20 border border-emerald-800/50 text-emerald-200 px-2 py-1 rounded text-sm font-mono min-w-[50px] text-center shadow-[0_0_10px_rgba(16,185,129,0.1)]">
                                   {allowablePondRelease.toFixed(2)}
                                 </div>
                                 <span className="text-[9px] text-emerald-500/70 mt-0.5">allowable</span>
                              </div>
                          </div>
                          
                          <div className="flex flex-col items-center">
                             <div className="bg-stone-900/40 border border-amber-800/50 text-amber-200 px-2 py-1 rounded text-sm font-mono min-w-[60px] text-center shadow-[0_0_10px_rgba(245,158,11,0.1)]">
                               {propBypassFlow.toFixed(2)}
                             </div>
                             <span className="text-[9px] text-amber-500/70 mt-0.5">bypass flow</span>
                          </div>
                        </>
                      )}
                    </div>

                    {/* ARROW 2: PROP -> DESIGN PT */}
                    <div className="h-full w-full relative">
                       <svg className="absolute inset-0 w-full h-full overflow-visible" viewBox="0 0 40 100" preserveAspectRatio="none">
                          {propState === 'single' ? (
                            <path d="M 0 50 L 40 50" stroke="#3b82f6" strokeWidth="2" fill="none" markerEnd="url(#arrowhead-blue)" />
                          ) : (
                            <>
                              <path d="M 0 20 C 20 20, 20 50, 40 50" stroke="#3b82f6" strokeWidth="2" fill="none" />
                              <path d="M 0 80 C 20 80, 20 50, 40 50" stroke="#f59e0b" strokeWidth="2" strokeDasharray="4,2" fill="none" />
                            </>
                          )}
                          
                          {/* Definitions for markers */}
                          <defs>
                            <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                              <polygon points="0 0, 10 3.5, 0 7" fill="#4b5563" />
                            </marker>
                            <marker id="arrowhead-blue" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                              <polygon points="0 0, 10 3.5, 0 7" fill="#3b82f6" />
                            </marker>
                          </defs>
                       </svg>
                    </div>

                    {/* COLUMN 3: DESIGN POINT */}
                    <div className="flex flex-col items-center justify-center h-full">
                       <div className="bg-slate-900 border border-primary/30 text-primary px-3 py-2 rounded-lg text-xl font-mono font-bold min-w-[70px] text-center shadow-lg">
                         {targetDesignPointFlow.toFixed(2)}
                       </div>
                       <span className="text-[9px] text-gray-500 mt-1">design pt</span>
                    </div>

                  </div>
                  
                </div>
             </div>
           );
        })}
     </div>
    );
  };


  return (
    <div className="p-8 h-full flex flex-col max-w-[1600px] mx-auto overflow-y-auto">
      
      {/* Import Modal */}
      {importModalType && (
        <DrainageImport
          targetType={importModalType}
          currentAreas={areas}
          onImport={handleImportComplete}
          onClose={() => setImportModalType(null)}
          onReturnPeriodsDetected={onReturnPeriodsDetected}
        />
      )}

      <div className="flex items-center justify-between mb-8">

        <div className="flex items-center gap-3">

          <div className="p-2 bg-primary/10 rounded-full text-primary">

            <Calculator className="w-6 h-6" />

          </div>

          <div>

            <h2 className="text-xl font-semibold">Drainage Area Analysis</h2>

            <p className="text-sm text-gray-400">Comparison of Pre-Development vs. Post-Development Runoff</p>

          </div>

        </div>

      </div>



              {/* Design Point Tabs */}
        <div className="flex items-end pl-4 -mb-[1px] relative z-10 flex-wrap gap-1 mt-2">
           {designPoints.map((dp) => {
              const isActive = dp.id === activeDpId;
              return (
                    <button
                       key={dp.id}
                       onClick={() => setActiveDpId(dp.id)}
                       onDoubleClick={() => {
                           const newName = window.prompt('Enter a new name for this Design Point:', dp.name);
                           if (newName && newName.trim()) {
                               setDesignPoints(prev => prev.map(d => d.id === dp.id ? { ...d, name: newName.trim() } : d));     
                           }
                       }}
                       title="Double-click to rename"
                       className={`
                         relative px-6 pt-3 text-sm font-medium transition-all duration-200 outline-none
                         border select-none border-b-0 rounded-t-[14px] flex items-center justify-center min-w-[140px]
                         ${isActive 
                           ? 'bg-slate-900 border-slate-700/80 text-primary z-20 pb-[13px] shadow-[0_-4px_10px_rgba(0,0,0,0.1)]' 
                           : 'bg-slate-800/80 border-slate-700/50 text-slate-400 hover:bg-slate-800 hover:text-slate-200 z-10 mt-1 pb-2 shadow-[inset_0_-10px_10px_rgba(0,0,0,0.1)]'
                         }
                       `}
                    >
                       <span>{dp.name}</span>
                    </button>
              )
           })}
           
           <div className="ml-1 mb-2 relative z-0">
               <button onClick={addDesignPoint} className="p-2 text-slate-400 hover:text-primary bg-slate-800/80 shadow-sm border border-slate-700/50 hover:bg-slate-800 hover:border-slate-600 rounded-lg transition-all" title="Add Design Point">
                  <Plus className="w-5 h-5" />
               </button>
           </div>
        </div>

       {/* Main Container Panel */}
       <div className="bg-slate-900 border border-slate-700/80 rounded-b-xl rounded-tr-xl p-6 relative z-0 flex flex-col gap-6 shadow-2xl mb-8">

           {/* Active DP Note */}
           <div className="flex justify-between items-start gap-4">
               <div className="flex-1 max-w-2xl bg-slate-950/50 rounded-lg border border-slate-800 p-2.5 flex gap-2">
                  <input
                     value={activeDp?.note || ''}
                     onChange={(e) => updateDpNote(activeDpId, e.target.value)}
                     placeholder="Add a note or description for this design point..."
                     className="w-full bg-transparent border-none text-slate-300 text-sm outline-none placeholder:text-slate-600 px-2"
                  />
               </div>
               <button 
                 onClick={() => {
                    if(designPoints.length > 1 && window.confirm('Delete this Design Point?')) {
                        const newDps = designPoints.filter(d => d.id !== activeDpId);
                        setDesignPoints(newDps);
                        setActiveDpId(newDps[0].id);
                    }
                 }}
                 className={`p-2.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-400/10 transition-colors border border-transparent hover:border-red-400/20 ${designPoints.length <= 1 ? 'opacity-0 pointer-events-none' : ''}`}
                 title="Delete Design Point"
               >
                 <Trash2 className="w-4 h-4" />
               </button>
           </div>

      {/* Flow Comparison Summary */}

      {renderComparison()}

      {/* Existing Conditions Table */}

      {renderSection('Existing Drainage Areas', 'existing', existingTotals)}



      {/* Proposed Conditions Table */}

      {renderSection('Proposed Drainage Areas', 'proposed', proposedTotals)}
      
      </div>
      
    </div>
  );
}

