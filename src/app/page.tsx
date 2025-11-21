'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Header, { Tab } from './components/Header';
import PondDesigner from './components/PondDesigner';
import Hydrology from './components/Hydrology';
import Drainage from './components/Drainage';
import OutfallDesigner from './components/OutfallDesigner';
import { ReturnPeriod, getCitiesByState, City } from '@/utils/atlas14';
import { SiteParams, ModifiedRationalMethod, ModifiedRationalResult } from '@/utils/rationalMethod';

export default function Home() {
  // Global State
  const [activeTab, setActiveTab] = useState<Tab>('hydrology');
  const [cityId, setCityId] = useState<number>(0);
  const [selectedEvents, setSelectedEvents] = useState<ReturnPeriod[]>(['5yr', '25yr', '100yr']);
  const [citiesByState, setCitiesByState] = useState<Record<string, City[]>>({});
  const [drainageTotals, setDrainageTotals] = useState<{
    existing: {
      totalArea: number;
      weightedC: number;
      tcMinutes: number;
      flowTotals: Record<ReturnPeriod, number>;
    };
    proposed: {
      totalArea: number;
      weightedC: number;
      tcMinutes: number;
      flowTotals: Record<ReturnPeriod, number>;
    };
  } | null>(null);

  // Load cities and set default city (only once on mount)
  useEffect(() => {
    async function loadDefaultCity() {
      const citiesByState = await getCitiesByState();
      setCitiesByState(citiesByState);

      if (Object.keys(citiesByState).length > 0 && cityId === 0) {
        const firstState = Object.keys(citiesByState)[0];
        const firstCity = citiesByState[firstState][0];
        if (firstCity) {
          setCityId(firstCity.id);
        }
      }
    }
    loadDefaultCity();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  // Shared State for Outfall & Pond Designer (based on Drainage totals when available)
  // Fall back to reasonable defaults if drainage has not been configured yet
  const preDev = useMemo<SiteParams>(() => {
    if (drainageTotals && drainageTotals.existing.totalArea > 0) {
      return {
        areaAcres: drainageTotals.existing.totalArea,
        cFactor: drainageTotals.existing.weightedC,
        tcMinutes: drainageTotals.existing.tcMinutes || 15,
      };
    }
    return { areaAcres: 10, cFactor: 0.4, tcMinutes: 15 };
  }, [drainageTotals]);

  const postDev = useMemo<SiteParams>(() => {
    if (drainageTotals && drainageTotals.proposed.totalArea > 0) {
      return {
        areaAcres: drainageTotals.proposed.totalArea,
        cFactor: drainageTotals.proposed.weightedC,
        tcMinutes: drainageTotals.proposed.tcMinutes || 10,
      };
    }
    return { areaAcres: 10, cFactor: 0.85, tcMinutes: 10 };
  }, [drainageTotals]);
  const pondDims = { length: 100, width: 100, depth: 10 };
  
  const [pondResults, setPondResults] = useState<ModifiedRationalResult[]>([]);

  useEffect(() => {
    if (cityId === 0) {
      setPondResults([]);
      return;
    }

    async function calculateResults() {
      try {
        const calculatedResults = await Promise.all(
          selectedEvents.map(p => 
            ModifiedRationalMethod.calculateStorage(preDev, postDev, p, cityId)
          )
        );
        setPondResults(calculatedResults);
      } catch (error) {
        console.error('Error calculating pond results:', error);
        setPondResults([]);
      }
    }

    calculateResults();
  }, [cityId, selectedEvents, preDev, postDev]);

  const pondAreaSqFt = pondDims.length * pondDims.width;

  const selectedCity = useMemo(() => {
    return Object.values(citiesByState)
      .flat()
      .find((city) => city.id === cityId) ?? null;
  }, [citiesByState, cityId]);

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Header activeTab={activeTab} onTabChange={setActiveTab} />

      <div className="w-full border-b border-border bg-slate-900/80 sticky top-16 z-40">
        <div className="container mx-auto px-6 py-2 flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm text-gray-200">
          <div>
            Location:{' '}
            <span className="font-semibold">
              {selectedCity ? `${selectedCity.name}, ${selectedCity.state}` : 'Select a city in the Hydrology tab'}
            </span>
          </div>
          <div className="text-gray-400">
            Source:{' '}
            <span className="font-semibold">
              NOAA Atlas 14
            </span>
          </div>
        </div>
      </div>
      
      <main className="flex-1 overflow-hidden flex flex-col">
        {activeTab === 'hydrology' && (
          <div className="flex-1 overflow-y-auto">
            <Hydrology 
              cityId={cityId} 
              setCityId={setCityId}
              selectedEvents={selectedEvents}
              setSelectedEvents={setSelectedEvents}
            />
          </div>
        )}

        {activeTab === 'drainage' && (
          <Drainage 
            cityId={cityId} 
            selectedEvents={selectedEvents} 
            onTotalsChange={setDrainageTotals}
          />
        )}

        {activeTab === 'pond' && (
           <div className="flex-1 flex flex-col overflow-hidden min-h-0">
             <PondDesigner 
               cityId={cityId} 
               selectedEvents={selectedEvents} 
               results={pondResults}
               drainageTotals={drainageTotals}
             />
           </div>
        )}

        {activeTab === 'outfall' && (
           <OutfallDesigner 
             results={pondResults} 
             pondAreaSqFt={pondAreaSqFt}
             pondInvertElevation={100}
           />
        )}
      </main>
    </div>
  );
}
