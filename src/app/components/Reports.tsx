'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { FileText, Printer, FileSpreadsheet } from 'lucide-react';
import { ReturnPeriod, City, InterpolationMethod } from '@/utils/atlas14';
import { ModifiedRationalResult } from '@/utils/rationalMethod';
import { OutfallStructure, calculateTotalDischarge } from '@/utils/hydraulics';

interface ReportsProps {
  cityId: number;
  selectedCity: City | null;
  selectedEvents: ReturnPeriod[];
  interpolationMethod: InterpolationMethod;
  drainageTotals: {
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
  pondResults: ModifiedRationalResult[];
  pondDims: { length: number; width: number; depth: number };
  pondInvertElevation: number;
}

const STORAGE_KEY_STRUCTURES = 'outfallDesigner_structures';
const STORAGE_KEY_PLATE_SIZE = 'outfallDesigner_plateSize';
const STORAGE_KEY_TAILWATER = 'outfallDesigner_tailwater';

export default function Reports({
  selectedCity,
  selectedEvents,
  interpolationMethod,
  drainageTotals,
  pondResults,
  pondDims,
  pondInvertElevation
}: ReportsProps) {
  const [outfallStructures, setOutfallStructures] = useState<OutfallStructure[]>([]);
  const [plateSize, setPlateSize] = useState({ width: 4, height: 6 });
  const [tailwaterElevations, setTailwaterElevations] = useState<Record<string, number>>({});
  const [projectName, setProjectName] = useState('');
  const [projectNumber, setProjectNumber] = useState('');
  const [engineerName, setEngineerName] = useState('');
  const [date, setDate] = useState(new Date().toLocaleDateString());

  // Load outfall data from localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const storedStructures = localStorage.getItem(STORAGE_KEY_STRUCTURES);
    if (storedStructures) {
      try {
        const parsed = JSON.parse(storedStructures);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setOutfallStructures(parsed);
        }
      } catch (e) {
        console.error('Failed to parse stored structures:', e);
      }
    }

    const storedPlateSize = localStorage.getItem(STORAGE_KEY_PLATE_SIZE);
    if (storedPlateSize) {
      try {
        const parsed = JSON.parse(storedPlateSize);
        if (parsed && typeof parsed.width === 'number' && typeof parsed.height === 'number') {
          setPlateSize(parsed);
        }
      } catch (e) {
        console.error('Failed to parse stored plate size:', e);
      }
    }

