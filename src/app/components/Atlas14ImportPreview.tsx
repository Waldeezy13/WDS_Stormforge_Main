'use client';

import React, { useState } from 'react';
import { Save, X, Edit2, CheckCircle, AlertCircle } from 'lucide-react';
import { clearAtlas14Cache } from '@/utils/atlas14';

interface ParsedData {
  city: string;
  state: string;
  durationMinutes: number;
  returnPeriod: string;
  intensity: number;
  source?: string;
}

interface PreviewProps {
  data: ParsedData[];
  cities: Array<{ city: string; state: string; source?: string; recordCount: number }>;
  errors?: string[];
  warnings?: string[];
  totalRows: number;
  parsedRows: number;
  detectedHeaders?: string[];
  columnMappings?: Record<string, string>;
  sampleRows?: Array<{ rowNumber: number; data: Record<string, unknown>; keys: string[] }>;
  onCancel: () => void;
  onSave: () => void;
}

export default function Atlas14ImportPreview({
  data,
  cities,
  errors,
  warnings,
  totalRows,
  parsedRows,
  detectedHeaders,
  columnMappings,
  onCancel,
  onSave
}: PreviewProps) {
  const [editableData, setEditableData] = useState<ParsedData[]>(data);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ success: boolean; message: string } | null>(null);
  
  // Get initial source from first data row or cities array
  const initialSource = data[0]?.source || cities[0]?.source || '';
  const [dataSource, setDataSource] = useState<string>(initialSource);

  const updateValue = (index: number, field: keyof ParsedData, value: string | number) => {
    const newData = [...editableData];
    if (field === 'durationMinutes' || field === 'intensity') {
      newData[index] = { ...newData[index], [field]: parseFloat(value.toString()) || 0 };
    } else {
      newData[index] = { ...newData[index], [field]: value.toString() };
    }
    setEditableData(newData);
  };

  const handleSave = async () => {
    // First, check if any cities already have data
    const uniqueCities = Array.from(
      new Map(
        editableData.map(row => [`${row.city.trim()}-${row.state.trim().toUpperCase()}`, { 
          city: row.city.trim(), 
          state: row.state.trim().toUpperCase() 
        }])
      ).values()
    );

    try {
      const checkResponse = await fetch('/api/atlas14/import/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cities: uniqueCities }),
      });

      const checkResult = await checkResponse.json();

      if (checkResult.hasExistingData) {
        const message = `The following cities already have data in the database:\n${checkResult.citiesWithData.join('\n')}\n\nThis will overwrite the existing data. Do you want to continue?`;
        
        if (!confirm(message)) {
          return; // User cancelled
        }
      }
    } catch (error) {
      console.error('Error checking existing data:', error);
      // Continue with save even if check fails
    }

    setSaving(true);
    setSaveResult(null);

    try {
      const response = await fetch('/api/atlas14/import/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          data: editableData,
          source: dataSource || undefined  // Pass the global source
        }),
      });

      const result = await response.json();

      if (response.ok) {
        setSaveResult({ success: true, message: result.message });
        clearAtlas14Cache();
        setTimeout(() => {
          onSave();
        }, 1500);
      } else {
        setSaveResult({ success: false, message: result.error || 'Failed to save' });
      }
    } catch {
      setSaveResult({ success: false, message: 'Failed to save data' });
    } finally {
      setSaving(false);
    }
  };

  // Group data by city for better display
  const dataByCity = new Map<string, ParsedData[]>();
  for (const row of editableData) {
    const key = `${row.city}-${row.state}`;
    if (!dataByCity.has(key)) {
      dataByCity.set(key, []);
    }
    dataByCity.get(key)!.push(row);
  }

  return (
    <div className="bg-card p-6 rounded-lg border border-border shadow-lg max-h-[90vh] overflow-y-auto">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-full text-primary">
            <Edit2 className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">Review & Confirm Import</h2>
            <p className="text-sm text-gray-400">
              {parsedRows} rows parsed from {totalRows} total rows
            </p>
          </div>
        </div>
        <button
          onClick={onCancel}
          className="p-2 hover:bg-background rounded-lg transition-colors"
          title="Close"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Summary */}
      <div className="mb-4 p-3 bg-background rounded border border-border/50">
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <span className="text-gray-400">Cities Found:</span>
            <span className="ml-2 font-semibold">{cities.length}</span>
          </div>
          <div>
            <span className="text-gray-400">Data Points:</span>
            <span className="ml-2 font-semibold">{parsedRows}</span>
          </div>
          <div>
            <span className="text-gray-400">Total Rows:</span>
            <span className="ml-2 font-semibold">{totalRows}</span>
          </div>
        </div>
      </div>

      {/* Data Source */}
      <div className="mb-4 p-3 bg-background rounded border border-border/50">
        <label className="block text-sm text-gray-400 mb-2">
          Data Source <span className="text-gray-500">(optional - e.g., &quot;NOAA Atlas 14&quot;, &quot;City of Dallas&quot;)</span>
        </label>
        <input
          type="text"
          value={dataSource}
          onChange={(e) => setDataSource(e.target.value)}
          placeholder="Enter data source (e.g., NOAA Atlas 14, Municipal Data)"
          className="w-full bg-slate-900/50 border border-border rounded px-3 py-2 text-sm outline-none focus:border-primary"
        />
      </div>

      {/* Column Detection Info */}
      {columnMappings && (
        <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/50 rounded text-sm">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-medium text-blue-400 mb-2">Detected Column Mappings:</p>
              <div className="grid grid-cols-2 gap-2 text-xs text-blue-300">
                <div><span className="font-medium">City:</span> {columnMappings.city}</div>
                <div><span className="font-medium">State:</span> {columnMappings.state}</div>
                <div><span className="font-medium">Duration:</span> {columnMappings.duration}</div>
                <div><span className="font-medium">Source:</span> {columnMappings.source}</div>
                <div><span className="font-medium">Return Period:</span> {columnMappings.returnPeriod}</div>
                <div><span className="font-medium">Intensity:</span> {columnMappings.intensity}</div>
              </div>
              {detectedHeaders && (
                <div className="mt-2 text-xs text-blue-300">
                  <span className="font-medium">All detected columns:</span> {detectedHeaders.join(', ')}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Errors & Warnings */}
      {errors && errors.length > 0 && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/50 rounded text-sm">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-medium text-red-400 mb-1">Errors ({errors.length}):</p>
              <div className="max-h-40 overflow-y-auto">
                <ul className="list-disc list-inside space-y-1 text-red-300 text-xs">
                  {errors.slice(0, 10).map((error, idx) => (
                    <li key={idx} className="break-words">{error}</li>
                  ))}
                  {errors.length > 10 && <li>... and {errors.length - 10} more errors (scroll to see all)</li>}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {warnings && warnings.length > 0 && (
        <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/50 rounded text-sm">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium text-yellow-400 mb-1">Warnings ({warnings.length}):</p>
              <ul className="list-disc list-inside space-y-1 text-yellow-300 text-xs">
                {warnings.slice(0, 5).map((warning, idx) => (
                  <li key={idx}>{warning}</li>
                ))}
                {warnings.length > 5 && <li>... and {warnings.length - 5} more warnings</li>}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Editable Data Table */}
      <div className="mb-4">
        <h3 className="text-sm font-medium text-gray-400 mb-2">Data Preview (Editable)</h3>
        <div className="overflow-x-auto border border-border rounded">
          <table className="w-full text-xs">
            <thead className="bg-slate-900/50 text-left">
              <tr>
                <th className="px-3 py-2 border-b border-border">City</th>
                <th className="px-3 py-2 border-b border-border">State</th>
                <th className="px-3 py-2 border-b border-border text-right">Duration (min)</th>
                <th className="px-3 py-2 border-b border-border">Return Period</th>
                <th className="px-3 py-2 border-b border-border text-right">Intensity (in/hr)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {editableData.map((row, idx) => (
                <tr key={idx} className="hover:bg-white/5">
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={row.city}
                      onChange={(e) => updateValue(idx, 'city', e.target.value)}
                      className="w-full bg-transparent border border-transparent hover:border-border focus:border-primary rounded px-2 py-1 outline-none"
                      title="City name"
                      aria-label="City name"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={row.state}
                      onChange={(e) => updateValue(idx, 'state', e.target.value)}
                      className="w-full bg-transparent border border-transparent hover:border-border focus:border-primary rounded px-2 py-1 outline-none uppercase"
                      maxLength={2}
                      title="State abbreviation"
                      aria-label="State abbreviation"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      value={row.durationMinutes}
                      onChange={(e) => updateValue(idx, 'durationMinutes', e.target.value)}
                      className="w-full bg-transparent border border-transparent hover:border-border focus:border-primary rounded px-2 py-1 outline-none text-right font-mono"
                      title="Duration in minutes"
                      aria-label="Duration in minutes"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={row.returnPeriod}
                      onChange={(e) => updateValue(idx, 'returnPeriod', e.target.value)}
                      className="w-full bg-transparent border border-transparent hover:border-border focus:border-primary rounded px-2 py-1 outline-none"
                      title="Return period"
                      aria-label="Return period"
                    >
                      <option value="2yr">2yr</option>
                      <option value="5yr">5yr</option>
                      <option value="10yr">10yr</option>
                      <option value="25yr">25yr</option>
                      <option value="50yr">50yr</option>
                      <option value="100yr">100yr</option>
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      step="0.01"
                      value={row.intensity}
                      onChange={(e) => updateValue(idx, 'intensity', e.target.value)}
                      className="w-full bg-transparent border border-transparent hover:border-border focus:border-primary rounded px-2 py-1 outline-none text-right font-mono"
                      title="Rainfall intensity (in/hr)"
                      aria-label="Rainfall intensity (in/hr)"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Save Result */}
      {saveResult && (
        <div className={`mb-4 p-3 rounded border ${
          saveResult.success
            ? 'bg-green-500/10 border-green-500/50 text-green-400'
            : 'bg-red-500/10 border-red-500/50 text-red-400'
        }`}>
          <div className="flex items-center gap-2">
            {saveResult.success ? (
              <CheckCircle className="w-4 h-4" />
            ) : (
              <AlertCircle className="w-4 h-4" />
            )}
            <p>{saveResult.message}</p>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={handleSave}
          disabled={saving || editableData.length === 0}
          className="flex-1 bg-primary text-primary-foreground px-4 py-3 rounded-lg font-medium
            hover:bg-primary/90 transition-colors
            disabled:opacity-50 disabled:cursor-not-allowed
            flex items-center justify-center gap-2"
        >
          {saving ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              Save to Database
            </>
          )}
        </button>
        <button
          onClick={onCancel}
          disabled={saving}
          className="px-4 py-3 rounded-lg border border-border hover:bg-background transition-colors
            disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
