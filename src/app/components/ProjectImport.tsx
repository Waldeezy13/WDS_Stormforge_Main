'use client';

import React, { useState, useRef, useCallback, useMemo } from 'react';
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
  CloudRain,
  FolderOpen,
} from 'lucide-react';
import type { DrainageArea } from '@/utils/drainageCalculations';
import type { ReturnPeriod } from '@/utils/atlas14';
import {
  StormforgeExportRoot,
  DrainageAreaExportDto,
  parseStormforgeFile,
  mapDtoToDrainageArea,
  extractReturnPeriods,
  updateImportMetadata,
  DrainageImportInfo,
  ImportValidationResult,
  ProjectMetadata,
} from '@/utils/stormforgeImport';

// ============================================================================
// Types
// ============================================================================

interface ProjectImportProps {
  onImport: (
    areas: DrainageArea[],
    returnPeriods: ReturnPeriod[],
    projectMeta: ProjectMetadata
  ) => void;
  onClose: () => void;
  currentReturnPeriods: ReturnPeriod[];
}

interface PreviewRow {
  dto: DrainageAreaExportDto;
  selectedType: 'existing' | 'proposed';
  hasWarnings: boolean;
  warnings: string[];
}

const AVAILABLE_RETURN_PERIODS: ReturnPeriod[] = ['1yr', '2yr', '5yr', '10yr', '25yr', '50yr', '100yr', '500yr'];

// ============================================================================
// Component
// ============================================================================

