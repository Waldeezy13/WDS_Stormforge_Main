'use client';

import React, { useState } from 'react';
import { Upload, AlertCircle, FileText, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import Atlas14ImportPreview from './Atlas14ImportPreview';
import { clearAtlas14Cache } from '@/utils/atlas14';

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
    sampleRows?: Array<{ rowNumber: number; data: any; keys: string[] }>;
    debugInfo?: any;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [lastDebugInfo, setLastDebugInfo] = useState<any>(null);

  const handleClearData = async () => {
    if (!confirm('Are you sure you want to clear ALL rainfall data from the database? This cannot be undone.')) {
      return;
    }

    setClearing(true);

    try {
      const response = await fetch('/api/atlas14/clear', {
        method: 'POST',
      });

      const result = await response.json();

      if (response.ok) {
        clearAtlas14Cache();
        alert('All rainfall data has been cleared. Cities remain in the database.');
      } else {
        alert('Failed to clear data: ' + (result.error || 'Unknown error'));
      }
    } catch (error) {
      alert('Failed to clear data');
    } finally {
      setClearing(false);
    }
  };

  const handleCleanupPlaceholders = async () => {
    if (!confirm('This will delete all placeholder cities that don\'t have rainfall data. Cities with data will be kept. Continue?')) {
      return;
    }

    setClearing(true);

    try {
      const response = await fetch('/api/atlas14/cities/cleanup', {
        method: 'POST',
      });

      const result = await response.json();

      if (response.ok) {
        clearAtlas14Cache();
        alert(`Successfully deleted ${result.deletedCount} placeholder city/cities.`);
        // Refresh the page to update the city list
        window.location.reload();
      } else {
        alert('Failed to cleanup placeholder cities: ' + (result.error || 'Unknown error'));
      }
    } catch (error) {
      alert('Failed to cleanup placeholder cities');
    } finally {
      setClearing(false);
    }
  };

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
    } catch (error) {
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
        <h2 className="text-xl font-semibold">Import Atlas 14 Data</h2>
      </div>

      <p className="text-sm text-gray-400 mb-4">
        Upload a CSV file exported from Atlas 14. The system will automatically detect and parse the data format.
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
                >
                  {showDebug ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  Technical Details (Debug Info)
                </button>

                {showDebug && (
                  <div className="mt-2 space-y-2 font-mono overflow-x-auto max-w-full text-gray-300">
                    <div>
                      <span className="text-gray-500">Detected Header Row Index:</span> {lastDebugInfo.headerRowIndex}
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

      <div className="flex gap-3">
        <button
          onClick={handleCleanupPlaceholders}
          disabled={clearing}
          className="flex-1 bg-yellow-500/20 text-yellow-400 border border-yellow-500/50 px-4 py-3 rounded-lg font-medium
            hover:bg-yellow-500/30 transition-colors
            disabled:opacity-50 disabled:cursor-not-allowed
            flex items-center justify-center gap-2"
        >
          {clearing ? (
            <>
              <div className="w-4 h-4 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
              Cleaning Up...
            </>
          ) : (
            <>
              <Trash2 className="w-4 h-4" />
              Cleanup Placeholder Cities
            </>
          )}
        </button>

        <button
          onClick={handleClearData}
          disabled={clearing}
          className="flex-1 bg-red-500/20 text-red-400 border border-red-500/50 px-4 py-3 rounded-lg font-medium
            hover:bg-red-500/30 transition-colors
            disabled:opacity-50 disabled:cursor-not-allowed
            flex items-center justify-center gap-2"
        >
          {clearing ? (
            <>
              <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
              Clearing...
            </>
          ) : (
            <>
              <Trash2 className="w-4 h-4" />
              Clear All Rainfall Data
            </>
          )}
        </button>
      </div>

      <div className="mt-4 p-3 bg-background rounded border border-border/50">
        <div className="flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
          <div className="text-xs text-gray-400">
            <p className="font-medium mb-1">Supported CSV Formats:</p>

            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Atlas 14 standard export format (Point or Area)</li>
              <li>Files with metadata headers (Location, Station) before the table</li>
              <li>Matrix format (Duration vs Return Periods)</li>
              <li>List format (Duration, Return Period, Intensity columns)</li>
              <li>Flexible column name matching</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
