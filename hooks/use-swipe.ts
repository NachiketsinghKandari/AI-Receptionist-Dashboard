'use client';

import { useRef, useCallback } from 'react';

interface UseSwipeOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  threshold?: number;
  enabled?: boolean;
}

interface SwipeHandlers {
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
}

export function useSwipe({
  onSwipeLeft,
  onSwipeRight,
  threshold = 50,
  enabled = true,
}: UseSwipeOptions): SwipeHandlers {
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);
  const isHorizontalSwipe = useRef<boolean | null>(null);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (!enabled) return;
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    touchEndX.current = null;
    isHorizontalSwipe.current = null;
  }, [enabled]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!enabled || touchStartX.current === null || touchStartY.current === null) return;

    touchEndX.current = e.touches[0].clientX;

    // Determine if this is a horizontal or vertical swipe on first significant movement
    if (isHorizontalSwipe.current === null) {
      const deltaX = Math.abs(e.touches[0].clientX - touchStartX.current);
      const deltaY = Math.abs(e.touches[0].clientY - touchStartY.current);

      // Only decide once we have enough movement
      if (deltaX > 10 || deltaY > 10) {
        isHorizontalSwipe.current = deltaX > deltaY;
      }
    }
  }, [enabled]);

  const onTouchEnd = useCallback(() => {
    if (!enabled) return;

    // Only trigger if it was a horizontal swipe
    if (
      touchStartX.current !== null &&
      touchEndX.current !== null &&
      isHorizontalSwipe.current === true
    ) {
      const deltaX = touchEndX.current - touchStartX.current;

      if (Math.abs(deltaX) > threshold) {
        if (deltaX < 0 && onSwipeLeft) {
          // Swiped left -> go to next
          onSwipeLeft();
        } else if (deltaX > 0 && onSwipeRight) {
          // Swiped right -> go to previous
          onSwipeRight();
        }
      }
    }

    // Reset
    touchStartX.current = null;
    touchStartY.current = null;
    touchEndX.current = null;
    isHorizontalSwipe.current = null;
  }, [enabled, threshold, onSwipeLeft, onSwipeRight]);

  return { onTouchStart, onTouchMove, onTouchEnd };
}
