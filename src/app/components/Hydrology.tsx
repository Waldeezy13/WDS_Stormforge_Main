'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { ReturnPeriod, getRainfallData, getCitiesByState, clearAtlas14Cache, City, InterpolationMethod } from '@/utils/atlas14';
import { MapPin, CloudRain, Settings, Globe, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import RainfallDataImport from './Atlas14Import';
import IdfCurveChart from './charts/IdfCurveChart';
import SearchableComboBox, { ComboBoxOption } from './SearchableComboBox';

interface HydrologyProps {
  cityId: number;
  setCityId: (cityId: number) => void;
  selectedEvents: ReturnPeriod[];
  setSelectedEvents: (events: ReturnPeriod[]) => void;
  interpolationMethod: InterpolationMethod;
  setInterpolationMethod: (method: InterpolationMethod) => void;
}

const AVAILABLE_EVENTS: ReturnPeriod[] = ['2yr', '5yr', '10yr', '25yr', '50yr', '100yr'];

export default function Hydrology({ cityId, setCityId, selectedEvents, setSelectedEvents, interpolationMethod, setInterpolationMethod }: HydrologyProps) {
  const [citiesByState, setCitiesByState] = useState<Record<string, City[]>>({});
  const [rainfallData, setRainfallData] = useState<Array<{ durationMinutes: number; intensities: Record<ReturnPeriod, number> }>>([]);
  const [loading, setLoading] = useState(true);
  const [showImport, setShowImport] = useState(false);
  
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
      const order = { '2yr': 1, '5yr': 2, '10yr': 3, '25yr': 4, '50yr': 5, '100yr': 6 };
      newEvents.sort((a, b) => order[a] - order[b]);
      setSelectedEvents(newEvents);
    }
  };

  const selectedCity = Object.values(citiesByState)
    .flat()
    .find(c => c.id === cityId);

  return (
    <div className="p-8 max-w-7xl mx-auto text-foreground">
      
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
            {selectedCity 
              ? `Loading rainfall data for ${selectedCity.name}, ${selectedCity.state}${selectedCity.source ? ` (${selectedCity.source})` : ''}.`
              : 'Select a city to view rainfall data.'}
          </p>
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
        </div>
      </div>

      {/* CSV Import Section */}
      {showImport && (
        <div className="mb-8">
          <RainfallDataImport />
        </div>
      )}

      {/* NOAA Atlas 14 Fetch Section */}
      {showNoaaFetch && (
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
      {rainfallData.length > 0 && (
        <div className="bg-card border border-border rounded-lg overflow-hidden shadow-xl mb-8">
          <div className="px-6 py-4 border-b border-border bg-slate-900/50">
            <h3 className="font-semibold text-lg flex items-center gap-2">
               Rainfall Intensity Data (in/hr)
               {selectedCity?.source && (
                 <span className="text-xs font-normal text-gray-400 ml-2 py-0.5 px-2 bg-slate-800 rounded-full">
                   Source: {selectedCity.source}
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
                {rainfallData.map((row) => (
                  <tr key={row.durationMinutes} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-3 font-mono text-gray-300">{row.durationMinutes}</td>
                    {AVAILABLE_EVENTS.map(event => (
                      <td key={event} className={`px-6 py-3 text-right font-mono ${
                        selectedEvents.includes(event) ? 'text-white bg-primary/5' : 'text-gray-500'
                      }`}>
                        {row.intensities[event]?.toFixed(2) || 'N/A'}
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
      {rainfallData.length > 0 && selectedEvents.length > 0 && (
        <IdfCurveChart 
          rainfallData={rainfallData}
          selectedEvents={selectedEvents}
          interpolationMethod={interpolationMethod}
        />
      )}

      {/* Interpolation Method Selection - Moved to Bottom */}
      <div className="mb-8 bg-card p-6 rounded-lg border border-border shadow-lg">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-primary/10 rounded-full text-primary">
            <Settings className="w-5 h-5" />
          </div>
          <h2 className="text-lg font-semibold">Interpolation Method</h2>
        </div>
        <p className="text-sm text-gray-400 mb-4">
          Select how rainfall data is interpolated between duration points. The IDF curve above updates to reflect the selected method.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={() => setInterpolationMethod('log-log')}
            className={`px-4 py-3 rounded-lg border text-sm font-medium transition-all text-left flex-1 ${
              interpolationMethod === 'log-log'
                ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                : 'bg-background border-border text-gray-400 hover:border-gray-500'
            }`}
          >
            <div className="font-semibold mb-1">Log-Log Interpolation</div>
            <div className="text-xs opacity-75">
              Standard method for IDF curves. Interpolates linearly in log-log space, producing power-law relationships between data points. Curves appear as straight lines on the log-log graph.
            </div>
          </button>
          <button
            onClick={() => setInterpolationMethod('linear')}
            className={`px-4 py-3 rounded-lg border text-sm font-medium transition-all text-left flex-1 ${
              interpolationMethod === 'linear'
                ? 'bg-amber-500/20 border-amber-500 text-amber-400'
                : 'bg-background border-border text-gray-400 hover:border-gray-500'
            }`}
          >
            <div className="font-semibold mb-1">Linear Interpolation</div>
            <div className="text-xs opacity-75">
              Simple linear interpolation in arithmetic space. Less accurate for IDF relationships. Curves appear curved on the log-log graph because linear segments in arithmetic space are not linear in log-log space.
            </div>
          </button>
        </div>
        <div className="mt-4 p-3 bg-slate-900/50 rounded-lg text-xs text-gray-400">
          <strong className="text-gray-300">Note:</strong> The graph always uses log-log axes (standard in hydrology). 
          The interpolation method affects how values are calculated between source data points. 
          Log-log interpolation is generally preferred because IDF relationships follow power laws.
        </div>
      </div>

    </div>
  );
}
