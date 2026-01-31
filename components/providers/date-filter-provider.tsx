'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { format, subDays } from 'date-fns';
import type { DateFilterMode } from '@/components/filters/filter-sidebar';
import { DEFAULT_DAYS_BACK } from '@/lib/constants';

interface DateFilterContextType {
  dateFilterMode: DateFilterMode;
  setDateFilterMode: (mode: DateFilterMode) => void;
  startDate: string;
  setStartDate: (date: string) => void;
  endDate: string;
  setEndDate: (date: string) => void;
}

const DateFilterContext = createContext<DateFilterContextType | null>(null);

const STORAGE_KEY = 'hc-dashboard-date-filter';

interface StoredDateFilter {
  dateFilterMode: DateFilterMode;
  startDate: string;
  endDate: string;
}

function getDefaultDates() {
  return {
    startDate: format(subDays(new Date(), DEFAULT_DAYS_BACK), 'yyyy-MM-dd'),
    endDate: format(new Date(), 'yyyy-MM-dd'),
  };
}

export function DateFilterProvider({ children }: { children: React.ReactNode }) {
  const defaults = getDefaultDates();
  const [dateFilterMode, setDateFilterModeState] = useState<DateFilterMode>('custom');
  const [startDate, setStartDateState] = useState(defaults.startDate);
  const [endDate, setEndDateState] = useState(defaults.endDate);
  const [isHydrated, setIsHydrated] = useState(false);

  // Hydrate from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed: StoredDateFilter = JSON.parse(stored);
        if (parsed.dateFilterMode) {
          setDateFilterModeState(parsed.dateFilterMode);
        }
        if (parsed.startDate) {
          setStartDateState(parsed.startDate);
        }
        if (parsed.endDate) {
          setEndDateState(parsed.endDate);
        }
      }
    } catch {
      // Invalid stored data, use defaults
    }
    setIsHydrated(true);
  }, []);

  // Persist to localStorage whenever values change
  const persistToStorage = useCallback((mode: DateFilterMode, start: string, end: string) => {
    const data: StoredDateFilter = {
      dateFilterMode: mode,
      startDate: start,
      endDate: end,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, []);

  const setDateFilterMode = useCallback((mode: DateFilterMode) => {
    setDateFilterModeState(mode);
    persistToStorage(mode, startDate, endDate);
  }, [persistToStorage, startDate, endDate]);

  const setStartDate = useCallback((date: string) => {
    setStartDateState(date);
    persistToStorage(dateFilterMode, date, endDate);
  }, [persistToStorage, dateFilterMode, endDate]);

  const setEndDate = useCallback((date: string) => {
    setEndDateState(date);
    persistToStorage(dateFilterMode, startDate, date);
  }, [persistToStorage, dateFilterMode, startDate]);

  // Prevent flash of wrong state
  if (!isHydrated) {
    return null;
  }

  return (
    <DateFilterContext.Provider
      value={{
        dateFilterMode,
        setDateFilterMode,
        startDate,
        setStartDate,
        endDate,
        setEndDate,
      }}
    >
      {children}
    </DateFilterContext.Provider>
  );
}

export function useDateFilter() {
  const context = useContext(DateFilterContext);
  if (!context) {
    throw new Error('useDateFilter must be used within DateFilterProvider');
  }
  return context;
}
