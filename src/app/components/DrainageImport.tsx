'use client';

import React, { useState, useRef, useCallback } from 'react';
import {
  Upload,
  X,
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  FileJson,
  ChevronDown,
  ChevronRight,
  Info,
  Layers,
} from 'lucide-react';
import type { DrainageArea } from '@/utils/drainageCalculations';
import {
  StormforgeExportRoot,
  DrainageAreaExportDto,
  parseStormforgeFile,
  mapDtoToDrainageArea,
  mergeImportedAreas,
  updateImportMetadata,
  DrainageImportInfo,
  ImportValidationResult,
  MergeResult,
  extractReturnPeriods,
} from '@/utils/stormforgeImport';
import type { ReturnPeriod } from '@/utils/atlas14';

// ============================================================================
// Types
// ============================================================================

interface DrainageImportProps {
  targetType: 'existing' | 'proposed';
  currentAreas: DrainageArea[];
  onImport: (areas: DrainageArea[]) => void;
  onClose: () => void;
  onReturnPeriodsDetected?: (periods: ReturnPeriod[]) => void;
}

interface PreviewRow {
  dto: DrainageAreaExportDto;
  selectedType: 'existing' | 'proposed';
  hasWarnings: boolean;
  warnings: string[];
}

// ============================================================================
// Component
// ============================================================================

