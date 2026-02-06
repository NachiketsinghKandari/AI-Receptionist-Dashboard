'use client';

import { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence, PanInfo } from 'framer-motion';
import { Info, FileText } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  CallDetailLeftPanel,
  CallDetailRightPanel,
  type HighlightReasons,
} from '@/components/details/call-detail-panel';

interface CallDetailCarouselProps {
  callId: number | string;
  currentIndex: number;
  highlightReasons: HighlightReasons;
  dateRange: {
    startDate: string | null;
    endDate: string | null;
  };
  onShare?: (correlationId: string) => void;
  onPrevious: () => void;
  onNext: () => void;
  hasPrevious: boolean;
  hasNext: boolean;
}

// Slide animation variants
const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? '100%' : '-100%',
    opacity: 0.5,
  }),
  center: {
    zIndex: 1,
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    zIndex: 0,
    x: direction > 0 ? '-100%' : '100%',
    opacity: 0.5,
  }),
};

// Spring transition for smooth, natural feel
const springTransition = {
  x: { type: 'spring' as const, stiffness: 300, damping: 30 },
  opacity: { duration: 0.2 },
};

// Thresholds for swipe detection
const SWIPE_THRESHOLD = 50; // pixels
const VELOCITY_THRESHOLD = 500; // pixels/second

export function CallDetailCarousel({
  callId,
  currentIndex,
  highlightReasons,
  dateRange,
  onShare,
  onPrevious,
  onNext,
  hasPrevious,
  hasNext,
}: CallDetailCarouselProps) {
  const [activeTab, setActiveTab] = useState<'details' | 'transcript'>('details');
  const [direction, setDirection] = useState(1);
  const prevIndexRef = useRef(currentIndex);

  // Detect direction from index change (for button navigation)
  // This runs during render to update direction before animation starts
  if (currentIndex !== prevIndexRef.current) {
    const newDirection = currentIndex > prevIndexRef.current ? 1 : -1;
    setDirection(newDirection);
    prevIndexRef.current = currentIndex;
  }

  const handleDragEnd = useCallback(
    (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      const { offset, velocity } = info;

      // Check if swipe meets threshold (distance OR velocity)
      const swipedLeft = offset.x < -SWIPE_THRESHOLD || velocity.x < -VELOCITY_THRESHOLD;
      const swipedRight = offset.x > SWIPE_THRESHOLD || velocity.x > VELOCITY_THRESHOLD;

      if (swipedLeft && hasNext) {
        setDirection(1);
        onNext();
      } else if (swipedRight && hasPrevious) {
        setDirection(-1);
        onPrevious();
      }
    },
    [hasNext, hasPrevious, onNext, onPrevious]
  );

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <AnimatePresence initial={false} custom={direction} mode="wait">
        <motion.div
          key={callId}
          custom={direction}
          variants={slideVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={springTransition}
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.2}
          onDragEnd={handleDragEnd}
          className="flex-1 flex flex-col min-h-0 touch-pan-y"
        >
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as 'details' | 'transcript')}
            className="flex-1 flex flex-col min-h-0"
          >
            <TabsList className="grid w-full grid-cols-2 mx-4 mt-2" style={{ width: 'calc(100% - 2rem)' }}>
              <TabsTrigger value="details" className="flex items-center gap-2">
                <Info className="h-4 w-4" />
                Details
              </TabsTrigger>
              <TabsTrigger value="transcript" className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Transcript
              </TabsTrigger>
            </TabsList>
            <TabsContent value="details" className="flex-1 min-h-0 mt-0 overflow-hidden">
              <CallDetailLeftPanel
                callId={callId}
                highlightReasons={highlightReasons}
                dateRange={dateRange}
                onShare={onShare}
              />
            </TabsContent>
            <TabsContent value="transcript" className="flex-1 min-h-0 mt-0 overflow-hidden">
              <CallDetailRightPanel
                callId={callId}
                highlightReasons={highlightReasons}
                dateRange={dateRange}
              />
            </TabsContent>
          </Tabs>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