    const storedTailwater = localStorage.getItem(STORAGE_KEY_TAILWATER);
    if (storedTailwater) {
      try {
        const parsed = JSON.parse(storedTailwater);
        if (typeof parsed === 'object' && parsed !== null) {
          setTailwaterElevations(parsed);
        }
      } catch (e) {
        console.error('Failed to parse stored tailwater:', e);
      }
    }
  }, []);

  // Calculate pond values
  const pondAreaSqFt = pondDims.length * pondDims.width;
  const pondCapacity = pondDims.length * pondDims.width * pondDims.depth;
  const pondTopElevation = pondInvertElevation + pondDims.depth;

  const getWSE = useCallback((volumeCf: number) => {
    return pondInvertElevation + (volumeCf / pondAreaSqFt);
  }, [pondInvertElevation, pondAreaSqFt]);

  const outfallSummary = useMemo(() => {
    return pondResults.map(res => {
      const wse = getWSE(res.requiredStorageCf);
      const waterDepth = wse - pondInvertElevation;
      const freeboard = pondTopElevation - wse;
      const tailwater = tailwaterElevations[res.stormEvent];
      const { totalDischarge, details } = calculateTotalDischarge(outfallStructures, wse, tailwater);
      const isPassing = totalDischarge <= res.allowableReleaseRateCfs;
      const hasAdequateFreeboard = freeboard >= 1.0;
      return { res, wse, waterDepth, freeboard, totalDischarge, details, isPassing, hasAdequateFreeboard, tailwater };
    });
  }, [pondResults, outfallStructures, tailwaterElevations, pondInvertElevation, pondTopElevation, getWSE]);

  const controllingStorm = useMemo(() => {
    if (pondResults.length === 0) return null;
    return pondResults.reduce((max, r) => r.requiredStorageCf > max.requiredStorageCf ? r : max, pondResults[0]);
  }, [pondResults]);

  // Print handler
  const handlePrint = () => {
    window.print();
  };

  // Helper to convert array to CSV string
  const arrayToCSV = (data: (string | number)[][]): string => {
    return data.map(row => 
      row.map(cell => {
        const str = String(cell);
        // Escape quotes and wrap in quotes if contains comma or quote
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      }).join(',')
    ).join('\n');
  };

  // Helper to download CSV file
  const downloadCSV = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  // Excel/CSV Export handler - exports multiple CSV files
  const handleExportExcel = () => {
    const baseFilename = `${projectName || 'StormwaterReport'}_${projectNumber || 'Draft'}_${date.replace(/\//g, '-')}`;

    // Combined report CSV
    const allData: (string | number)[][] = [];
    
    // Project Info Section
    allData.push(['STORMWATER DETENTION POND DESIGN REPORT']);
    allData.push(['']);
    allData.push(['PROJECT INFORMATION']);
    allData.push(['Project Name', projectName || 'N/A']);
    allData.push(['Project Number', projectNumber || 'N/A']);
    allData.push(['Engineer', engineerName || 'N/A']);
    allData.push(['Date', date]);
    allData.push(['']);
    allData.push(['SITE DATA']);
    allData.push(['Location', selectedCity ? `${selectedCity.name}, ${selectedCity.state}` : 'N/A']);
    allData.push(['Rainfall Data Source', 'NOAA Atlas 14']);
    allData.push(['Interpolation Method', interpolationMethod === 'log-log' ? 'Log-Log' : 'Linear']);
    allData.push(['Design Storm Events', selectedEvents.map(e => e.toUpperCase()).join(', ')]);
    allData.push(['']);

    // Drainage Area Analysis
    if (drainageTotals) {
      allData.push(['DRAINAGE AREA ANALYSIS']);
      allData.push(['']);
      allData.push(['EXISTING CONDITIONS']);
      allData.push(['Total Area (acres)', drainageTotals.existing.totalArea.toFixed(2)]);
      allData.push(['Weighted C Factor', drainageTotals.existing.weightedC.toFixed(3)]);
      allData.push(['Time of Concentration (min)', drainageTotals.existing.tcMinutes]);
      allData.push(['']);
      allData.push(['PROPOSED CONDITIONS']);
      allData.push(['Total Area (acres)', drainageTotals.proposed.totalArea.toFixed(2)]);
      allData.push(['Weighted C Factor', drainageTotals.proposed.weightedC.toFixed(3)]);
      allData.push(['Time of Concentration (min)', drainageTotals.proposed.tcMinutes]);
      allData.push(['']);
      allData.push(['PEAK FLOW COMPARISON']);
      allData.push(['Storm Event', 'Existing Q (cfs)', 'Proposed Q (cfs)', 'Increase (cfs)']);
      selectedEvents.forEach(event => {
        const existing = drainageTotals.existing.flowTotals[event] || 0;
        const proposed = drainageTotals.proposed.flowTotals[event] || 0;
        allData.push([event.toUpperCase(), existing.toFixed(2), proposed.toFixed(2), (proposed - existing).toFixed(2)]);
      });
      allData.push(['']);
    }

    // Pond Design
    allData.push(['DETENTION POND DESIGN']);
    allData.push(['']);
    allData.push(['POND GEOMETRY']);
    allData.push(['Length (ft)', pondDims.length.toFixed(1)]);
    allData.push(['Width (ft)', pondDims.width.toFixed(1)]);
    allData.push(['Depth (ft)', pondDims.depth.toFixed(1)]);
    allData.push(['Surface Area (sq ft)', pondAreaSqFt]);
    allData.push(['Pond Capacity (cf)', pondCapacity]);
    allData.push(['Invert Elevation (ft)', pondInvertElevation.toFixed(2)]);
    allData.push(['Top Elevation (ft)', pondTopElevation.toFixed(2)]);
    allData.push(['']);
    allData.push(['STORAGE REQUIREMENTS']);
    allData.push(['Storm Event', 'Required Storage (cf)', 'Water Depth (ft)', 'Critical Duration (min)', 'Peak Inflow (cfs)', 'Allowable Q (cfs)', 'Status']);
    pondResults.forEach(r => {
      const waterDepth = r.requiredStorageCf / pondAreaSqFt;
      const status = r.requiredStorageCf > pondCapacity ? 'UNDERSIZED' : 'OK';
      allData.push([r.stormEvent.toUpperCase(), Math.round(r.requiredStorageCf), waterDepth.toFixed(2), r.criticalDurationMinutes, r.peakInflowCfs.toFixed(2), r.allowableReleaseRateCfs.toFixed(2), status]);
    });
    if (controllingStorm) {
      allData.push(['']);
      allData.push(['CONTROLLING STORM', controllingStorm.stormEvent.toUpperCase()]);
      allData.push(['Required Storage (cf)', Math.round(controllingStorm.requiredStorageCf)]);
      allData.push(['Utilization (%)', ((controllingStorm.requiredStorageCf / pondCapacity) * 100).toFixed(1)]);
    }
    allData.push(['']);

    // Outfall Design
    if (outfallStructures.length > 0) {
      allData.push(['OUTFALL STRUCTURE DESIGN']);
      allData.push(['']);
      allData.push(['ORIFICE PLATE CONFIGURATION']);
      allData.push(['Plate Width (ft)', plateSize.width.toFixed(1)]);
      allData.push(['Plate Height (ft)', plateSize.height.toFixed(1)]);
      allData.push(['Plate Area (sq ft)', (plateSize.width * plateSize.height).toFixed(1)]);
      allData.push(['']);
      allData.push(['STRUCTURE SCHEDULE']);
      allData.push(['Stage', 'Type', 'Invert El. (ft)', 'Diameter (ft)', 'Width (ft)', 'Height (ft)', 'Coeff. (C)']);
      outfallStructures.forEach(s => {
        allData.push([
          `#${s.id}`,
          s.type,
          s.invertElevation.toFixed(2),
          s.type === 'circular' ? (s.diameterFt?.toFixed(2) || 'N/A') : 'N/A',
          s.type === 'rectangular' ? (s.widthFt?.toFixed(2) || 'N/A') : 'N/A',
          s.type === 'rectangular' ? (s.heightFt?.toFixed(2) || 'N/A') : 'N/A',
          s.dischargeCoefficient.toFixed(2)
        ]);
      });
      allData.push(['']);
      allData.push(['DISCHARGE PERFORMANCE']);
      allData.push(['Storm Event', 'WSE (ft)', 'Water Depth (ft)', 'Freeboard (ft)', 'Allowable Q (cfs)', 'Actual Q (cfs)', 'Status']);
      outfallSummary.forEach(d => {
        allData.push([
          d.res.stormEvent.toUpperCase(),
          d.wse.toFixed(2),
          d.waterDepth.toFixed(2),
          d.freeboard.toFixed(2),
          d.res.allowableReleaseRateCfs.toFixed(2),
          d.totalDischarge.toFixed(2),
          d.isPassing && d.hasAdequateFreeboard ? 'PASS' : 'FAIL'
        ]);
      });
    }

    // Download the combined CSV (opens in Excel)
    downloadCSV(arrayToCSV(allData), `${baseFilename}.csv`);
  };

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Controls - Hidden when printing */}
      <div className="mb-6 print:hidden flex items-center justify-between bg-card border border-border rounded-lg p-4">
        <div className="flex items-center gap-3">
          <FileText className="w-6 h-6 text-primary" />
          <div>
            <h2 className="text-xl font-semibold">Engineering Report</h2>
            <p className="text-sm text-gray-400">Professional format for design submittals</p>
          </div>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleExportExcel}
            aria-label="Export CSV"
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Export CSV
          </button>
          <button
            onClick={handlePrint}
            aria-label="Print or save as PDF"
            className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            <Printer className="w-4 h-4" />
            Print / PDF
          </button>
        </div>
      </div>

      {/* Engineering Report - Grayscale Professional Style */}
      <div id="report-content" className="bg-white text-black print:bg-white">
        
        {/* Header */}
        <div className="border-b-2 border-black pb-4 mb-6">
          <h1 className="text-2xl font-bold text-center uppercase tracking-wide">
            Stormwater Detention Pond Design Report
          </h1>
        </div>

        {/* Project Info Grid */}
        <div className="grid grid-cols-2 gap-x-8 gap-y-2 mb-8 text-sm">
          <div className="flex">
            <span className="font-bold w-32">Project:</span>
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="Project Name"
              aria-label="Project name"
              className="flex-1 border-b border-gray-400 bg-transparent outline-none print:border-0"
            />
          </div>
          <div className="flex">
            <span className="font-bold w-32">Project No.:</span>
            <input
              type="text"
              value={projectNumber}
              onChange={(e) => setProjectNumber(e.target.value)}
              placeholder="Project Number"
              aria-label="Project number"
              className="flex-1 border-b border-gray-400 bg-transparent outline-none print:border-0"
            />
          </div>
          <div className="flex">
            <span className="font-bold w-32">Engineer:</span>
            <input
              type="text"
              value={engineerName}
              onChange={(e) => setEngineerName(e.target.value)}
              placeholder="Engineer Name"
              aria-label="Engineer name"
              className="flex-1 border-b border-gray-400 bg-transparent outline-none print:border-0"
            />
          </div>
          <div className="flex">
            <span className="font-bold w-32">Date:</span>
            <input
              type="text"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="flex-1 border-b border-gray-400 bg-transparent outline-none print:border-0"
              title="Report date"
              aria-label="Report date"
            />
          </div>
        </div>

        {/* Section 1: Project Information */}
        <section className="mb-8">
          <h2 className="text-lg font-bold border-b border-black pb-1 mb-4 uppercase">
            1. Project Information
          </h2>
          <table className="w-full text-sm border-collapse">
            <tbody>
              <tr>
                <td className="py-1 font-semibold w-48">Location:</td>
                <td className="py-1">{selectedCity ? `${selectedCity.name}, ${selectedCity.state}` : 'Not specified'}</td>
              </tr>
              <tr>
                <td className="py-1 font-semibold">Rainfall Data Source:</td>
                <td className="py-1">NOAA Atlas 14</td>
              </tr>
              <tr>
                <td className="py-1 font-semibold">Interpolation Method:</td>
                <td className="py-1">{interpolationMethod === 'log-log' ? 'Log-Log' : 'Linear'}</td>
              </tr>
              <tr>
                <td className="py-1 font-semibold">Design Storm Events:</td>
                <td className="py-1">{selectedEvents.map(e => e.toUpperCase()).join(', ')}</td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* Section 2: Drainage Area Analysis */}
        {drainageTotals && (
          <section className="mb-8">
            <h2 className="text-lg font-bold border-b border-black pb-1 mb-4 uppercase">
              2. Drainage Area Analysis
            </h2>
            
            <div className="grid grid-cols-2 gap-8 mb-4 text-sm">
              <div>
                <h3 className="font-bold mb-2">Existing Conditions</h3>
                <table className="w-full">
                  <tbody>
                    <tr><td className="py-0.5">Total Area:</td><td className="py-0.5 text-right font-mono">{drainageTotals.existing.totalArea.toFixed(2)} ac</td></tr>
                    <tr><td className="py-0.5">Weighted C:</td><td className="py-0.5 text-right font-mono">{drainageTotals.existing.weightedC.toFixed(3)}</td></tr>
                    <tr><td className="py-0.5">Tc:</td><td className="py-0.5 text-right font-mono">{drainageTotals.existing.tcMinutes} min</td></tr>
                  </tbody>
                </table>
              </div>
              <div>
                <h3 className="font-bold mb-2">Proposed Conditions</h3>
                <table className="w-full">
                  <tbody>
                    <tr><td className="py-0.5">Total Area:</td><td className="py-0.5 text-right font-mono">{drainageTotals.proposed.totalArea.toFixed(2)} ac</td></tr>
                    <tr><td className="py-0.5">Weighted C:</td><td className="py-0.5 text-right font-mono">{drainageTotals.proposed.weightedC.toFixed(3)}</td></tr>
                    <tr><td className="py-0.5">Tc:</td><td className="py-0.5 text-right font-mono">{drainageTotals.proposed.tcMinutes} min</td></tr>
                  </tbody>
                </table>
              </div>
            </div>

            <h3 className="font-bold mb-2 text-sm">Table 2-1: Peak Flow Comparison</h3>
            <table className="w-full text-sm border border-black">
              <thead>
                <tr className="bg-gray-200">
                  <th className="border border-black px-3 py-1 text-left">Storm Event</th>
                  <th className="border border-black px-3 py-1 text-right">Existing Q (cfs)</th>
                  <th className="border border-black px-3 py-1 text-right">Proposed Q (cfs)</th>
                  <th className="border border-black px-3 py-1 text-right">ΔQ (cfs)</th>
                </tr>
              </thead>
              <tbody>
                {selectedEvents.map(event => {
                  const existing = drainageTotals.existing.flowTotals[event] || 0;
                  const proposed = drainageTotals.proposed.flowTotals[event] || 0;
                  const increase = proposed - existing;
                  return (
                    <tr key={event}>
                      <td className="border border-black px-3 py-1">{event.toUpperCase()}</td>
                      <td className="border border-black px-3 py-1 text-right font-mono">{existing.toFixed(2)}</td>
                      <td className="border border-black px-3 py-1 text-right font-mono">{proposed.toFixed(2)}</td>
                      <td className="border border-black px-3 py-1 text-right font-mono">{increase > 0 ? '+' : ''}{increase.toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        )}

        {/* Section 3: Pond Design */}
        <section className="mb-8">
          <h2 className="text-lg font-bold border-b border-black pb-1 mb-4 uppercase">
            3. Detention Pond Design
          </h2>

          <h3 className="font-bold mb-2 text-sm">Table 3-1: Pond Geometry</h3>
          <table className="w-full text-sm border border-black mb-4">
            <tbody>
              <tr><td className="border border-black px-3 py-1 bg-gray-100 font-semibold w-48">Length</td><td className="border border-black px-3 py-1 font-mono">{pondDims.length.toFixed(1)} ft</td></tr>
              <tr><td className="border border-black px-3 py-1 bg-gray-100 font-semibold">Width</td><td className="border border-black px-3 py-1 font-mono">{pondDims.width.toFixed(1)} ft</td></tr>
              <tr><td className="border border-black px-3 py-1 bg-gray-100 font-semibold">Depth</td><td className="border border-black px-3 py-1 font-mono">{pondDims.depth.toFixed(1)} ft</td></tr>
              <tr><td className="border border-black px-3 py-1 bg-gray-100 font-semibold">Surface Area</td><td className="border border-black px-3 py-1 font-mono">{pondAreaSqFt.toLocaleString()} sf</td></tr>
              <tr><td className="border border-black px-3 py-1 bg-gray-100 font-semibold">Storage Capacity</td><td className="border border-black px-3 py-1 font-mono">{pondCapacity.toLocaleString()} cf</td></tr>
              <tr><td className="border border-black px-3 py-1 bg-gray-100 font-semibold">Invert Elevation</td><td className="border border-black px-3 py-1 font-mono">{pondInvertElevation.toFixed(2)} ft</td></tr>
              <tr><td className="border border-black px-3 py-1 bg-gray-100 font-semibold">Top of Pond Elevation</td><td className="border border-black px-3 py-1 font-mono">{pondTopElevation.toFixed(2)} ft</td></tr>
            </tbody>
          </table>

          <h3 className="font-bold mb-2 text-sm">Table 3-2: Storage Requirements by Storm Event</h3>
          <table className="w-full text-sm border border-black">
            <thead>
              <tr className="bg-gray-200">
                <th className="border border-black px-2 py-1 text-left">Storm</th>
                <th className="border border-black px-2 py-1 text-right">Req. Storage (cf)</th>
                <th className="border border-black px-2 py-1 text-right">Water Depth (ft)</th>
                <th className="border border-black px-2 py-1 text-right">Tc (min)</th>
                <th className="border border-black px-2 py-1 text-right">Peak Q (cfs)</th>
                <th className="border border-black px-2 py-1 text-right">Allow. Q (cfs)</th>
                <th className="border border-black px-2 py-1 text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {pondResults.map(r => {
                const waterDepth = r.requiredStorageCf / pondAreaSqFt;
                const isOk = r.requiredStorageCf <= pondCapacity;
                return (
                  <tr key={r.stormEvent}>
                    <td className="border border-black px-2 py-1 font-semibold">{r.stormEvent.toUpperCase()}</td>
                    <td className="border border-black px-2 py-1 text-right font-mono">{Math.round(r.requiredStorageCf).toLocaleString()}</td>
                    <td className="border border-black px-2 py-1 text-right font-mono">{waterDepth.toFixed(2)}</td>
                    <td className="border border-black px-2 py-1 text-right font-mono">{r.criticalDurationMinutes}</td>
                    <td className="border border-black px-2 py-1 text-right font-mono">{r.peakInflowCfs.toFixed(2)}</td>
                    <td className="border border-black px-2 py-1 text-right font-mono">{r.allowableReleaseRateCfs.toFixed(2)}</td>
                    <td className="border border-black px-2 py-1 text-center font-bold">{isOk ? 'OK' : 'FAIL'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {controllingStorm && (
            <p className="mt-2 text-sm">
              <strong>Controlling Storm:</strong> {controllingStorm.stormEvent.toUpperCase()} — 
              Required storage: {Math.round(controllingStorm.requiredStorageCf).toLocaleString()} cf ({((controllingStorm.requiredStorageCf / pondCapacity) * 100).toFixed(1)}% of capacity)
            </p>
          )}
        </section>

        {/* Section 4: Outfall Design */}
        {outfallStructures.length > 0 && (
          <section className="mb-8">
            <h2 className="text-lg font-bold border-b border-black pb-1 mb-4 uppercase">
              4. Outfall Structure Design
            </h2>

            <h3 className="font-bold mb-2 text-sm">Orifice Plate Configuration</h3>
            <p className="text-sm mb-4">
              Plate Size: {plateSize.width.toFixed(1)} ft (W) × {plateSize.height.toFixed(1)} ft (H) = {(plateSize.width * plateSize.height).toFixed(1)} sf
            </p>

            <h3 className="font-bold mb-2 text-sm">Table 4-1: Outfall Structure Schedule</h3>
            <table className="w-full text-sm border border-black mb-4">
              <thead>
                <tr className="bg-gray-200">
                  <th className="border border-black px-2 py-1 text-left">Stage</th>
                  <th className="border border-black px-2 py-1 text-left">Type</th>
                  <th className="border border-black px-2 py-1 text-right">Invert El. (ft)</th>
                  <th className="border border-black px-2 py-1 text-right">Dimensions</th>
                  <th className="border border-black px-2 py-1 text-right">Coeff. (C)</th>
                </tr>
              </thead>
              <tbody>
                {outfallStructures.map(s => (
                  <tr key={s.id}>
                    <td className="border border-black px-2 py-1">#{s.id}</td>
                    <td className="border border-black px-2 py-1 capitalize">{s.type}</td>
                    <td className="border border-black px-2 py-1 text-right font-mono">{s.invertElevation.toFixed(2)}</td>
                    <td className="border border-black px-2 py-1 text-right font-mono">
                      {s.type === 'circular' 
                        ? `Ø${s.diameterFt?.toFixed(2)} ft`
                        : `${s.widthFt?.toFixed(2)}×${s.heightFt?.toFixed(2)} ft`
                      }
                    </td>
                    <td className="border border-black px-2 py-1 text-right font-mono">{s.dischargeCoefficient.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h3 className="font-bold mb-2 text-sm">Table 4-2: Discharge Performance Summary</h3>
            <table className="w-full text-sm border border-black">
              <thead>
                <tr className="bg-gray-200">
                  <th className="border border-black px-2 py-1 text-left">Storm</th>
                  <th className="border border-black px-2 py-1 text-right">WSE (ft)</th>
                  <th className="border border-black px-2 py-1 text-right">Depth (ft)</th>
                  <th className="border border-black px-2 py-1 text-right">Freeboard (ft)</th>
                  <th className="border border-black px-2 py-1 text-right">Allow. Q (cfs)</th>
                  <th className="border border-black px-2 py-1 text-right">Actual Q (cfs)</th>
                  <th className="border border-black px-2 py-1 text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {outfallSummary.map(d => {
                  const pass = d.isPassing && d.hasAdequateFreeboard;
                  return (
                    <tr key={d.res.stormEvent}>
                      <td className="border border-black px-2 py-1 font-semibold">{d.res.stormEvent.toUpperCase()}</td>
                      <td className="border border-black px-2 py-1 text-right font-mono">{d.wse.toFixed(2)}</td>
                      <td className="border border-black px-2 py-1 text-right font-mono">{d.waterDepth.toFixed(2)}</td>
                      <td className="border border-black px-2 py-1 text-right font-mono">{d.freeboard.toFixed(2)}</td>
                      <td className="border border-black px-2 py-1 text-right font-mono">{d.res.allowableReleaseRateCfs.toFixed(2)}</td>
                      <td className="border border-black px-2 py-1 text-right font-mono">{d.totalDischarge.toFixed(2)}</td>
                      <td className="border border-black px-2 py-1 text-center font-bold">{pass ? 'PASS' : 'FAIL'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        )}

        {/* Section 5: Summary */}
        <section className="mb-8">
          <h2 className="text-lg font-bold border-b border-black pb-1 mb-4 uppercase">
            {outfallStructures.length > 0 ? '5' : '4'}. Design Summary
          </h2>
          <table className="w-full text-sm">
            <tbody>
              <tr><td className="py-0.5 w-48 font-semibold">Design Method:</td><td className="py-0.5">Modified Rational Method</td></tr>
              <tr><td className="py-0.5 font-semibold">Rainfall Source:</td><td className="py-0.5">NOAA Atlas 14</td></tr>
              {controllingStorm && (
                <>
                  <tr><td className="py-0.5 font-semibold">Controlling Storm:</td><td className="py-0.5">{controllingStorm.stormEvent.toUpperCase()}</td></tr>
                  <tr><td className="py-0.5 font-semibold">Required Storage:</td><td className="py-0.5">{Math.round(controllingStorm.requiredStorageCf).toLocaleString()} cf</td></tr>
                </>
              )}
              <tr><td className="py-0.5 font-semibold">Provided Capacity:</td><td className="py-0.5">{pondCapacity.toLocaleString()} cf</td></tr>
              {controllingStorm && (
                <tr><td className="py-0.5 font-semibold">Utilization:</td><td className="py-0.5">{((controllingStorm.requiredStorageCf / pondCapacity) * 100).toFixed(1)}%</td></tr>
              )}
            </tbody>
          </table>
        </section>

        {/* Footer */}
        <div className="border-t border-black pt-4 mt-8 text-xs text-center text-gray-600">
          Generated by WDS Stormforge — {new Date().toLocaleString()}
        </div>
      </div>
    </div>
  );
}
