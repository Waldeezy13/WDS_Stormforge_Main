'use client';

import React, { useState } from 'react';
import { Upload, AlertCircle, FileText, ChevronDown, ChevronRight, Download } from 'lucide-react';
import Atlas14ImportPreview from './Atlas14ImportPreview';


interface ParsedData {
  city: string;
  state: string;
  durationMinutes: number;
  returnPeriod: string;
  intensity: number;
}

export default function Atlas14Import() {
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [previewData, setPreviewData] = useState<{
    data: ParsedData[];
    cities: Array<{ city: string; state: string; recordCount: number }>;
    errors?: string[];
    warnings?: string[];
    totalRows: number;
    parsedRows: number;
    detectedHeaders?: string[];
    columnMappings?: Record<string, string>;
    sampleRows?: Array<{ rowNumber: number; data: Record<string, unknown>; keys: string[] }>;
    debugInfo?: Record<string, unknown>;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [lastDebugInfo, setLastDebugInfo] = useState<Record<string, unknown> | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];

    if (selectedFile && (selectedFile.type === 'text/csv' || selectedFile.name.endsWith('.csv'))) {
      setFile(selectedFile);
      setError(null);
      setPreviewData(null);
      setLastDebugInfo(null);
    } else {
      setError('Please select a CSV file');
    }
  };

  const handleParse = async () => {
    if (!file) return;

    setParsing(true);
    setError(null);
    setLastDebugInfo(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/atlas14/import/preview', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (result.debugInfo) {
        setLastDebugInfo(result.debugInfo);
      }

      if (response.ok && result.success !== false) {
        setPreviewData({
          data: result.data || [],
          cities: result.cities || [],
          errors: result.errors,
          warnings: result.warnings,
          totalRows: result.totalRows || 0,
          parsedRows: result.parsedRows || 0,
          detectedHeaders: result.detectedHeaders,
          columnMappings: result.columnMappings,
          sampleRows: result.sampleRows,
          debugInfo: result.debugInfo,
        });

        // Show warning if no data was parsed
        if (!result.data || result.data.length === 0) {
          setError('No valid data rows were parsed. Check the errors/warnings below and verify your CSV format.');
        }
      } else {
        const errorMsg = result.error || 'Failed to parse CSV';
        const suggestion = result.suggestion ? ` ${result.suggestion}` : '';
        setError(errorMsg + suggestion);

        // Still show preview if there's partial data
        if (result.data && result.data.length > 0) {
          setPreviewData({
            data: result.data,
            cities: result.cities || [],
            errors: result.errors,
            warnings: result.warnings,
            totalRows: result.totalRows || 0,
            parsedRows: result.parsedRows || 0,
            detectedHeaders: result.detectedHeaders,
            columnMappings: result.columnMappings,
            sampleRows: result.sampleRows,
            debugInfo: result.debugInfo,
          });
        }
      }
    } catch {
      setError('Failed to parse CSV file');
    } finally {
      setParsing(false);
    }
  };

  const handleCancel = () => {
    setPreviewData(null);
    setFile(null);
    const fileInput = document.getElementById('csv-file-input') as HTMLInputElement;
    if (fileInput) fileInput.value = '';
  };

  const handleSaveComplete = () => {
    setPreviewData(null);
    setFile(null);
    const fileInput = document.getElementById('csv-file-input') as HTMLInputElement;
    if (fileInput) fileInput.value = '';
  };

  if (previewData) {
    return (
      <Atlas14ImportPreview
        data={previewData.data}
        cities={previewData.cities}
        errors={previewData.errors}
        warnings={previewData.warnings}
        totalRows={previewData.totalRows}
        parsedRows={previewData.parsedRows}
        detectedHeaders={previewData.detectedHeaders}
        columnMappings={previewData.columnMappings}
        sampleRows={previewData.sampleRows}
        onCancel={handleCancel}
        onSave={handleSaveComplete}
      />
    );
  }

  return (
    <div className="bg-card p-6 rounded-lg border border-border shadow-lg">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-primary/10 rounded-full text-primary">
          <Upload className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-semibold">Import Rainfall Data</h2>
      </div>

      <p className="text-sm text-gray-400 mb-4">
        Upload a CSV file with rainfall intensity data. Supports NOAA Atlas 14, municipal sources, or custom data.
      </p>

      <div className="space-y-4">
        <div>
          <label htmlFor="csv-file-input" className="block text-sm text-gray-400 mb-2">
            Select CSV File
          </label>

          <div className="flex items-center gap-3">
            <input
              id="csv-file-input"
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="block w-full text-sm text-gray-400
                file:mr-4 file:py-2 file:px-4
                file:rounded-lg file:border-0
                file:text-sm file:font-semibold
                file:bg-primary/20 file:text-primary
                hover:file:bg-primary/30
                cursor-pointer"
              disabled={parsing}
            />

            {file && (
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <FileText className="w-4 h-4" />
                <span>{file.name}</span>
              </div>
            )}
          </div>

          <div className="mt-3 rounded-md border border-border/60 bg-background/40 p-3 text-xs text-gray-300">
            <p className="font-medium text-gray-200">CSV format help</p>
            <p className="mt-1 text-gray-400">
              The importer accepts either a list format (one storm row per line) or a matrix format (durations as rows, return periods as columns).
            </p>

            <div className="mt-2 flex flex-wrap gap-2">
              <a
                href="/templates/rainfall-import-list-template.csv"
                download
                className="inline-flex items-center gap-1 rounded border border-border/70 bg-card px-2 py-1 hover:bg-card/70"
              >
                <Download className="h-3.5 w-3.5" />
                Download list template
              </a>
              <a
                href="/templates/rainfall-import-matrix-template.csv"
                download
                className="inline-flex items-center gap-1 rounded border border-border/70 bg-card px-2 py-1 hover:bg-card/70"
              >
                <Download className="h-3.5 w-3.5" />
                Download matrix template
              </a>
            </div>

            <details className="mt-2 text-gray-400">
              <summary className="cursor-pointer text-gray-300">View required fields</summary>
              <div className="mt-2 space-y-1">
                <p><span className="text-gray-200">List format columns:</span> <code>city</code>, <code>state</code>, <code>duration_minutes</code>, <code>return_period</code>, <code>intensity</code> (optional: <code>source</code>)</p>
                <p><span className="text-gray-200">Return period values:</span> <code>1yr</code>, <code>2yr</code>, <code>5yr</code>, <code>10yr</code>, <code>25yr</code>, <code>50yr</code>, <code>100yr</code>, <code>500yr</code></p>
              </div>
            </details>
          </div>
        </div>

        <button
          onClick={handleParse}
          disabled={!file || parsing}
          className="w-full bg-primary text-primary-foreground px-4 py-3 rounded-lg font-medium
            hover:bg-primary/90 transition-colors
            disabled:opacity-50 disabled:cursor-not-allowed
            flex items-center justify-center gap-2"
        >
          {parsing ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Parsing CSV...
            </>
          ) : (
            <>
              <Upload className="w-4 h-4" />
              Parse & Preview
            </>
          )}
        </button>

        {error && (
          <div className="space-y-3">
            <div className="p-3 bg-red-500/10 border border-red-500/50 rounded text-sm text-red-400">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <p>{error}</p>
              </div>
            </div>

            {lastDebugInfo && (
              <div className="text-xs border border-border/50 rounded p-2 bg-background/50">
                <button 
                  onClick={() => setShowDebug(!showDebug)}
                  className="flex items-center gap-1 text-gray-400 hover:text-gray-200 w-full"
                  aria-label="Toggle technical debug details"
                >
                  {showDebug ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  Technical Details (Debug Info)
                </button>

                {showDebug && (
                  <div className="mt-2 space-y-2 font-mono overflow-x-auto max-w-full text-gray-300">
                    <div>
                      <span className="text-gray-500">Detected Header Row Index:</span> {String(lastDebugInfo.headerRowIndex)}
                    </div>

                    <div>
                      <span className="text-gray-500">Detected Format:</span> {lastDebugInfo.isMatrixFormat ? 'Matrix/Pivot' : 'List'}
                    </div>

                    <div>
                      <span className="text-gray-500">Extracted Metadata:</span> {JSON.stringify(lastDebugInfo.fileMetadata)}
                    </div>

                    <div>
                      <span className="text-gray-500">Detected Columns:</span> {JSON.stringify(lastDebugInfo.detectedHeaders)}
                    </div>

                    <div>
                      <span className="text-gray-500">First Row Sample:</span>
                      <pre className="mt-1 p-2 bg-black/20 rounded text-[10px] whitespace-pre-wrap break-all">
                        {JSON.stringify(lastDebugInfo.sampleFirstRow, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-4 p-3 bg-background rounded border border-border/50">
        <div className="flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
          <div className="text-xs text-gray-400">
            <p className="font-medium mb-1">Supported CSV Formats:</p>

            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>NOAA Atlas 14 standard export format (Point or Area)</li>
              <li>Municipal or custom rainfall data with city/state columns</li>
              <li>Optional &quot;source&quot; column to identify data origin</li>
              <li>Matrix format (Duration vs Return Periods)</li>
              <li>List format (Duration, Return Period, Intensity columns)</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
