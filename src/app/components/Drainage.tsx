'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Plus, Trash2, Calculator, Table as TableIcon, ArrowRight, Waves, Upload, FileJson } from 'lucide-react';
import { ReturnPeriod } from '@/utils/atlas14';
import type { DrainageArea } from '@/utils/drainageCalculations';
import { RationalMethod } from '@/utils/drainageCalculations';
import DrainageImport from './DrainageImport';
import { getImportMetadata, DrainageImportInfo } from '@/utils/stormforgeImport';



type DrainageTotals = {
  totalArea: number;
  weightedC: number;
  tcMinutes: number;
  flowTotals: Record<ReturnPeriod, number>;
};

const DEFAULT_AREAS: DrainageArea[] = [
  { id: '1', type: 'existing', name: 'Ex. Area 1', areaAcres: 5.0, cFactor: 0.35, tcMinutes: 15, isIncluded: true },
  { id: '2', type: 'existing', name: 'Ex. Area 2', areaAcres: 2.0, cFactor: 0.40, tcMinutes: 12, isIncluded: true },
  { id: '3', type: 'proposed', name: 'Prop. Roof', areaAcres: 3.5, cFactor: 0.90, tcMinutes: 10, isIncluded: true },
  { id: '4', type: 'proposed', name: 'Prop. Pavement', areaAcres: 1.5, cFactor: 0.85, tcMinutes: 10, isIncluded: true },
  { id: '5', type: 'proposed', name: 'Prop. Landscape', areaAcres: 2.0, cFactor: 0.30, tcMinutes: 20, isIncluded: true },
];



interface DrainageProps {

  cityId: number;

  selectedEvents: ReturnPeriod[];

  onTotalsChange?: (totals: { existing: DrainageTotals; proposed: DrainageTotals }) => void;

}



