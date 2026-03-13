'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { ReturnPeriod, getRainfallData, getCitiesByState, clearAtlas14Cache, City, InterpolationMethod, RainfallMethod, buildDisplayRainfallData, getInterpolationMethodLabel, getRainfallMethodLabel, type ManualIdfCoefficientsByPeriod } from '@/utils/atlas14';
import { MapPin, CloudRain, Settings, Globe, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import RainfallDataImport from './Atlas14Import';
import IdfCurveChart from './charts/IdfCurveChart';
import SearchableComboBox, { ComboBoxOption } from './SearchableComboBox';
import { MANUAL_IDF_EDITABLE_EVENTS, MUNICIPAL_RAINFALL_PRESETS, createMunicipalRainfallPresetCoefficients, supportsManualIdf } from '@/utils/manualIdf';

interface HydrologyProps {
  cityId: number;
  setCityId: (cityId: number) => void;
  selectedEvents: ReturnPeriod[];
  setSelectedEvents: (events: ReturnPeriod[]) => void;
  rainfallMethod: RainfallMethod;
  setRainfallMethod: (method: RainfallMethod) => void;
  manualIdfCoefficients: ManualIdfCoefficientsByPeriod;
  setManualIdfCoefficients: React.Dispatch<React.SetStateAction<ManualIdfCoefficientsByPeriod>>;
  interpolationMethod: InterpolationMethod;
  setInterpolationMethod: (method: InterpolationMethod) => void;
}

const AVAILABLE_EVENTS: ReturnPeriod[] = ['1yr', '2yr', '5yr', '10yr', '25yr', '50yr', '100yr', '500yr'];

export default function Hydrology({ cityId, setCityId, selectedEvents, setSelectedEvents, rainfallMethod, setRainfallMethod, manualIdfCoefficients, setManualIdfCoefficients, interpolationMethod, setInterpolationMethod }: HydrologyProps) {
  const [citiesByState, setCitiesByState] = useState<Record<string, City[]>>({});
  const [rainfallData, setRainfallData] = useState<Array<{ durationMinutes: number; intensities: Record<ReturnPeriod, number> }>>([]);
  const [loading, setLoading] = useState(true);
  const [showImport, setShowImport] = useState(false);
  const [selectedPresetId, setSelectedPresetId] = useState(MUNICIPAL_RAINFALL_PRESETS[0]?.id ?? 'default-municipal');
  
  // NOAA Atlas 14 fetch states
  const [showNoaaFetch, setShowNoaaFetch] = useState(false);
  const [fetchLat, setFetchLat] = useState('');
  const [fetchLon, setFetchLon] = useState('');
  const [fetchName, setFetchName] = useState('');
  const [fetchState, setFetchState] = useState('');
  const [fetchUnits, setFetchUnits] = useState<'ENGLISH' | 'METRIC'>('ENGLISH');
  const [fetchSeriesType, setFetchSeriesType] = useState<'PDS' | 'AMS'>('PDS');
  const [fetchLoading, setFetchLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [fetchSuccess, setFetchSuccess] = useState<string | null>(null);
  
  // Refresh state
  const [refreshingCityId, setRefreshingCityId] = useState<number | null>(null);

  const updateManualIdfCoefficient = (returnPeriod: ReturnPeriod, field: 'b' | 'd' | 'e', value: string) => {
    setManualIdfCoefficients((current) => {
      const next = { ...current };
      const existing = { ...(current[returnPeriod] ?? {}) };

      if (value.trim() === '') {
        delete existing[field];
      } else {
        const parsed = Number.parseFloat(value);
        existing[field] = Number.isFinite(parsed) ? parsed : undefined;
      }

      if (
        typeof existing.b === 'undefined' &&
        typeof existing.d === 'undefined' &&
        typeof existing.e === 'undefined'
      ) {
        delete next[returnPeriod];
      } else {
        next[returnPeriod] = existing;
      }

      return next;
    });
  };

  const applyMunicipalPreset = () => {
    setManualIdfCoefficients(createMunicipalRainfallPresetCoefficients(selectedPresetId));
  };

  // Function to reload cities and data
  const reloadCities = async () => {
    clearAtlas14Cache();
    const cities = await getCitiesByState();
    setCitiesByState(cities);
    return cities;
  };

  // Function to handle NOAA fetch
  const handleNoaaFetch = async () => {
    setFetchError(null);
    setFetchSuccess(null);
    
    const lat = parseFloat(fetchLat);
    const lon = parseFloat(fetchLon);
    
    if (isNaN(lat) || isNaN(lon)) {
      setFetchError('Please enter valid latitude and longitude values');
      return;
    }
    
    if (!fetchName.trim()) {
      setFetchError('Please enter a location name');
      return;
    }
    
    if (!fetchState.trim() || fetchState.trim().length !== 2) {
      setFetchError('Please enter a valid 2-letter state abbreviation');
      return;
    }
    
    setFetchLoading(true);
    
    try {
      const response = await fetch('/api/atlas14/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat,
          lon,
          name: fetchName.trim(),
          state: fetchState.trim().toUpperCase(),
          units: fetchUnits,
          basis: 'INTENSITY',
          seriesType: fetchSeriesType,
        }),
      });
      
      const result = await response.json();
      
      if (!result.success) {
        setFetchError(result.message || 'Failed to fetch data from NOAA');
        return;
      }
      
      setFetchSuccess(`Successfully imported ${result.dataCount} data points for ${result.city.name}, ${result.city.state}`);
      
      // Reload cities and select the new one
      await reloadCities();
      if (result.city?.id) {
        setCityId(result.city.id);
        // Load the rainfall data for the new city
        const data = await getRainfallData(result.city.id);
        setRainfallData(data);
      }
      
      // Clear form
      setFetchLat('');
      setFetchLon('');
      setFetchName('');
      setFetchState('');
      
    } catch (error) {
      setFetchError(error instanceof Error ? error.message : 'An error occurred');
    } finally {
      setFetchLoading(false);
    }
  };

  // Function to refresh an Atlas 14 city
  const handleRefreshCity = async (city: City) => {
    if (city.sourceType !== 'ATLAS14') return;
    
    setRefreshingCityId(city.id);
    
    try {
      const response = await fetch(`/api/atlas14/cities/${city.id}/refresh`, {
        method: 'POST',
      });
      
      const result = await response.json();
      
      if (!result.success) {
        alert(`Failed to refresh: ${result.message}`);
        return;
      }
      
      // Reload cities
      await reloadCities();
      
      // Reload rainfall data if this is the selected city
      if (city.id === cityId) {
        const data = await getRainfallData(city.id);
        setRainfallData(data);
      }
      
    } catch (error) {
      alert(error instanceof Error ? error.message : 'An error occurred');
    } finally {
      setRefreshingCityId(null);
    }
  };

  // Fetch cities on mount
  useEffect(() => {
    async function loadCities() {
      const cities = await getCitiesByState();
      setCitiesByState(cities);
      
      // Set default city to first available city if none selected
      if (cityId === 0 && Object.keys(cities).length > 0) {
        const firstState = Object.keys(cities)[0];
        const firstCity = cities[firstState][0];
        if (firstCity) {
          setCityId(firstCity.id);
        }
      }
      setLoading(false);
    }
    loadCities();
  }, [cityId, setCityId]);

  // Fetch rainfall data when city changes
  useEffect(() => {
    if (cityId > 0) {
      async function loadRainfallData() {
        const data = await getRainfallData(cityId);
        setRainfallData(data);
      }
      loadRainfallData();
    }
  }, [cityId]);

  // Convert cities to ComboBoxOption format
  const cityOptions: ComboBoxOption[] = useMemo(() => {
    return Object.entries(citiesByState).flatMap(([state, cities]) =>
      cities.map(city => ({
        id: city.id,
        label: city.name,
        group: state,
        source: city.source,
        sourceType: city.sourceType,
        latitude: city.latitude,
        longitude: city.longitude,
        lastUpdated: city.lastUpdated,
      }))
    );
  }, [citiesByState]);

  // Handle refresh from combobox
  const handleRefreshFromComboBox = (option: ComboBoxOption) => {
    const city = Object.values(citiesByState)
      .flat()
      .find(c => c.id === option.id);
    if (city) {
      handleRefreshCity(city);
    }
  };

  const toggleEvent = (event: ReturnPeriod) => {
    if (selectedEvents.includes(event)) {
      // Don't allow unselecting the last event (maintain at least one)
      if (selectedEvents.length > 1) {
        setSelectedEvents(selectedEvents.filter(e => e !== event));
      }
    } else {
      // Sort events by return period magnitude when adding
      const newEvents = [...selectedEvents, event];
      const order: Record<ReturnPeriod, number> = { '1yr': 0, '2yr': 1, '5yr': 2, '10yr': 3, '25yr': 4, '50yr': 5, '100yr': 6, '500yr': 7 };
      newEvents.sort((a, b) => order[a] - order[b]);
      setSelectedEvents(newEvents);
    }
  };

  const selectedCity = Object.values(citiesByState)
    .flat()
    .find(c => c.id === cityId);

  const missingSelectedManualIdfEvents = useMemo(() => {
    if (rainfallMethod !== 'manual-idf') {
      return [] as ReturnPeriod[];
    }

    return selectedEvents.filter((event) => !supportsManualIdf(event, manualIdfCoefficients));
  }, [selectedEvents, rainfallMethod, manualIdfCoefficients]);

  const displayRainfallData = useMemo(() => {
    return buildDisplayRainfallData(rainfallData, rainfallMethod, manualIdfCoefficients);
  }, [rainfallData, rainfallMethod, manualIdfCoefficients]);

  return (
    <div className="p-8 max-w-7xl mx-auto text-foreground">
      <div className="mb-8 bg-card p-6 rounded-lg border border-border shadow-lg">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-primary/10 rounded-full text-primary">
            <CloudRain className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">Rainfall Method</h2>
            <p className="text-sm text-gray-400">Choose whether intensities come from NOAA Atlas 14 data or a municipal B/D/E coefficient equation.</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <button
            onClick={() => setRainfallMethod('atlas14')}
            className={`rounded-lg border px-4 py-4 text-left transition-all ${
              rainfallMethod === 'atlas14'
                ? 'border-primary bg-primary/10 text-white'
                : 'border-border bg-background text-gray-300 hover:border-gray-500'
            }`}
          >
            <div className="font-semibold">NOAA Atlas 14</div>
            <div className="mt-1 text-xs opacity-80">Use saved or imported location rainfall data with selectable interpolation.</div>
          </button>
          <button
            onClick={() => setRainfallMethod('manual-idf')}
            className={`rounded-lg border px-4 py-4 text-left transition-all ${
              rainfallMethod === 'manual-idf'
                ? 'border-amber-400 bg-amber-500/10 text-white'
                : 'border-border bg-background text-gray-300 hover:border-gray-500'
            }`}
          >
            <div className="font-semibold">Municipal IDF (B/D/E)</div>
            <div className="mt-1 text-xs opacity-80">Use $I = b / (T_c + d)^e$ coefficients with editable storm-specific values.</div>
          </button>
        </div>
      </div>
      
      <div className="flex flex-col md:flex-row gap-8 mb-10">
        {/* City Selection */}
        <div className="bg-card p-6 rounded-lg border border-border shadow-lg flex-1">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-primary/10 rounded-full text-primary">
              <MapPin className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-semibold">Project Location</h2>
          </div>
          <label className="block text-sm text-gray-400 mb-2">Select City / Region</label>
          {loading ? (
            <div className="w-full bg-background border border-border rounded px-4 py-3 text-base">
              Loading cities...
            </div>
          ) : (
            <SearchableComboBox
              options={cityOptions}
              value={cityId}
              onChange={setCityId}
              placeholder="Select a city..."
              groupBy={true}
              onRefresh={handleRefreshFromComboBox}
              refreshingId={refreshingCityId}
            />
          )}
          <p className="text-xs text-gray-500 mt-3">
            {rainfallMethod === 'manual-idf'
              ? selectedCity
                ? `Location remains available for project context and for switching back to Atlas 14. Municipal B/D/E coefficients drive the active calculations for ${selectedCity.name}, ${selectedCity.state}.`
                : 'Select a city to keep project context, even when municipal B/D/E coefficients are driving the active calculations.'
              : selectedCity 
                ? `Loading rainfall data for ${selectedCity.name}, ${selectedCity.state}${selectedCity.source ? ` (${selectedCity.source})` : ''}.`
                : 'Select a city to view rainfall data.'}
          </p>
          {rainfallMethod === 'atlas14' && (
            <div className="flex gap-3 mt-3">
              <button
                onClick={() => setShowImport(!showImport)}
                className="text-xs text-primary hover:underline"
              >
                {showImport ? 'Hide' : 'Show'} CSV Import
              </button>
              <button
                onClick={() => setShowNoaaFetch(!showNoaaFetch)}
                className="text-xs text-emerald-400 hover:underline flex items-center gap-1"
              >
                <Globe className="w-3 h-3" />
                {showNoaaFetch ? 'Hide' : 'Fetch from'} NOAA Atlas 14
              </button>
            </div>
          )}
        </div>

        {/* Storm Event Selection */}
        <div className="bg-card p-6 rounded-lg border border-border shadow-lg flex-1">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-accent/10 rounded-full text-accent">
              <CloudRain className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-semibold">Storm Events</h2>
          </div>
          <p className="text-sm text-gray-400 mb-4">Select return periods to evaluate in the design.</p>
          <div className="grid grid-cols-3 gap-3">
            {AVAILABLE_EVENTS.map(event => (
              <button
                key={event}
                onClick={() => toggleEvent(event)}
                aria-label={`Toggle ${event} storm event`}
                className={`px-3 py-2 rounded border text-sm font-medium transition-all ${
                  selectedEvents.includes(event)
                    ? 'bg-primary/20 border-primary text-primary'
                    : 'bg-background border-border text-gray-400 hover:border-gray-500'
                }`}
              >
                {event.toUpperCase()}
              </button>
            ))}
          </div>
          {missingSelectedManualIdfEvents.length > 0 && (
            <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
              Municipal IDF (B/D/E) is selected, but these active storms do not have complete coefficients: {missingSelectedManualIdfEvents.map((event) => event.toUpperCase()).join(', ')}. They will display as N/A and calculate as zero until b, d, and e are entered below.
            </div>
          )}
        </div>
      </div>

      {/* CSV Import Section */}
      {rainfallMethod === 'atlas14' && showImport && (
        <div className="mb-8">
          <RainfallDataImport />
        </div>
      )}

      {/* NOAA Atlas 14 Fetch Section */}
      {rainfallMethod === 'atlas14' && showNoaaFetch && (
        <div className="mb-8 bg-card p-6 rounded-lg border border-border shadow-lg">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-emerald-500/10 rounded-full text-emerald-400">
              <Globe className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-semibold">Fetch from NOAA Atlas 14</h2>
          </div>
          <p className="text-sm text-gray-400 mb-4">
            Enter coordinates to fetch rainfall intensity data directly from NOAA&apos;s Precipitation Frequency Data Server.
            This works for locations within the United States covered by Atlas 14.
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Latitude</label>
              <input
                type="number"
                step="0.0001"
                placeholder="e.g., 33.0198"
                value={fetchLat}
                onChange={(e) => setFetchLat(e.target.value)}
                aria-label="Latitude coordinate"
                className="w-full bg-background border border-border rounded px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Longitude</label>
              <input
                type="number"
                step="0.0001"
                placeholder="e.g., -96.6989"
                value={fetchLon}
                onChange={(e) => setFetchLon(e.target.value)}
                aria-label="Longitude coordinate"
                className="w-full bg-background border border-border rounded px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Location Name</label>
              <input
                type="text"
                placeholder="e.g., Plano"
                value={fetchName}
                onChange={(e) => setFetchName(e.target.value)}
                aria-label="Location name"
                className="w-full bg-background border border-border rounded px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">State (2-letter)</label>
              <input
                type="text"
                placeholder="e.g., TX"
                maxLength={2}
                value={fetchState}
                onChange={(e) => setFetchState(e.target.value.toUpperCase())}
                aria-label="State abbreviation"
                className="w-full bg-background border border-border rounded px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none uppercase"
              />
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Units</label>
              <select
                value={fetchUnits}
                onChange={(e) => setFetchUnits(e.target.value as 'ENGLISH' | 'METRIC')}
                title="Select measurement units"
                className="w-full bg-background border border-border rounded px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
              >
                <option value="ENGLISH">English (in/hr)</option>
                <option value="METRIC">Metric (mm/hr)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Series Type</label>
              <select
                value={fetchSeriesType}
                onChange={(e) => setFetchSeriesType(e.target.value as 'PDS' | 'AMS')}
                title="Select precipitation series type"
                className="w-full bg-background border border-border rounded px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
              >
                <option value="PDS">Partial Duration Series (PDS)</option>
                <option value="AMS">Annual Maximum Series (AMS)</option>
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={handleNoaaFetch}
                disabled={fetchLoading}
                className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-800 disabled:cursor-not-allowed text-white font-medium px-4 py-2 rounded transition-colors flex items-center justify-center gap-2"
              >
                {fetchLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Fetching...
                  </>
                ) : (
                  <>
                    <Globe className="w-4 h-4" />
                    Fetch Data
                  </>
                )}
              </button>
            </div>
          </div>
          
          {/* Error message */}
          {fetchError && (
            <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded text-red-400 text-sm">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{fetchError}</span>
            </div>
          )}
          
          {/* Success message */}
          {fetchSuccess && (
            <div className="flex items-start gap-2 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded text-emerald-400 text-sm">
              <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{fetchSuccess}</span>
            </div>
          )}
          
          <div className="mt-4 p-3 bg-slate-900/50 rounded-lg text-xs text-gray-400">
            <strong className="text-gray-300">Test Coordinates:</strong>
            <ul className="mt-1 space-y-0.5 ml-4 list-disc">
              <li>Plano, TX: 33.0198, -96.6989</li>
              <li>Dallas, TX: 32.7767, -96.7970</li>
              <li>Houston, TX: 29.7604, -95.3698</li>
            </ul>
          </div>
        </div>
      )}

      {/* Data Table */}
      {displayRainfallData.length > 0 && (
        <div className="bg-card border border-border rounded-lg overflow-hidden shadow-xl mb-8">
          <div className="px-6 py-4 border-b border-border bg-slate-900/50">
            <h3 className="font-semibold text-lg flex items-center gap-2">
               Rainfall Intensity Data (in/hr)
               {(rainfallMethod === 'manual-idf' || selectedCity?.source) && (
                 <span className="text-xs font-normal text-gray-400 ml-2 py-0.5 px-2 bg-slate-800 rounded-full">
                   Source: {rainfallMethod === 'manual-idf' ? getRainfallMethodLabel(rainfallMethod) : selectedCity?.source}
                 </span>
               )}
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-900/30 text-xs uppercase text-gray-400 font-medium">
                <tr>
                  <th className="px-6 py-3">Duration (min)</th>
                  {AVAILABLE_EVENTS.map(event => (
                    <th key={event} className={`px-6 py-3 text-right ${selectedEvents.includes(event) ? 'text-primary font-bold' : ''}`}>
                      {event.toUpperCase()}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {displayRainfallData.map((row) => (
                  <tr key={row.durationMinutes} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-3 font-mono text-gray-300">{row.durationMinutes}</td>
                    {AVAILABLE_EVENTS.map(event => (
                      <td key={event} className={`px-6 py-3 text-right font-mono ${
                        selectedEvents.includes(event) ? 'text-white bg-primary/5' : 'text-gray-500'
                      }`}>
                        {Number.isFinite(row.intensities[event]) ? row.intensities[event].toFixed(2) : 'N/A'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* IDF Curve Visualization */}
      {displayRainfallData.length > 0 && selectedEvents.length > 0 && (
        <IdfCurveChart 
          rainfallData={displayRainfallData}
          selectedEvents={selectedEvents}
          rainfallMethod={rainfallMethod}
          manualIdfCoefficients={manualIdfCoefficients}
          interpolationMethod={interpolationMethod}
        />
      )}

      {rainfallMethod === 'atlas14' && (
        <div className="mb-8 bg-card p-6 rounded-lg border border-border shadow-lg">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-primary/10 rounded-full text-primary">
              <Settings className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-semibold">Interpolation Method</h2>
          </div>
          <p className="text-sm text-gray-400 mb-4">
            Select how Atlas 14 rainfall data is interpolated between duration points. The IDF curve above updates to reflect the selected method.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => setInterpolationMethod('log-log')}
              aria-label="Select Log-Log interpolation method"
              className={`px-4 py-3 rounded-lg border text-sm font-medium transition-all text-left flex-1 ${
                interpolationMethod === 'log-log'
                  ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                  : 'bg-background border-border text-gray-400 hover:border-gray-500'
              }`}
            >
              <div className="font-semibold mb-1">Log-Log Interpolation</div>
              <div className="text-xs opacity-75">
                Standard method for IDF curves. Interpolates linearly in log-log space, producing power-law relationships between data points.
              </div>
            </button>
            <button
              onClick={() => setInterpolationMethod('linear')}
              aria-label="Select Linear interpolation method"
              className={`px-4 py-3 rounded-lg border text-sm font-medium transition-all text-left flex-1 ${
                interpolationMethod === 'linear'
                  ? 'bg-amber-500/20 border-amber-500 text-amber-400'
                  : 'bg-background border-border text-gray-400 hover:border-gray-500'
              }`}
            >
              <div className="font-semibold mb-1">Linear Interpolation</div>
              <div className="text-xs opacity-75">
                Simple linear interpolation in arithmetic space. Less accurate for IDF relationships, but still available when needed.
              </div>
            </button>
          </div>
          <div className="mt-4 p-3 bg-slate-900/50 rounded-lg text-xs text-gray-400">
            <strong className="text-gray-300">Current Selection:</strong> {getRainfallMethodLabel(rainfallMethod)} using {getInterpolationMethodLabel(interpolationMethod)} interpolation.
          </div>
        </div>
      )}

      {rainfallMethod === 'manual-idf' && (
        <div className="mb-8 bg-card p-6 rounded-lg border border-amber-500/30 shadow-lg">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-amber-500/10 rounded-full text-amber-300">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Municipal IDF (B/D/E) Coefficients</h2>
              <p className="text-sm text-gray-400">Enter the b, d, and e values used in I = b / (Tc + d)^e. These values are used app-wide and saved with the project.</p>
            </div>
          </div>
          <div className="mb-4 rounded-lg border border-border bg-slate-900/40 p-4">
            <div className="flex flex-col lg:flex-row lg:items-end gap-3">
              <div className="flex-1">
                <label className="block text-xs text-gray-400 mb-1">Municipal Preset</label>
                <select
                  value={selectedPresetId}
                  onChange={(e) => setSelectedPresetId(e.target.value)}
                  className="w-full rounded border border-border bg-slate-900 px-3 py-2 text-white focus:border-amber-400 focus:outline-none"
                >
                  {MUNICIPAL_RAINFALL_PRESETS.map((preset) => (
                    <option key={preset.id} value={preset.id}>{preset.label}</option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={applyMunicipalPreset}
                className="rounded border border-amber-400/40 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-200 transition-colors hover:bg-amber-500/20"
              >
                Apply Preset
              </button>
            </div>
            <p className="mt-2 text-xs text-gray-400">
              {MUNICIPAL_RAINFALL_PRESETS.find((preset) => preset.id === selectedPresetId)?.description} Applying a preset replaces the current coefficient table.
            </p>
          </div>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-slate-900/60 text-gray-300">
                <tr>
                  <th className="px-4 py-3 text-left">Storm</th>
                  <th className="px-4 py-3 text-left">b</th>
                  <th className="px-4 py-3 text-left">d</th>
                  <th className="px-4 py-3 text-left">e</th>
                </tr>
              </thead>
              <tbody>
                {MANUAL_IDF_EDITABLE_EVENTS.map((event) => (
                  <tr key={event} className="border-t border-border">
                    <td className="px-4 py-3 font-medium text-white">{event.toUpperCase()}</td>
                    {(['b', 'd', 'e'] as const).map((field) => (
                      <td key={field} className="px-4 py-3">
                        <input
                          type="number"
                          step="0.001"
                          value={manualIdfCoefficients[event]?.[field] ?? ''}
                          onChange={(e) => updateManualIdfCoefficient(event, field, e.target.value)}
                          placeholder="Enter value"
                          className="w-full rounded border border-border bg-slate-900 px-3 py-2 text-white focus:border-amber-400 focus:outline-none"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
            Municipal IDF keeps all storm-event wiring active. Any storm row left blank will display as N/A in Hydrology and calculate as zero until valid b, d, and e values are entered.
          </div>
        </div>
      )}

    </div>
  );
}
