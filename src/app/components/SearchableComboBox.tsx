'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronDown, Search, RefreshCw, Loader2 } from 'lucide-react';

export interface ComboBoxOption {
  id: number;
  label: string;
  group?: string;
  sublabel?: string;
  source?: string;
  sourceType?: string;
  latitude?: number;
  longitude?: number;
  lastUpdated?: string;
}

interface SearchableComboBoxProps {
  options: ComboBoxOption[];
  value: number | null;
  onChange: (id: number) => void;
  placeholder?: string;
  groupBy?: boolean;
  onRefresh?: (option: ComboBoxOption) => void;
  refreshingId?: number | null;
}

export default function SearchableComboBox({
  options,
  value,
  onChange,
  placeholder = 'Select an option...',
  groupBy = true,
  onRefresh,
  refreshingId,
}: SearchableComboBoxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<(HTMLDivElement | null)[]>([]);

  const selectedOption = options.find(o => o.id === value);

  // Filter options based on search term
  const filteredOptions = options.filter(option => {
    const search = searchTerm.toLowerCase();
    return (
      option.label.toLowerCase().includes(search) ||
      (option.group && option.group.toLowerCase().includes(search)) ||
      (option.sublabel && option.sublabel.toLowerCase().includes(search))
    );
  });

  // Group filtered options by state
  const groupedOptions = groupBy
    ? filteredOptions.reduce<Record<string, ComboBoxOption[]>>((acc, option) => {
        const group = option.group || 'Other';
        if (!acc[group]) acc[group] = [];
        acc[group].push(option);
        return acc;
      }, {})
    : { '': filteredOptions };

  // Flatten grouped options for keyboard navigation
  const flatOptions: ComboBoxOption[] = [];
  Object.values(groupedOptions).forEach(group => {
    flatOptions.push(...group);
  });

  // Handle clicking outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchTerm('');
        setHighlightedIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus input when dropdown opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Scroll highlighted option into view
  useEffect(() => {
    if (highlightedIndex >= 0 && optionRefs.current[highlightedIndex]) {
      optionRefs.current[highlightedIndex]?.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      });
    }
  }, [highlightedIndex]);

  // Reset highlight when search changes
  useEffect(() => {
    setHighlightedIndex(flatOptions.length > 0 ? 0 : -1);
  }, [searchTerm, flatOptions.length]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev => 
          prev < flatOptions.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev => 
          prev > 0 ? prev - 1 : flatOptions.length - 1
        );
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && flatOptions[highlightedIndex]) {
          onChange(flatOptions[highlightedIndex].id);
          setIsOpen(false);
          setSearchTerm('');
          setHighlightedIndex(-1);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        setSearchTerm('');
        setHighlightedIndex(-1);
        break;
      case 'Tab':
        setIsOpen(false);
        setSearchTerm('');
        setHighlightedIndex(-1);
        break;
    }
  }, [flatOptions, highlightedIndex, onChange]);

  const handleSelect = (option: ComboBoxOption) => {
    onChange(option.id);
    setIsOpen(false);
    setSearchTerm('');
    setHighlightedIndex(-1);
  };

  let optionIndex = 0;

  return (
    <div ref={containerRef} className="relative city-dropdown">
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Select city dropdown"
        className="w-full bg-background border border-border rounded px-4 py-3 text-base focus:ring-2 focus:ring-primary outline-none transition-all cursor-pointer hover:border-primary/50 text-left flex items-center justify-between"
      >
        <span className={selectedOption ? 'text-foreground' : 'text-gray-500'}>
          {selectedOption 
            ? `${selectedOption.label}${selectedOption.group ? `, ${selectedOption.group}` : ''}`
            : placeholder}
        </span>
        <ChevronDown className={`w-5 h-5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-30 w-full mt-1 bg-background border border-border rounded shadow-lg overflow-hidden">
          {/* Search input */}
          <div className="p-2 border-b border-border">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                ref={inputRef}
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search cities..."
                aria-label="Search cities"
                className="w-full bg-slate-900/50 border border-border rounded pl-9 pr-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none placeholder:text-gray-500"
              />
            </div>
          </div>

          {/* Options list */}
          <div ref={listRef} className="max-h-72 overflow-y-auto">
            {flatOptions.length === 0 ? (
              <div className="px-4 py-6 text-center text-gray-500 text-sm">
                No cities found matching &ldquo;{searchTerm}&rdquo;
              </div>
            ) : (
              Object.entries(groupedOptions).map(([group, groupOptions]) => (
                <div key={group || 'ungrouped'}>
                  {groupBy && group && (
                    <div className="px-4 py-2 text-xs font-semibold text-gray-500 bg-slate-900/50 sticky top-0">
                      {group}
                    </div>
                  )}
                  {groupOptions.map((option) => {
                    const currentIndex = optionIndex++;
                    const isHighlighted = currentIndex === highlightedIndex;
                    const isSelected = option.id === value;

                    return (
                      <div
                        key={option.id}
                        ref={(el) => { optionRefs.current[currentIndex] = el; }}
                        className={`flex items-center justify-between gap-2 transition-colors ${
                          isHighlighted ? 'bg-primary/20' : isSelected ? 'bg-primary/5' : 'hover:bg-primary/10'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => handleSelect(option)}
                          className="flex-1 px-4 py-3 text-left"
                        >
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-2">
                              <span className="text-base">{option.label}{option.group ? `, ${option.group}` : ''}</span>
                              {option.source && (
                                <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                                  option.sourceType === 'ATLAS14' 
                                    ? 'bg-emerald-500/20 text-emerald-400'
                                    : 'bg-primary/10 text-primary'
                                }`}>
                                  {option.source}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-[11px] text-gray-500">
                              {option.sourceType === 'ATLAS14' && option.latitude && option.longitude && (
                                <span className="font-mono">
                                  {option.latitude.toFixed(4)}°, {option.longitude.toFixed(4)}°
                                </span>
                              )}
                              {option.lastUpdated && (
                                <span className="opacity-75">
                                  Updated: {new Date(option.lastUpdated).toLocaleDateString()}
                                </span>
                              )}
                            </div>
                          </div>
                        </button>
                        {onRefresh && option.sourceType === 'ATLAS14' && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onRefresh(option);
                            }}
                            disabled={refreshingId === option.id}
                            className="mr-3 p-1.5 rounded hover:bg-slate-700 transition-colors disabled:opacity-50"
                            title="Refresh data from NOAA"
                            aria-label="Refresh data from NOAA"
                          >
                            {refreshingId === option.id ? (
                              <Loader2 className="w-4 h-4 animate-spin text-primary" />
                            ) : (
                              <RefreshCw className="w-4 h-4 text-gray-400 hover:text-primary" />
                            )}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
