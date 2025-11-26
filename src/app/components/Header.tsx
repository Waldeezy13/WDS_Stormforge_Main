import React from 'react';
import Link from 'next/link';
import { Droplets, Waves, Construction, CloudRain, Calculator, Settings } from 'lucide-react';

export type Tab = 'hydrology' | 'pond' | 'drainage' | 'outfall';

interface HeaderProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

export default function Header({ activeTab, onTabChange }: HeaderProps) {
  return (
    <header className="w-full border-b border-border bg-card/50 backdrop-blur-md sticky top-0 z-50 h-16 flex-none">
      <div className="container mx-auto px-6 h-full flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Waves className="w-8 h-8 text-accent" />
          <h1 className="text-xl font-bold tracking-tight text-white">
            Waldo Pond <span className="text-accent">Designer</span>
          </h1>
        </div>
        <div className="flex items-center gap-6">
          <nav className="flex gap-6">
            <button 
              onClick={() => onTabChange('hydrology')}
              className={`text-sm font-medium transition-colors flex items-center gap-2 ${
                activeTab === 'hydrology' 
                  ? 'text-accent' 
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <CloudRain className="w-4 h-4" />
              Hydrology
            </button>
            <button 
              onClick={() => onTabChange('drainage')}
              className={`text-sm font-medium transition-colors flex items-center gap-2 ${
                activeTab === 'drainage' 
                  ? 'text-accent' 
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <Calculator className="w-4 h-4" />
              Drainage Area
            </button>
            <button 
              onClick={() => onTabChange('pond')}
              className={`text-sm font-medium transition-colors flex items-center gap-2 ${
                activeTab === 'pond' 
                  ? 'text-accent' 
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <Waves className="w-4 h-4" />
              Pond Design
            </button>
            <button 
              onClick={() => onTabChange('outfall')}
              className={`text-sm font-medium transition-colors flex items-center gap-2 ${
                activeTab === 'outfall' 
                  ? 'text-accent' 
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <Construction className="w-4 h-4" />
              Outfall Design
            </button>
          </nav>
          <Link
            href="/settings"
            className="p-2 hover:bg-background rounded-lg transition-colors"
            aria-label="Settings"
          >
            <Settings className="w-5 h-5 text-gray-400 hover:text-white" />
          </Link>
        </div>
      </div>
    </header>
  );
}
