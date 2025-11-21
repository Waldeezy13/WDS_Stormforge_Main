'use client';

import React, { useState, useEffect } from 'react';
import { ReturnPeriod, getRainfallData, getCitiesByState, City } from '@/utils/atlas14';
import { MapPin, CloudRain, ChevronDown } from 'lucide-react';
import Atlas14Import from './Atlas14Import';

interface HydrologyProps {
  cityId: number;
  setCityId: (cityId: number) => void;
  selectedEvents: ReturnPeriod[];
  setSelectedEvents: (events: ReturnPeriod[]) => void;
}

const AVAILABLE_EVENTS: ReturnPeriod[] = ['2yr', '5yr', '10yr', '25yr', '50yr', '100yr'];

export default function Hydrology({ cityId, setCityId, selectedEvents, setSelectedEvents }: HydrologyProps) {
  const [citiesByState, setCitiesByState] = useState<Record<string, City[]>>({});
  const [rainfallData, setRainfallData] = useState<Array<{ durationMinutes: number; intensities: Record<ReturnPeriod, number> }>>([]);
  const [loading, setLoading] = useState(true);
  const [showImport, setShowImport] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

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

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!dropdownOpen) return;
    
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.city-dropdown')) {
        setDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [dropdownOpen]);

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
            <div className="relative city-dropdown">
              <button
                type="button"
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="w-full bg-background border border-border rounded px-4 py-3 text-base focus:ring-2 focus:ring-primary outline-none transition-all cursor-pointer hover:border-primary/50 text-left flex items-center justify-between"
              >
                <span>
                  {selectedCity 
                    ? `${selectedCity.name}, ${selectedCity.state}`
                    : 'Select a city...'}
                </span>
                <ChevronDown className={`w-5 h-5 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
              </button>
              
              {dropdownOpen && (
                <div className="absolute z-50 w-full mt-1 bg-background border border-border rounded shadow-lg max-h-96 overflow-y-auto">
                  {Object.entries(citiesByState).map(([state, cities]) => (
                    <div key={state}>
                      <div className="px-4 py-2 text-xs font-semibold text-gray-500 bg-slate-900/50 sticky top-0">
                        {state}
                      </div>
                      {cities.map(c => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            setCityId(c.id);
                            setDropdownOpen(false);
                          }}
                          className={`w-full px-4 py-3 text-left hover:bg-primary/10 transition-colors ${
                            cityId === c.id ? 'bg-primary/5' : ''
                          }`}
                        >
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-base">{c.name}, {c.state}</span>
                            {c.lastUpdated && (
                              <span className="text-[11px] text-gray-500 whitespace-nowrap ml-3 opacity-75">
                                Updated: {new Date(c.lastUpdated).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <p className="text-xs text-gray-500 mt-3">
            {selectedCity 
              ? `Pulling latest Atlas 14 Point Precipitation Frequency Estimates for ${selectedCity.name}, ${selectedCity.state}.`
              : 'Select a city to view rainfall data.'}
          </p>
          <button
            onClick={() => setShowImport(!showImport)}
            className="mt-3 text-xs text-primary hover:underline"
          >
            {showImport ? 'Hide' : 'Show'} CSV Import
          </button>
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
          <Atlas14Import />
        </div>
      )}

      {/* Data Table */}
      {rainfallData.length > 0 && (
        <div className="bg-card border border-border rounded-lg overflow-hidden shadow-xl">
          <div className="px-6 py-4 border-b border-border bg-slate-900/50">
            <h3 className="font-semibold text-lg flex items-center gap-2">
               Atlas 14 Rainfall Intensity Data (in/hr) 
               <span className="text-xs font-normal text-gray-400 ml-2 py-0.5 px-2 bg-slate-800 rounded-full">Source: NOAA</span>
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

    </div>
  );
}