export default function Drainage({ cityId, selectedEvents, onTotalsChange }: DrainageProps) {
  // --- State ---
  const [importModalType, setImportModalType] = useState<'existing' | 'proposed' | null>(null);
  
  // Load import metadata directly during initialization (no effect needed)
  const [importMeta, setImportMeta] = useState<{ existing: DrainageImportInfo | null; proposed: DrainageImportInfo | null }>(() => {
    if (typeof window === 'undefined') return { existing: null, proposed: null };
    return getImportMetadata();
  });

  const [areas, setAreas] = useState<DrainageArea[]>(() => {
    if (typeof window === 'undefined') {
      return DEFAULT_AREAS;
    }
    try {
      const raw = window.localStorage.getItem('wds-stormforge-drainage-areas');
      if (!raw) return DEFAULT_AREAS;
      const parsed = JSON.parse(raw) as DrainageArea[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
      return DEFAULT_AREAS;
    } catch (error) {
      console.error('Error loading saved drainage areas:', error);
      return DEFAULT_AREAS;
    }
  });



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



  useEffect(() => {

    if (cityId === 0) {

      setResults([]);

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

      isIncluded: true

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



  // Toggle inclusion

  const toggleInclusion = (id: string) => {

    setAreas(areas.map(a => {

       if (a.id === id) return { ...a, isIncluded: !a.isIncluded };

       return a;

    }));

  };



  // Calculate Totals for a specific type

  const calculateTotals = useCallback((type: 'existing' | 'proposed'): DrainageTotals => {

      const typeAreas = areas.filter(a => a.type === type && a.isIncluded); // Only sum included areas

      const totalArea = typeAreas.reduce((sum, a) => sum + a.areaAcres, 0);

      const weightedC = totalArea > 0 ? typeAreas.reduce((sum, a) => sum + (a.cFactor * a.areaAcres), 0) / totalArea : 0;

      const tcMinutes = typeAreas.reduce((max, a) => Math.max(max, a.tcMinutes), 0);

      

      const flowTotals = selectedEvents.reduce((acc, event) => {

          acc[event] = results

            .filter(r => r.type === type && r.isIncluded) // Only sum included results

            .reduce((sum, r) => sum + r.results[event].peakFlowCfs, 0);

          return acc;

      }, {} as Record<ReturnPeriod, number>);



      return { totalArea, weightedC, tcMinutes, flowTotals };

  }, [areas, results, selectedEvents]);



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

              {results.filter(r => r.type === type).map((row) => (

                <tr key={row.id} className={`hover:bg-white/5 transition-colors group ${!row.isIncluded ? 'opacity-50 bg-slate-900/20' : ''}`}>

                  <td className="px-4 py-2 text-center">

                    <button 

                      onClick={() => toggleInclusion(row.id)}

                      className={`transition-colors p-1 rounded-full ${row.isIncluded ? 'text-primary hover:text-primary/80 bg-primary/10' : 'text-gray-600 hover:text-gray-400 bg-gray-800'}`}

                      title={row.isIncluded ? "Included in totals" : "Excluded from totals"}

                    >

                      <Waves className="w-4 h-4" />

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



                  {selectedEvents.map(event => (

                    <React.Fragment key={event}>

                       <td className="px-4 py-2 text-center border-l border-border text-gray-500 font-mono text-xs">

                          {row.isIncluded ? row.results[event].intensity.toFixed(2) : '-'}

                       </td>

                       <td className="px-4 py-2 text-right font-mono font-medium text-primary">

                          {row.isIncluded ? row.results[event].peakFlowCfs.toFixed(2) : '-'}

                       </td>

                    </React.Fragment>

                  ))}



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

               {results.filter(r => r.type === type).length === 0 && (

                  <tr>

                    <td colSpan={7 + (selectedEvents.length * 2)} className="px-4 py-8 text-center text-gray-500 text-sm italic">

                      No drainage areas added yet.

                    </td>

                  </tr>

               )}

            </tbody>

            

            <tfoot className="bg-slate-900/80 border-t-2 border-border font-semibold">

                <tr>

                    <td colSpan={2} className="px-4 py-3 text-right uppercase text-xs text-gray-400">Total {type === 'existing' ? 'Ex.' : 'Prop.'} (Included):</td>

                    <td className="px-4 py-3 text-right font-mono text-white">{totals.totalArea.toFixed(2)}</td>

                    <td className="px-4 py-3 text-right font-mono text-gray-300">{totals.weightedC.toFixed(2)}</td>

                    <td className="px-4 py-3 text-center text-gray-500">-</td>

                    {selectedEvents.map(event => (

                        <React.Fragment key={event}>

                            <td className="px-4 py-3 border-l border-border"></td>

                            <td className="px-4 py-3 text-right font-mono text-accent text-lg">

                                {totals.flowTotals[event].toFixed(2)}

                            </td>

                        </React.Fragment>

                    ))}

                    <td></td>

                </tr>

            </tfoot>
          </table>
        </div>
      </div>
    );
  };



  // Comparison Card

  const renderComparison = () => (

     <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">

        {selectedEvents.map(event => {

           const exFlow = existingTotals.flowTotals[event];

           const propFlow = proposedTotals.flowTotals[event];

           const diff = propFlow - exFlow;

           const isIncrease = diff > 0;

           

           return (

             <div key={event} className="bg-card border border-border p-4 rounded-lg shadow-md">

                <h4 className="text-gray-400 text-xs uppercase font-bold mb-2">{event} Storm Event</h4>

                <div className="flex justify-between items-end mb-2">

                   <div>

                      <div className="text-xs text-gray-500">Existing</div>

                      <div className="font-mono text-lg text-gray-300">{exFlow.toFixed(2)} cfs</div>

                   </div>

                   <ArrowRight className="w-4 h-4 text-gray-600 mb-1.5" />

                   <div className="text-right">

                      <div className="text-xs text-gray-500">Proposed</div>

                      <div className="font-mono text-lg text-white">{propFlow.toFixed(2)} cfs</div>

                   </div>

                </div>

                <div className={`text-sm font-medium flex items-center gap-1 ${isIncrease ? 'text-red-400' : 'text-green-400'}`}>

                   {isIncrease ? '+' : ''}{diff.toFixed(2)} cfs

                   <span className="text-xs font-normal text-gray-500 ml-1">({isIncrease ? 'Increase' : 'Decrease'})</span>

                </div>

             </div>

           );

        })}

     </div>

  );



  return (
    <div className="p-8 h-full flex flex-col max-w-[1600px] mx-auto overflow-y-auto">
      
      {/* Import Modal */}
      {importModalType && (
        <DrainageImport
          targetType={importModalType}
          currentAreas={areas}
          onImport={handleImportComplete}
          onClose={() => setImportModalType(null)}
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



      {/* Flow Comparison Summary */}

      {renderComparison()}



      {/* Existing Conditions Table */}

      {renderSection('Existing Drainage Areas', 'existing', existingTotals)}



      {/* Proposed Conditions Table */}

      {renderSection('Proposed Drainage Areas', 'proposed', proposedTotals)}
      
    </div>
  );
}

