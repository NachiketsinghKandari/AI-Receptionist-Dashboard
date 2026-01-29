'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

const STORAGE_KEY = 'hc-call-detail-panel-sizes';

// Layout is an object with panel ids as keys and percentages as values
type Layout = { [id: string]: number };

const DEFAULT_LAYOUT: Layout = {
  left: 55,
  right: 45,
};

function getStoredLayout(): Layout {
  if (typeof window === 'undefined') {
    return DEFAULT_LAYOUT;
  }
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        typeof parsed.left === 'number' &&
        typeof parsed.right === 'number'
      ) {
        return parsed;
      }
    }
  } catch {
    // Ignore parse errors
  }
  return DEFAULT_LAYOUT;
}

export function usePanelSize() {
  // Use ref for initial layout to avoid re-renders
  const initialLayoutRef = useRef<Layout | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);

  // Initialize on first render
  if (initialLayoutRef.current === null) {
    initialLayoutRef.current = getStoredLayout();
  }

  // Mark as hydrated after first render (client-side only)
  useEffect(() => {
    // Re-read from localStorage to ensure we have the latest
    initialLayoutRef.current = getStoredLayout();
    setIsHydrated(true);
  }, []);

  // Save to localStorage only - don't update state to avoid re-renders
  const saveLayout = useCallback((newLayout: Layout) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newLayout));
    } catch {
      // Ignore storage errors
    }
  }, []);

  return {
    initialLayout: initialLayoutRef.current || DEFAULT_LAYOUT,
    saveLayout,
    isHydrated,
  };
}
