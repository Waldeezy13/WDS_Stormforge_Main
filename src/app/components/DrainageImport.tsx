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
} from 'lucide-react';
import type { DrainageArea } from '@/utils/drainageCalculations';
import {
  StormforgeExportRoot,
  DrainageAreaExportDto,
  parseStormforgeFile,
  mapExportToDrainageAreas,
  mergeImportedAreas,
  updateImportMetadata,
  DrainageImportInfo,
  ImportValidationResult,
  MergeResult,
} from '@/utils/stormforgeImport';

// ============================================================================
// Types
// ============================================================================

interface DrainageImportProps {
  targetType: 'existing' | 'proposed';
  currentAreas: DrainageArea[];
  onImport: (areas: DrainageArea[]) => void;
  onClose: () => void;
}

interface PreviewRow {
  dto: DrainageAreaExportDto;
  mapped: DrainageArea;
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
}: DrainageImportProps) {
  // State
  const [file, setFile] = useState<File | null>(null);
  const [exportData, setExportData] = useState<StormforgeExportRoot | null>(null);
  const [validation, setValidation] = useState<ImportValidationResult | null>(null);
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [mergePreview, setMergePreview] = useState<MergeResult | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

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

        // Map to DrainageAreas
        const mapped = mapExportToDrainageAreas(result.data, targetType, selectedFile.name);

        // Build preview rows with per-row warnings
        const rows: PreviewRow[] = result.data.drainageAreas.map((dto, i) => {
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
            mapped: mapped[i],
            hasWarnings: rowWarnings.length > 0,
            warnings: rowWarnings,
          };
        });

        setPreviewRows(rows);

        // Preview merge result
        const merge = mergeImportedAreas(currentAreas, mapped, targetType);
        setMergePreview(merge);
      } else {
        setExportData(null);
        setPreviewRows([]);
        setMergePreview(null);
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
  }, [currentAreas, targetType]);

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

    // Update areas
    onImport(mergePreview.areas);

    // Save import metadata
    const totalArea = previewRows.reduce((sum, r) => sum + r.mapped.areaAcres, 0);
    const info: DrainageImportInfo = {
      sourceFile: file.name,
      importedAt: new Date().toISOString(),
      itemCount: previewRows.length,
      sourceDrawing: exportData.drawingName || undefined,
      totalAreaAc: totalArea,
      schemaVersion: exportData.schemaVersion,
    };
    updateImportMetadata(targetType, info);

    onClose();
  }, [mergePreview, exportData, file, previewRows, targetType, onImport, onClose]);

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
                <div className="flex gap-4 text-sm">
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-green-500/10 border border-green-500/30 rounded-lg text-green-400">
                    <CheckCircle className="w-4 h-4" />
                    <span>{mergePreview.added} new</span>
                  </div>
                  {mergePreview.updated > 0 && (
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-500/10 border border-blue-500/30 rounded-lg text-blue-400">
                      <Info className="w-4 h-4" />
                      <span>{mergePreview.updated} updated</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-500/10 border border-slate-500/30 rounded-lg text-gray-400">
                    <span>{mergePreview.unchanged} preserved</span>
                  </div>
                </div>
              )}

              {/* Preview Table */}
              <div className="border border-border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-900/50 text-xs uppercase text-gray-400">
                    <tr>
                      <th className="px-3 py-2 text-left w-8"></th>
                      <th className="px-3 py-2 text-left">Name</th>
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
                          className={`hover:bg-white/5 cursor-pointer ${row.hasWarnings ? 'bg-yellow-500/5' : ''}`}
                          onClick={() => toggleRow(i)}
                        >
                          <td className="px-3 py-2">
                            {expandedRows.has(i) ? (
                              <ChevronDown className="w-4 h-4 text-gray-500" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-gray-500" />
                            )}
                          </td>
                          <td className="px-3 py-2 text-white">{row.mapped.name}</td>
                          <td className="px-3 py-2 text-right font-mono">{row.mapped.areaAcres.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right font-mono">
                            {row.dto.runoffC !== null ? row.mapped.cFactor.toFixed(2) : (
                              <span className="text-yellow-400">0.00*</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right font-mono">
                            {row.dto.tcMin !== null ? row.mapped.tcMinutes : (
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
                            <td colSpan={6} className="px-4 py-3">
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
                {previewRows.reduce((sum, r) => sum + r.mapped.areaAcres, 0).toFixed(2)} acres
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