export default function ProjectImport({
  onImport,
  onClose,
  currentReturnPeriods,
}: ProjectImportProps) {
  // State
  const [file, setFile] = useState<File | null>(null);
  const [exportData, setExportData] = useState<StormforgeExportRoot | null>(null);
  const [validation, setValidation] = useState<ImportValidationResult | null>(null);
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  
  // Return period selection
  const [detectedPeriods, setDetectedPeriods] = useState<ReturnPeriod[]>([]);
  const [selectedPeriods, setSelectedPeriods] = useState<ReturnPeriod[]>(currentReturnPeriods);
  
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

  // Toggle return period selection
  const toggleReturnPeriod = useCallback((period: ReturnPeriod) => {
    setSelectedPeriods(prev => {
      if (prev.includes(period)) {
        return prev.filter(p => p !== period);
      }
      return [...prev, period].sort((a, b) => {
        const aNum = parseInt(a);
        const bNum = parseInt(b);
        return aNum - bNum;
      });
    });
  }, []);

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

        // Extract return periods from C3D data
        const { detected } = extractReturnPeriods(result.data);
        setDetectedPeriods(detected);
        
        // Auto-select detected periods if available, otherwise keep current
        if (detected.length > 0) {
          setSelectedPeriods(detected);
        }

        // Build preview rows - default all to 'proposed' for new projects
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
            selectedType: 'proposed', // Default to proposed for new project setup
            hasWarnings: rowWarnings.length > 0,
            warnings: rowWarnings,
          };
        });

        setPreviewRows(rows);
      } else {
        setExportData(null);
        setPreviewRows([]);
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
  }, []);

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

  // Calculate summary stats
  const summary = useMemo(() => {
    const existingRows = previewRows.filter(r => r.selectedType === 'existing');
    const proposedRows = previewRows.filter(r => r.selectedType === 'proposed');
    return {
      existingCount: existingRows.length,
      proposedCount: proposedRows.length,
      existingArea: existingRows.reduce((sum, r) => sum + r.dto.areaAC, 0),
      proposedArea: proposedRows.reduce((sum, r) => sum + r.dto.areaAC, 0),
      totalArea: previewRows.reduce((sum, r) => sum + r.dto.areaAC, 0),
    };
  }, [previewRows]);

  // Confirm import
  const handleConfirmImport = useCallback(() => {
    if (!exportData || !file || selectedPeriods.length === 0) return;

    // Map all rows to DrainageAreas with their selected types
    const areas: DrainageArea[] = previewRows.map((row, i) => 
      mapDtoToDrainageArea(row.dto, row.selectedType, i, file.name, exportData.drawingName)
    );

    // Build project metadata
    const projectMeta: ProjectMetadata = {
      drawingName: exportData.drawingName,
      drawingPath: exportData.drawingPath,
      schemaVersion: exportData.schemaVersion,
      originalExportDate: exportData.exportedAtUtc,
    };

    // Save import metadata for each type
    const existingCount = previewRows.filter(r => r.selectedType === 'existing').length;
    const proposedCount = previewRows.filter(r => r.selectedType === 'proposed').length;
    
    if (existingCount > 0) {
      const existingInfo: DrainageImportInfo = {
        sourceFile: file.name,
        importedAt: new Date().toISOString(),
        itemCount: existingCount,
        sourceDrawing: exportData.drawingName || undefined,
        totalAreaAc: summary.existingArea,
        schemaVersion: exportData.schemaVersion,
      };
      updateImportMetadata('existing', existingInfo);
    }

    if (proposedCount > 0) {
      const proposedInfo: DrainageImportInfo = {
        sourceFile: file.name,
        importedAt: new Date().toISOString(),
        itemCount: proposedCount,
        sourceDrawing: exportData.drawingName || undefined,
        totalAreaAc: summary.proposedArea,
        schemaVersion: exportData.schemaVersion,
      };
      updateImportMetadata('proposed', proposedInfo);
    }

    onImport(areas, selectedPeriods, projectMeta);
    onClose();
  }, [exportData, file, previewRows, selectedPeriods, summary, onImport, onClose]);

  // Render
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border bg-slate-900/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <FolderOpen className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">
                New Project from Civil 3D
              </h2>
              <p className="text-sm text-gray-400">Import drainage areas and configure storm events</p>
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
              <FolderOpen className="w-12 h-12 text-gray-500 mx-auto mb-4" />
              <p className="text-gray-300 mb-2">Select a Stormforge JSON export file to start a new project</p>
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
            <div className="space-y-6">
              {/* Source Info */}
              <div className="bg-slate-900/50 border border-border rounded-lg p-4">
                <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
                  <FileJson className="w-4 h-4" />
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

              {/* Return Period Selection */}
              <div className="bg-slate-900/50 border border-border rounded-lg p-4">
                <div className="flex items-center gap-2 text-sm text-gray-400 mb-3">
                  <CloudRain className="w-4 h-4" />
                  <span>Storm Events</span>
                  {detectedPeriods.length > 0 && (
                    <span className="ml-2 px-2 py-0.5 bg-green-500/10 border border-green-500/30 rounded text-xs text-green-400">
                      Auto-detected from C3D
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {AVAILABLE_RETURN_PERIODS.map(period => {
                    const isSelected = selectedPeriods.includes(period);
                    const isDetected = detectedPeriods.includes(period);
                    return (
                      <button
                        key={period}
                        onClick={() => toggleReturnPeriod(period)}
                        className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                          isSelected
                            ? 'bg-primary text-white'
                            : 'bg-slate-800 text-gray-400 hover:bg-slate-700'
                        } ${isDetected && !isSelected ? 'ring-1 ring-green-500/50' : ''}`}
                        title={isDetected ? 'Detected in C3D export' : undefined}
                      >
                        {period}
                        {isDetected && <span className="ml-1 text-xs opacity-70">•</span>}
                      </button>
                    );
                  })}
                </div>
                {selectedPeriods.length === 0 && (
                  <p className="text-sm text-yellow-400 mt-2">
                    <AlertTriangle className="w-4 h-4 inline mr-1" />
                    Select at least one storm event
                  </p>
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

              {/* Summary Cards */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-slate-900/50 border border-border rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-white">{previewRows.length}</div>
                  <div className="text-xs text-gray-400 uppercase">Total Areas</div>
                </div>
                <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-gray-300">{summary.existingCount}</div>
                  <div className="text-xs text-gray-400 uppercase">Existing ({summary.existingArea.toFixed(1)} ac)</div>
                </div>
                <div className="bg-primary/10 border border-primary/30 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-primary">{summary.proposedCount}</div>
                  <div className="text-xs text-gray-400 uppercase">Proposed ({summary.proposedArea.toFixed(1)} ac)</div>
                </div>
              </div>

              {/* Bulk Type Selection */}
              <div className="flex items-center gap-3">
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
                              className={`px-2 py-1 rounded text-xs font-medium cursor-pointer transition-colors ${
                                row.selectedType === 'existing' 
                                  ? 'bg-gray-700 text-gray-200 border border-gray-600' 
                                  : 'bg-primary/20 text-primary border border-primary/50'
                              }`}
                              title="Select drainage area type"
                              aria-label="Select drainage area type"
                            >
                              <option value="existing">Existing</option>
                              <option value="proposed">Proposed</option>
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
                                {row.dto.returnPeriods && row.dto.returnPeriods.length > 0 && (
                                  <div>
                                    <span className="text-gray-500">Return Periods:</span>{' '}
                                    <span className="text-gray-300">{row.dto.returnPeriods.join(', ')} yr</span>
                                  </div>
                                )}
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
              disabled={selectedPeriods.length === 0}
              className="px-6 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center gap-2"
            >
              <CheckCircle className="w-4 h-4" />
              Start Project ({previewRows.length} Areas)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