export default function DrainageImport({
  targetType,
  currentAreas,
  onImport,
  onClose,
  onReturnPeriodsDetected,
}: DrainageImportProps) {
  // State
  const [file, setFile] = useState<File | null>(null);
  const [exportData, setExportData] = useState<StormforgeExportRoot | null>(null);
  const [validation, setValidation] = useState<ImportValidationResult | null>(null);
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [mergePreview, setMergePreview] = useState<{ existing: MergeResult; proposed: MergeResult } | null>(null);
  const [detectedPeriods, setDetectedPeriods] = useState<ReturnPeriod[]>([]);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Update row type selection
  const updateRowType = useCallback((index: number, type: 'existing' | 'proposed') => {
    setPreviewRows(prev => {
      const next = [...prev];
      next[index] = { ...next[index], selectedType: type };
      return next;
    });
  }, []);

  // Bulk set all rows to a type
  const setAllRowsType = useCallback((type: 'existing' | 'proposed') => {
    setPreviewRows(prev => prev.map(row => ({ ...row, selectedType: type })));
  }, []);

  // Recalculate merge preview when row types change
  const calculateMergePreview = useCallback((rows: PreviewRow[], sourceFile: string, sourceDrawing?: string) => {
    // Separate by type
    const existingDtos = rows.filter(r => r.selectedType === 'existing').map(r => r.dto);
    const proposedDtos = rows.filter(r => r.selectedType === 'proposed').map(r => r.dto);

    // Map to DrainageAreas
    const existingAreas = existingDtos.map((dto, i) => 
      mapDtoToDrainageArea(dto, 'existing', i, sourceFile, sourceDrawing)
    );
    const proposedAreas = proposedDtos.map((dto, i) => 
      mapDtoToDrainageArea(dto, 'proposed', i, sourceFile, sourceDrawing)
    );

    // Calculate merge results for both types
    const existingMerge = mergeImportedAreas(currentAreas, existingAreas, 'existing');
    const proposedMerge = mergeImportedAreas(existingMerge.areas, proposedAreas, 'proposed');

    return { existing: existingMerge, proposed: proposedMerge };
  }, [currentAreas]);

  // Update merge preview when rows change
  React.useEffect(() => {
    if (previewRows.length > 0 && file && exportData) {
      const preview = calculateMergePreview(previewRows, file.name, exportData.drawingName);
      setMergePreview(preview);
    }
  }, [previewRows, file, exportData, calculateMergePreview]);

  // File selection handler
  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setIsLoading(true);
    setExpandedRows(new Set());

    try {
      const result = await parseStormforgeFile(selectedFile);
      setValidation(result.validation);

      if (result.success && result.data) {
        setExportData(result.data);

        // Extract return periods from C3D export
        const { detected } = extractReturnPeriods(result.data);
        setDetectedPeriods(detected);

        // Build preview rows with per-row warnings and default type
        const rows: PreviewRow[] = result.data.drainageAreas.map((dto) => {
          const rowWarnings: string[] = [];
          
          if (dto.runoffC === null || dto.runoffC === undefined) {
            rowWarnings.push('C-factor missing, defaulting to 0');
          }
          if (dto.tcMin === null || dto.tcMin === undefined) {
            rowWarnings.push('Tc missing, defaulting to 10 min');
          }
          if (dto.areaAC <= 0) {
            rowWarnings.push('Invalid or zero area');
          }

          return {
            dto,
            selectedType: targetType, // Default to the target type from button click
            hasWarnings: rowWarnings.length > 0,
            warnings: rowWarnings,
          };
        });

        setPreviewRows(rows);
        // Merge preview will be calculated by the effect
      } else {
        setExportData(null);
        setPreviewRows([]);
        setMergePreview(null);
        setDetectedPeriods([]);
      }
    } catch (err) {
      console.error('Import error:', err);
      setValidation({
        isValid: false,
        errors: ['Failed to process file'],
        warnings: [],
      });
    } finally {
      setIsLoading(false);
    }
  }, [targetType]);

  // Toggle row expansion
  const toggleRow = (index: number) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  // Confirm import
  const handleConfirmImport = useCallback(() => {
    if (!mergePreview || !exportData || !file) return;

    // Use the final merged areas (proposed merge contains all)
    onImport(mergePreview.proposed.areas);

    // Update return periods if any were detected
    if (detectedPeriods.length > 0 && onReturnPeriodsDetected) {
      onReturnPeriodsDetected(detectedPeriods);
    }

    // Save import metadata for each type that had areas
    const existingCount = previewRows.filter(r => r.selectedType === 'existing').length;
    const proposedCount = previewRows.filter(r => r.selectedType === 'proposed').length;
    
    if (existingCount > 0) {
      const existingTotalArea = previewRows
        .filter(r => r.selectedType === 'existing')
        .reduce((sum, r) => sum + r.dto.areaAC, 0);
      const existingInfo: DrainageImportInfo = {
        sourceFile: file.name,
        importedAt: new Date().toISOString(),
        itemCount: existingCount,
        sourceDrawing: exportData.drawingName || undefined,
        totalAreaAc: existingTotalArea,
        schemaVersion: exportData.schemaVersion,
      };
      updateImportMetadata('existing', existingInfo);
    }

    if (proposedCount > 0) {
      const proposedTotalArea = previewRows
        .filter(r => r.selectedType === 'proposed')
        .reduce((sum, r) => sum + r.dto.areaAC, 0);
      const proposedInfo: DrainageImportInfo = {
        sourceFile: file.name,
        importedAt: new Date().toISOString(),
        itemCount: proposedCount,
        sourceDrawing: exportData.drawingName || undefined,
        totalAreaAc: proposedTotalArea,
        schemaVersion: exportData.schemaVersion,
      };
      updateImportMetadata('proposed', proposedInfo);
    }

    onClose();
  }, [mergePreview, exportData, file, previewRows, onImport, onClose, detectedPeriods, onReturnPeriodsDetected]);

  // Render
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border bg-slate-900/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <FileJson className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">
                Import {targetType === 'existing' ? 'Existing' : 'Proposed'} Drainage Areas
              </h2>
              <p className="text-sm text-gray-400">From Civil 3D Stormforge Export</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            title="Close import dialog"
            aria-label="Close import dialog"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* File Selection */}
          {!file && (
            <div className="border-2 border-dashed border-border rounded-xl p-8 text-center">
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileSelect}
                className="hidden"
                title="Select Stormforge JSON file"
                aria-label="Select Stormforge JSON file"
              />
              <Upload className="w-12 h-12 text-gray-500 mx-auto mb-4" />
              <p className="text-gray-300 mb-2">Select a Stormforge JSON export file</p>
              <p className="text-sm text-gray-500 mb-4">
                Export from Civil 3D using the Stormforge plugin
              </p>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-lg transition-colors"
              >
                Choose File
              </button>
            </div>
          )}

          {/* Loading */}
          {isLoading && (
            <div className="text-center py-8">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-gray-400">Parsing file...</p>
            </div>
          )}

          {/* Validation Errors */}
          {validation && !validation.isValid && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-red-400 mb-4">
                <AlertCircle className="w-5 h-5" />
                <span className="font-medium">Import Failed</span>
              </div>
              {validation.errors.map((err, i) => (
                <div key={i} className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-300 text-sm">
                  {err}
                </div>
              ))}
              <button
                onClick={() => {
                  setFile(null);
                  setValidation(null);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                className="mt-4 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-border rounded-lg transition-colors"
              >
                Try Another File
              </button>
            </div>
          )}

          {/* Preview */}
          {validation?.isValid && exportData && (
            <div className="space-y-4">
              {/* Source Info */}
              <div className="bg-slate-900/50 border border-border rounded-lg p-4">
                <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
                  <Info className="w-4 h-4" />
                  <span>Source Information</span>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Drawing:</span>{' '}
                    <span className="text-white">{exportData.drawingName || 'Unknown'}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Exported:</span>{' '}
                    <span className="text-white">
                      {new Date(exportData.exportedAtUtc).toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">File:</span>{' '}
                    <span className="text-white">{file?.name}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Schema:</span>{' '}
                    <span className="text-white">v{exportData.schemaVersion}</span>
                  </div>
                </div>
                {detectedPeriods.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500 text-sm">Return Periods:</span>
                      <div className="flex flex-wrap gap-1">
                        {detectedPeriods.map(period => (
                          <span key={period} className="px-2 py-0.5 bg-amber-500/20 border border-amber-500/50 text-amber-400 text-xs rounded font-medium">
                            {period}
                          </span>
                        ))}
                      </div>
                      <span className="text-xs text-gray-400 ml-2">(will replace current selection)</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Warnings */}
              {validation.warnings.length > 0 && (
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-yellow-400 mb-2">
                    <AlertTriangle className="w-4 h-4" />
                    <span className="font-medium text-sm">Warnings ({validation.warnings.length})</span>
                  </div>
                  <ul className="text-sm text-yellow-300/80 space-y-1 max-h-24 overflow-y-auto">
                    {validation.warnings.slice(0, 5).map((w, i) => (
                      <li key={i}>• {w}</li>
                    ))}
                    {validation.warnings.length > 5 && (
                      <li className="text-yellow-500">...and {validation.warnings.length - 5} more</li>
                    )}
                  </ul>
                </div>
              )}

              {/* Merge Preview */}
              {mergePreview && (
                <div className="flex gap-4 text-sm flex-wrap">
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-500/10 border border-gray-500/30 rounded-lg text-gray-300">
                    <Layers className="w-4 h-4" />
                    <span>{previewRows.filter(r => r.selectedType === 'existing').length} existing</span>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 border border-primary/30 rounded-lg text-primary">
                    <Layers className="w-4 h-4" />
                    <span>{previewRows.filter(r => r.selectedType === 'proposed').length} proposed</span>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-green-500/10 border border-green-500/30 rounded-lg text-green-400">
                    <CheckCircle className="w-4 h-4" />
                    <span>{mergePreview.existing.added + mergePreview.proposed.added} new</span>
                  </div>
                  {(mergePreview.existing.updated + mergePreview.proposed.updated) > 0 && (
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-500/10 border border-blue-500/30 rounded-lg text-blue-400">
                      <Info className="w-4 h-4" />
                      <span>{mergePreview.existing.updated + mergePreview.proposed.updated} updated</span>
                    </div>
                  )}
                </div>
              )}

              {/* Bulk Type Selection */}
              <div className="flex items-center gap-3 py-2">
                <span className="text-sm text-gray-400">Set all as:</span>
                <button
                  onClick={() => setAllRowsType('existing')}
                  className="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded transition-colors"
                >
                  Existing
                </button>
                <button
                  onClick={() => setAllRowsType('proposed')}
                  className="px-3 py-1.5 text-xs bg-primary/20 hover:bg-primary/30 border border-primary/50 text-primary rounded transition-colors"
                >
                  Proposed
                </button>
              </div>

              {/* Preview Table */}
              <div className="border border-border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-900/50 text-xs uppercase text-gray-400">
                    <tr>
                      <th className="px-3 py-2 text-left w-8"></th>
                      <th className="px-3 py-2 text-left">Name</th>
                      <th className="px-3 py-2 text-center">Type</th>
                      <th className="px-3 py-2 text-center">Bypass</th>
                      <th className="px-3 py-2 text-right">Area (ac)</th>
                      <th className="px-3 py-2 text-right">C Factor</th>
                      <th className="px-3 py-2 text-right">Tc (min)</th>
                      <th className="px-3 py-2 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {previewRows.map((row, i) => (
                      <React.Fragment key={i}>
                        <tr
                          className={`hover:bg-white/5 ${row.hasWarnings ? 'bg-yellow-500/5' : ''}`}
                        >
                          <td className="px-3 py-2 cursor-pointer" onClick={() => toggleRow(i)}>
                            {expandedRows.has(i) ? (
                              <ChevronDown className="w-4 h-4 text-gray-500" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-gray-500" />
                            )}
                          </td>
                          <td className="px-3 py-2 text-white cursor-pointer" onClick={() => toggleRow(i)}>
                            {row.dto.parcelName || row.dto.daId || `Area ${i + 1}`}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <select
                              value={row.selectedType}
                              onChange={(e) => updateRowType(i, e.target.value as 'existing' | 'proposed')}
                              onClick={(e) => e.stopPropagation()}
                              className={`px-2 py-1 rounded text-xs font-medium cursor-pointer transition-colors [&_option]:bg-slate-800 [&_option]:text-white ${
                                row.selectedType === 'existing' 
                                  ? 'bg-gray-700 text-gray-200 border border-gray-600' 
                                  : 'bg-primary/20 text-primary border border-primary/50'
                              }`}
                              title="Select drainage area type"
                              aria-label="Select drainage area type"
                            >
                              <option value="existing" className="bg-slate-800 text-white">Existing</option>
                              <option value="proposed" className="bg-slate-800 text-white">Proposed</option>
                            </select>
                          </td>
                          <td className="px-3 py-2 text-center">
                            {row.dto.isBypass ? (
                              <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 text-xs rounded border border-amber-500/30">Yes</span>
                            ) : (
                              <span className="text-gray-600 text-xs">-</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right font-mono">{row.dto.areaAC.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right font-mono">
                            {row.dto.runoffC !== null ? row.dto.runoffC.toFixed(2) : (
                              <span className="text-yellow-400">0.00*</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right font-mono">
                            {row.dto.tcMin !== null ? row.dto.tcMin : (
                              <span className="text-yellow-400">10*</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {row.hasWarnings ? (
                              <AlertTriangle className="w-4 h-4 text-yellow-400 inline" />
                            ) : (
                              <CheckCircle className="w-4 h-4 text-green-400 inline" />
                            )}
                          </td>
                        </tr>
                        {/* Expanded Details */}
                        {expandedRows.has(i) && (
                          <tr className="bg-slate-900/30">
                            <td colSpan={7} className="px-4 py-3">
                              <div className="grid grid-cols-3 gap-4 text-xs">
                                <div>
                                  <span className="text-gray-500">Land Use:</span>{' '}
                                  <span className="text-gray-300">{row.dto.landUse || '-'}</span>
                                </div>
                                <div>
                                  <span className="text-gray-500">Soil Group:</span>{' '}
                                  <span className="text-gray-300">{row.dto.soilGroup || '-'}</span>
                                </div>
                                <div>
                                  <span className="text-gray-500">% Impervious:</span>{' '}
                                  <span className="text-gray-300">
                                    {row.dto.pctImpervious !== null ? `${row.dto.pctImpervious}%` : '-'}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-gray-500">Target Node:</span>{' '}
                                  <span className="text-gray-300">{row.dto.targetNodeId || '-'}</span>
                                </div>
                                <div>
                                  <span className="text-gray-500">Parcel Handle:</span>{' '}
                                  <span className="text-gray-300 font-mono">{row.dto.parcelHandle || '-'}</span>
                                </div>
                                <div>
                                  <span className="text-gray-500">DA ID:</span>{' '}
                                  <span className="text-gray-300">{row.dto.daId || '-'}</span>
                                </div>
                                <div>
                                  <span className="text-gray-500">Bypass:</span>{' '}
                                  <span className={row.dto.isBypass ? "text-amber-400" : "text-gray-300"}>
                                    {row.dto.isBypass ? "Yes (Direct to Outfall)" : "No (Routes to Pond)"}
                                  </span>
                                </div>
                                {row.dto.notes && (
                                  <div className="col-span-3">
                                    <span className="text-gray-500">Notes:</span>{' '}
                                    <span className="text-gray-300">{row.dto.notes}</span>
                                  </div>
                                )}
                                {row.warnings.length > 0 && (
                                  <div className="col-span-3 text-yellow-400">
                                    <span className="font-medium">Warnings:</span>{' '}
                                    {row.warnings.join(', ')}
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Summary */}
              <div className="text-sm text-gray-400">
                Total: {previewRows.length} areas,{' '}
                {previewRows.reduce((sum, r) => sum + r.dto.areaAC, 0).toFixed(2)} acres
                {' • '}
                <span className="text-gray-500">
                  {previewRows.filter(r => r.selectedType === 'existing').length} existing, 
                  {' '}{previewRows.filter(r => r.selectedType === 'proposed').length} proposed
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border bg-slate-900/50 flex justify-between items-center">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-border rounded-lg transition-colors"
          >
            Cancel
          </button>
          {validation?.isValid && (
            <button
              onClick={handleConfirmImport}
              className="px-6 py-2 bg-primary hover:bg-primary/90 text-white font-medium rounded-lg transition-colors flex items-center gap-2"
            >
              <CheckCircle className="w-4 h-4" />
              Import {previewRows.length} Areas
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
