'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Settings, X, Trash2, Database, Loader2 } from 'lucide-react';
import { clearAtlas14Cache, City } from '@/utils/atlas14';

interface CityWithData extends City {
  dataCount: number;
}

export default function SettingsMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const [cities, setCities] = useState<Record<string, CityWithData[]>>({});
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      loadCities();
    }
  }, [isOpen]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const loadCities = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/atlas14/cities');
      const data = await response.json();
      
      // Transform the data to include dataCount
      const transformedData: Record<string, CityWithData[]> = {};
      for (const [state, stateCities] of Object.entries(data)) {
        transformedData[state] = (stateCities as CityWithData[]).map(city => ({
          ...city,
          dataCount: city.dataCount || 0
        }));
      }
      
      setCities(transformedData);
    } catch (error) {
      console.error('Error loading cities:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCity = async (cityId: number, cityName: string, state: string) => {
    if (!confirm(`Are you sure you want to delete ${cityName}, ${state}? This will also delete all associated rainfall data. This action cannot be undone.`)) {
      return;
    }

    setDeleting(cityId);
    try {
      const response = await fetch(`/api/atlas14/cities/${cityId}`, {
        method: 'DELETE',
      });

      const result = await response.json();

      if (response.ok) {
        clearAtlas14Cache();
        // Reload cities list
        await loadCities();
        // Reload the page to refresh the city selection
        window.location.reload();
      } else {
        alert('Failed to delete city: ' + (result.error || 'Unknown error'));
      }
    } catch (_error) {
      alert('Failed to delete city');
    } finally {
      setDeleting(null);
    }
  };

  const totalCities = Object.values(cities).flat().length;
  const citiesWithData = Object.values(cities).flat().filter(c => c.dataCount > 0).length;

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 hover:bg-background rounded-lg transition-colors"
        aria-label="Settings"
      >
        <Settings className="w-5 h-5 text-gray-400 hover:text-white" />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-96 bg-card border border-border rounded-lg shadow-xl z-50 max-h-[80vh] overflow-hidden flex flex-col">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Settings className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold">Settings</h2>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 hover:bg-background rounded transition-colors"
              title="Close settings"
              aria-label="Close settings"
            >
              <X className="w-4 h-4 text-gray-400" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* Data Section */}
            <div className="p-4 border-b border-border">
              <div className="flex items-center gap-2 mb-3">
                <Database className="w-4 h-4 text-primary" />
                <h3 className="font-semibold text-sm">Data</h3>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                </div>
              ) : totalCities === 0 ? (
                <div className="text-sm text-gray-400 py-4 text-center">
                  No saved locations found
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="text-xs text-gray-400 mb-3">
                    {totalCities} location{totalCities !== 1 ? 's' : ''} • {citiesWithData} with data
                  </div>

                  {Object.entries(cities).map(([state, stateCities]) => (
                    <div key={state} className="space-y-2">
                      <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                        {state}
                      </div>
                      {stateCities.map((city) => (
                        <div
                          key={city.id}
                          className="flex items-center justify-between p-2 bg-background/50 rounded border border-border/50 hover:border-border transition-colors"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-white truncate">
                              {city.name}
                            </div>
                            <div className="text-xs text-gray-400 flex items-center gap-2 mt-0.5">
                              <span>{city.dataCount} data point{city.dataCount !== 1 ? 's' : ''}</span>
                              {city.lastUpdated && (
                                <span className="text-gray-500">
                                  • Updated {new Date(city.lastUpdated).toLocaleDateString()}
                                </span>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() => handleDeleteCity(city.id, city.name, city.state)}
                            disabled={deleting === city.id}
                            className="ml-2 p-1.5 text-red-400 hover:bg-red-500/20 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title={`Delete ${city.name}, ${city.state}`}
                            aria-label={`Delete ${city.name}, ${city.state}`}
                          >
                            {deleting === city.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

