import React from 'react';
import Link from 'next/link';
import { Waves, Construction, CloudRain, Calculator, Settings, FileText, FolderOpen, Download } from 'lucide-react';

export type Tab = 'hydrology' | 'pond' | 'drainage' | 'outfall' | 'reports';

interface HeaderProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  onProjectImport?: () => void;
  onExportToC3D?: () => void;
}

export default function Header({ activeTab, onTabChange, onProjectImport, onExportToC3D }: HeaderProps) {
  return (
    <header className="w-full border-b border-border bg-card/50 backdrop-blur-md sticky top-0 z-50 h-16 flex-none">
      <div className="w-full px-6 h-full flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Waves className="w-8 h-8 text-accent" />
          <h1 className="text-xl font-bold tracking-tight text-white">
            WDS <span className="text-accent">Stormforge</span>
          </h1>
          <div className="flex items-center gap-2 ml-4 border-l border-border pl-4">
            {onProjectImport && (
              <button
                onClick={onProjectImport}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary text-xs font-medium rounded-lg transition-colors"
                title="Import project from Civil 3D"
                aria-label="Import project from Civil 3D"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                New from C3D
              </button>
            )}
            {onExportToC3D && (
              <button
                onClick={onExportToC3D}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary text-xs font-medium rounded-lg transition-colors"
                title="Export drainage areas to Civil 3D"
                aria-label="Export drainage areas to Civil 3D"
              >
                <Download className="w-3.5 h-3.5" />
                Export to C3D
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-6">
          <nav className="flex gap-6">
            <button 
              onClick={() => onTabChange('hydrology')}
              aria-label="Navigate to Hydrology tab"
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
              aria-label="Navigate to Drainage Area tab"
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
              aria-label="Navigate to Pond Design tab"
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
              aria-label="Navigate to Outfall Design tab"
              className={`text-sm font-medium transition-colors flex items-center gap-2 ${
                activeTab === 'outfall' 
                  ? 'text-accent' 
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <Construction className="w-4 h-4" />
              Outfall Design
            </button>
            <button 
              onClick={() => onTabChange('reports')}
              aria-label="Navigate to Reports tab"
              className={`text-sm font-medium transition-colors flex items-center gap-2 ${
                activeTab === 'reports' 
                  ? 'text-accent' 
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <FileText className="w-4 h-4" />
              Reports
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
