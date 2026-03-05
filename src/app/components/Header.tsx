import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Waves, Construction, CloudRain, Calculator, Settings, FileText, FolderOpen, Download, Save, Upload, FilePlus2, ChevronDown } from 'lucide-react';

export type Tab = 'hydrology' | 'pond' | 'drainage' | 'outfall' | 'reports';

interface HeaderProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  projectFileName?: string;
  onProjectImport?: () => void;
  onExportToC3D?: () => void;
  onSaveProject?: () => void;
  onOpenProject?: () => void;
  onNewProject?: () => void;
}

export default function Header({ activeTab, onTabChange, projectFileName = 'New Project', onProjectImport, onExportToC3D, onSaveProject, onOpenProject, onNewProject }: HeaderProps) {
  const [isProjectMenuOpen, setIsProjectMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDocumentClick(event: MouseEvent) {
      if (!menuRef.current) return;
      const target = event.target as Node;
      if (!menuRef.current.contains(target)) {
        setIsProjectMenuOpen(false);
      }
    }

    if (isProjectMenuOpen) {
      document.addEventListener('mousedown', onDocumentClick);
    }

    return () => {
      document.removeEventListener('mousedown', onDocumentClick);
    };
  }, [isProjectMenuOpen]);

  const closeMenuAndRun = (action?: () => void) => {
    setIsProjectMenuOpen(false);
    action?.();
  };

  return (
    <header className="w-full border-b border-border bg-card/50 backdrop-blur-md sticky top-0 z-50 h-16 flex-none">
      <div className="w-full px-6 h-full flex items-center justify-between">
        <div className="flex items-center gap-3" ref={menuRef}>
          <button
            onClick={() => setIsProjectMenuOpen((prev) => !prev)}
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-background transition-colors"
            title="Project actions"
            aria-label="Project actions"
            aria-expanded={isProjectMenuOpen}
            aria-haspopup="menu"
          >
            <img
              src="/StormForge_Logo.png"
              alt="StormForge logo"
              className="h-12 w-auto shrink-0"
              loading="eager"
            />
            <img
              src="/StormForge_name.png"
              alt="StormForge"
              className="h-6 w-auto shrink-0 grayscale brightness-125 drop-shadow-[0_0_10px_rgba(6,182,212,0.85)]"
              loading="eager"
            />
            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isProjectMenuOpen ? 'rotate-180' : ''}`} />
          </button>

          <div className="max-w-[320px] truncate text-lg font-semibold text-gray-200" title={projectFileName}>
            {projectFileName}
          </div>

          {isProjectMenuOpen && (
            <div
              role="menu"
              className="absolute top-14 left-6 z-50 w-56 bg-slate-900 border border-border rounded-lg shadow-xl p-1"
            >
              {onNewProject && (
                <button
                  onClick={() => closeMenuAndRun(onNewProject)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-gray-100 hover:bg-slate-800 rounded"
                  role="menuitem"
                >
                  <FilePlus2 className="w-4 h-4 text-primary" />
                  New Project
                </button>
              )}
              {onOpenProject && (
                <button
                  onClick={() => closeMenuAndRun(onOpenProject)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-gray-100 hover:bg-slate-800 rounded"
                  role="menuitem"
                >
                  <Upload className="w-4 h-4 text-primary" />
                  Open Project
                </button>
              )}
              {onSaveProject && (
                <button
                  onClick={() => closeMenuAndRun(onSaveProject)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-gray-100 hover:bg-slate-800 rounded"
                  role="menuitem"
                >
                  <Save className="w-4 h-4 text-primary" />
                  Save Project
                </button>
              )}
              {onProjectImport && (
                <button
                  onClick={() => closeMenuAndRun(onProjectImport)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-gray-100 hover:bg-slate-800 rounded"
                  role="menuitem"
                >
                  <FolderOpen className="w-4 h-4 text-primary" />
                  Import from C3D
                </button>
              )}
              {onExportToC3D && (
                <button
                  onClick={() => closeMenuAndRun(onExportToC3D)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-gray-100 hover:bg-slate-800 rounded"
                  role="menuitem"
                >
                  <Download className="w-4 h-4 text-primary" />
                  Export to C3D
                </button>
              )}
            </div>
          )}
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
          <img
            src="/Waldo_Logo.png"
            alt="Waldo logo"
            className="h-8 w-auto shrink-0"
            loading="eager"
          />
        </div>
      </div>
    </header>
  );
}
