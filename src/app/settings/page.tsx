'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Settings, Trash2, Database, Loader2, Search, Filter, ArrowLeft, X, Info } from 'lucide-react';
import { 
  getOrificeWeirTransitionRatio, 
  setOrificeWeirTransitionRatio, 
  DEFAULT_ORIFICE_WEIR_TRANSITION_RATIO,
  getOrificeStackingOffset,
  setOrificeStackingOffset,
  DEFAULT_ORIFICE_STACKING_OFFSET
} from '@/utils/hydraulicsConfig';
import { clearAtlas14Cache, City } from '@/utils/atlas14';

interface CityWithData extends City {
  dataCount: number;
}

export default function SettingsPage() {
  const router = useRouter();
  const [cities, setCities] = useState<Record<string, CityWithData[]>>({});
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedState, setSelectedState] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'name' | 'state' | 'dataCount' | 'lastUpdated'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<{ id: number; name: string; state: string } | null>(null);
  const [transitionRatio, setTransitionRatio] = useState<number>(DEFAULT_ORIFICE_WEIR_TRANSITION_RATIO);
  const [stackingOffset, setStackingOffset] = useState<number>(DEFAULT_ORIFICE_STACKING_OFFSET);

  useEffect(() => {
    loadCities();
    // Load settings from localStorage
    setTransitionRatio(getOrificeWeirTransitionRatio());
    setStackingOffset(getOrificeStackingOffset());
  }, []);

  const loadCities = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/atlas14/cities');
      const data = await response.json();
      
      // Transform the data to include dataCount
      const transformedData: Record<string, CityWithData[]> = {};
      for (const [state, stateCities] of Object.entries(data)) {
        transformedData[state] = (stateCities as any[]).map(city => ({
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
    setDeleting(cityId);
    try {
      const response = await fetch(`/api/atlas14/cities/${cityId}`, {
        method: 'DELETE',
      });

      const result = await response.json();

      if (response.ok) {
        clearAtlas14Cache();
        await loadCities();
        setShowDeleteConfirm(null);
        // Only reload if we're on the main page, otherwise stay on settings
        if (window.location.pathname === '/') {
          window.location.reload();
        }
      } else {
        alert('Failed to delete city: ' + (result.error || 'Unknown error'));
        setDeleting(null);
      }
    } catch (error) {
      alert('Failed to delete city');
      setDeleting(null);
    }
  };

  // Get all states
  const allStates = useMemo(() => {
    return Object.keys(cities).sort();
  }, [cities]);

  // Flatten and filter cities
  const filteredCities = useMemo(() => {
    let allCities: CityWithData[] = [];
    
    // Flatten cities from all states
    for (const stateCities of Object.values(cities)) {
      allCities.push(...stateCities);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      allCities = allCities.filter(city => 
        city.name.toLowerCase().includes(query) || 
        city.state.toLowerCase().includes(query)
      );
    }

    // Filter by state
    if (selectedState !== 'all') {
      allCities = allCities.filter(city => city.state === selectedState);
    }

    // Sort cities
    allCities.sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'state':
          comparison = a.state.localeCompare(b.state);
          break;
        case 'dataCount':
          comparison = a.dataCount - b.dataCount;
          break;
        case 'lastUpdated':
          const aDate = a.lastUpdated ? new Date(a.lastUpdated).getTime() : 0;
          const bDate = b.lastUpdated ? new Date(b.lastUpdated).getTime() : 0;
          comparison = aDate - bDate;
          break;
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return allCities;
  }, [cities, searchQuery, selectedState, sortBy, sortOrder]);

  const totalCities = Object.values(cities).flat().length;
  const citiesWithData = Object.values(cities).flat().filter(c => c.dataCount > 0).length;

  const handleSort = (field: typeof sortBy) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="container mx-auto px-6 py-8 max-w-7xl">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-gray-400 hover:text-white mb-4 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </button>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-full text-primary">
              <Settings className="w-6 h-6" />
            </div>
            <h1 className="text-3xl font-bold">Settings</h1>
          </div>
        </div>

        {/* Engineering Settings Section */}
        <div className="bg-card border border-border rounded-lg shadow-lg overflow-hidden mb-6">
          <div className="p-6 border-b border-border">
            <div className="flex items-center gap-2 mb-2">
              <Settings className="w-5 h-5 text-primary" />
              <h2 className="text-xl font-semibold">Engineering Settings</h2>
            </div>
            <p className="text-sm text-gray-400">
              Configure hydraulic calculation parameters
            </p>
          </div>

          <div className="p-6">
            <div className="space-y-6">
              {/* Orifice to Weir Transition Ratio */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Orifice to Weir Transition Ratio
                </label>
                <div className="flex items-center gap-4">
                  <input
                    type="number"
                    step="0.1"
                    min="0.5"
                    max="2.0"
                    value={transitionRatio}
                    onChange={(e) => {
                      const value = parseFloat(e.target.value);
                      if (!isNaN(value) && value > 0) {
                        setTransitionRatio(value);
                        setOrificeWeirTransitionRatio(value);
                      }
                    }}
                    className="w-24 bg-background border border-border rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <div className="flex-1">
                    <div className="flex items-start gap-2 text-xs text-gray-400">
                      <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="mb-1">
                          Determines when flow transitions from orifice to weir flow. Orifice flow occurs when head &gt; (ratio × opening height).
                        </p>
                        <p>
                          <span className="font-medium text-gray-300">Default:</span> 1.0 (transitions when head reaches top of opening)
                          <br />
                          <span className="font-medium text-gray-300">Standard Practice:</span> 1.4-1.5 (typical engineering practice)
                          <br />
                          <span className="font-medium text-gray-300">Current:</span> {transitionRatio.toFixed(2)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Orifice Stacking Offset */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Orifice Stacking Offset (ft)
                </label>
                <div className="flex items-center gap-4">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="2.0"
                    value={stackingOffset}
                    onChange={(e) => {
                      const value = parseFloat(e.target.value);
                      if (!isNaN(value) && value >= 0) {
                        setStackingOffset(value);
                        setOrificeStackingOffset(value);
                      }
                    }}
                    className="w-24 bg-background border border-border rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <div className="flex-1">
                    <div className="flex items-start gap-2 text-xs text-gray-400">
                      <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="mb-1">
                          Default vertical gap between the top of the previous orifice and the invert of the next when using the &quot;Stack Above&quot; button.
                        </p>
                        <p>
                          <span className="font-medium text-gray-300">Default:</span> 0.10 ft
                          <br />
                          <span className="font-medium text-gray-300">Current:</span> {stackingOffset.toFixed(2)} ft
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Data Section */}
        <div className="bg-card border border-border rounded-lg shadow-lg overflow-hidden">
          <div className="p-6 border-b border-border">
            <div className="flex items-center gap-2 mb-2">
              <Database className="w-5 h-5 text-primary" />
              <h2 className="text-xl font-semibold">Data</h2>
            </div>
            <p className="text-sm text-gray-400">
              Manage saved locations and rainfall data
            </p>
          </div>

          {/* Filters and Search */}
          <div className="p-6 border-b border-border bg-background/50">
            <div className="flex flex-col md:flex-row gap-4">
              {/* Search */}
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by city or state..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-background border border-border rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              {/* State Filter */}
              <div className="relative">
                <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <select
                  value={selectedState}
                  onChange={(e) => setSelectedState(e.target.value)}
                  className="pl-10 pr-8 py-2 bg-background border border-border rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary appearance-none cursor-pointer"
                >
                  <option value="all">All States</option>
                  {allStates.map(state => (
                    <option key={state} value={state}>{state}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Stats */}
            <div className="mt-4 flex flex-wrap gap-4 text-sm text-gray-400">
              <span>
                <span className="font-semibold text-white">{totalCities}</span> total location{totalCities !== 1 ? 's' : ''}
              </span>
              <span>
                <span className="font-semibold text-white">{citiesWithData}</span> with data
              </span>
              <span>
                <span className="font-semibold text-white">{filteredCities.length}</span> shown
              </span>
            </div>
          </div>

          {/* Cities Table */}
          <div className="overflow-x-auto">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : filteredCities.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                {searchQuery || selectedState !== 'all' ? (
                  <div>
                    <p className="text-lg mb-2">No cities found</p>
                    <p className="text-sm">Try adjusting your search or filters</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-lg mb-2">No saved locations found</p>
                    <p className="text-sm">Import data from the Hydrology tab to get started</p>
                  </div>
                )}
              </div>
            ) : (
              <table className="w-full">
                <thead className="bg-slate-900/50 border-b border-border">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors"
                        onClick={() => handleSort('name')}>
                      <div className="flex items-center gap-2">
                        City
                        {sortBy === 'name' && (
                          <span className="text-primary">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </div>
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors"
                        onClick={() => handleSort('state')}>
                      <div className="flex items-center gap-2">
                        State
                        {sortBy === 'state' && (
                          <span className="text-primary">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </div>
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors"
                        onClick={() => handleSort('dataCount')}>
                      <div className="flex items-center gap-2">
                        Data Points
                        {sortBy === 'dataCount' && (
                          <span className="text-primary">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </div>
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors"
                        onClick={() => handleSort('lastUpdated')}>
                      <div className="flex items-center gap-2">
                        Last Updated
                        {sortBy === 'lastUpdated' && (
                          <span className="text-primary">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </div>
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredCities.map((city) => (
                    <tr key={city.id} className="hover:bg-background/50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-white">{city.name}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-400">{city.state}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-400">
                          {city.dataCount > 0 ? (
                            <span className="text-green-400">{city.dataCount}</span>
                          ) : (
                            <span className="text-gray-500">No data</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-400">
                          {city.lastUpdated ? (
                            new Date(city.lastUpdated).toLocaleDateString('en-US', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric'
                            })
                          ) : (
                            <span className="text-gray-500">Never</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <button
                          onClick={() => setShowDeleteConfirm({ id: city.id, name: city.name, state: city.state })}
                          disabled={deleting === city.id}
                          className="p-2 text-red-400 hover:bg-red-500/20 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title={`Delete ${city.name}, ${city.state}`}
                        >
                          {deleting === city.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Confirm Delete</h3>
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="p-1 hover:bg-background rounded transition-colors"
                disabled={deleting !== null}
              >
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>
            <p className="text-gray-300 mb-6">
              Are you sure you want to delete <span className="font-semibold text-white">{showDeleteConfirm.name}, {showDeleteConfirm.state}</span>?
              <br />
              <span className="text-sm text-gray-400 mt-2 block">This will also delete all associated rainfall data. This action cannot be undone.</span>
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(null)}
                disabled={deleting !== null}
                className="px-4 py-2 border border-border rounded-lg hover:bg-background transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteCity(showDeleteConfirm.id, showDeleteConfirm.name, showDeleteConfirm.state)}
                disabled={deleting !== null}
                className="px-4 py-2 bg-red-500/20 text-red-400 border border-red-500/50 rounded-lg hover:bg-red-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleting === showDeleteConfirm.id ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Deleting...
                  </span>
                ) : (
                  'Delete'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

