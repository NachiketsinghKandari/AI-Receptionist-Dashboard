'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, Phone, Info, FileText, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCallDetail } from '@/hooks/use-calls';
import { usePanelSize } from '@/hooks/use-panel-size';
import { useIsMobile } from '@/hooks/use-is-mobile';
import { cn } from '@/lib/utils';
import {
  CallDetailLeftPanel,
  CallDetailRightPanel,
  type HighlightReasons,
} from '@/components/details/call-detail-panel';

interface CallDetailSheetProps {
  callId: number | null;
  highlightReasons: HighlightReasons;
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
  hasPrevious: boolean;
  hasNext: boolean;
  dateRange: {
    startDate: string | null;
    endDate: string | null;
  };
}

const MIN_LEFT_PERCENT = 35;
const MAX_LEFT_PERCENT = 70;

export function CallDetailSheet({
  callId,
  highlightReasons,
  onClose,
  onPrevious,
  onNext,
  hasPrevious,
  hasNext,
  dateRange,
}: CallDetailSheetProps) {
  const { data } = useCallDetail(callId);
  const call = data?.call;
  const { initialLayout, saveLayout, isHydrated } = usePanelSize();
  const panelRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState<'details' | 'transcript'>('details');

  // Resizable panel state
  const [leftPercent, setLeftPercent] = useState(initialLayout.left ?? 55);
  const isDragging = useRef(false);

  // Sync initial layout when hydrated
  useEffect(() => {
    if (isHydrated && initialLayout.left) {
      setLeftPercent(initialLayout.left);
    }
  }, [isHydrated, initialLayout.left]);

  // Handle drag for resizable panels
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = moveEvent.clientX - rect.left;
      const percent = (x / rect.width) * 100;
      const clamped = Math.min(MAX_LEFT_PERCENT, Math.max(MIN_LEFT_PERCENT, percent));
      setLeftPercent(clamped);
    };

    const onMouseUp = () => {
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);

      // Save the final layout
      setLeftPercent((current) => {
        saveLayout({ left: current, right: 100 - current });
        return current;
      });
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [saveLayout]);

  // Handle click outside to close
  useEffect(() => {
    if (callId === null) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('[data-call-detail-backdrop]') && !target.closest('[data-call-detail-panel]')) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [callId, onClose]);

  // Keyboard navigation
  useEffect(() => {
    if (callId === null) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.key === 'ArrowLeft' && hasPrevious) {
        e.preventDefault();
        onPrevious();
      }
      if (e.key === 'ArrowRight' && hasNext) {
        e.preventDefault();
        onNext();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [callId, hasPrevious, hasNext, onPrevious, onNext, onClose]);

  // Prevent body scroll when open
  useEffect(() => {
    if (callId !== null) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [callId]);

  if (callId === null) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        data-call-detail-backdrop
        className={cn(
          "fixed inset-0 z-50 bg-black/50 backdrop-blur-sm",
          "animate-in fade-in-0 duration-200"
        )}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        data-call-detail-panel
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex flex-col",
          "w-full md:w-[calc(100vw-280px)] md:max-w-[1600px]",
          "bg-background border-l shadow-xl",
          "animate-in slide-in-from-right duration-300"
        )}
      >
        {/* Header */}
        <div className="px-4 py-3 md:px-6 md:py-4 border-b shrink-0 bg-background">
          <div className="flex items-start justify-between gap-2 md:gap-4">
            <div className="flex-1 min-w-0">
              <h2 className="text-base md:text-lg font-semibold flex items-center gap-2">
                <Phone className="h-4 w-4 md:h-5 md:w-5" />
                Call #{callId}
              </h2>
              {call && (
                <p className="text-sm text-muted-foreground mt-1">
                  {call.caller_name} - {call.phone_number}
                </p>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={onPrevious}
                disabled={!hasPrevious}
                title="Previous (←)"
              >
                <ChevronLeft className="h-4 w-4" />
                <span className="sr-only">Previous</span>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={onNext}
                disabled={!hasNext}
                title="Next (→)"
              >
                <ChevronRight className="h-4 w-4" />
                <span className="sr-only">Next</span>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={onClose}
              >
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </Button>
            </div>
          </div>
        </div>

        {/* Mobile: Tabbed layout */}
        {isMobile && (
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
            <TabsContent value="details" className="flex-1 min-h-0 mt-0">
              <ScrollArea className="h-full">
                <CallDetailLeftPanel
                  callId={callId}
                  highlightReasons={highlightReasons}
                  dateRange={dateRange}
                />
              </ScrollArea>
            </TabsContent>
            <TabsContent value="transcript" className="flex-1 min-h-0 mt-0">
              <ScrollArea className="h-full">
                <CallDetailRightPanel
                  callId={callId}
                  highlightReasons={highlightReasons}
                  dateRange={dateRange}
                />
              </ScrollArea>
            </TabsContent>
          </Tabs>
        )}

        {/* Desktop: Two-panel resizable content */}
        {!isMobile && isHydrated && (
          <div ref={containerRef} className="flex-1 min-h-0 flex">
            {/* Left Panel */}
            <div
              className="h-full overflow-hidden"
              style={{ width: `${leftPercent}%` }}
            >
              <ScrollArea className="h-full">
                <CallDetailLeftPanel
                  callId={callId}
                  highlightReasons={highlightReasons}
                  dateRange={dateRange}
                />
              </ScrollArea>
            </div>

            {/* Resize Handle */}
            <div
              className="relative flex items-center justify-center w-1.5 shrink-0 cursor-col-resize group hover:bg-primary/10 transition-colors"
              onMouseDown={handleMouseDown}
            >
              <div className="absolute z-10 flex h-8 w-3 items-center justify-center rounded-sm border bg-muted shadow-sm group-hover:bg-muted-foreground/20 transition-colors">
                <GripVertical className="size-3 text-muted-foreground" />
              </div>
            </div>

            {/* Right Panel */}
            <div className="h-full overflow-hidden flex-1">
              <ScrollArea className="h-full">
                <CallDetailRightPanel
                  callId={callId}
                  highlightReasons={highlightReasons}
                  dateRange={dateRange}
                />
              </ScrollArea>
            </div>
          </div>
        )}

        {/* Loading state while hydrating panel sizes (desktop only) */}
        {!isMobile && !isHydrated && (
          <div className="flex-1 flex items-center justify-center">
            <div className="animate-pulse text-muted-foreground">Loading...</div>
          </div>
        )}
      </div>
    </>
  );
}
