'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Loader2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import type { CekuraCallData, CekuraMetric } from '@/hooks/use-cekura';

interface CekuraStatusProps {
  callData: CekuraCallData | undefined;
  isLoading: boolean;
  isFullyLoaded: boolean;
  hasError?: boolean;
}

function getStatusColor(status: string): string {
  const normalizedStatus = status?.toLowerCase();
  if (normalizedStatus === 'success' || normalizedStatus === 'completed') {
    return 'bg-green-500/20 text-green-700 dark:text-green-300 border-green-500/30';
  }
  if (normalizedStatus === 'failure' || normalizedStatus === 'failed' || normalizedStatus === 'error') {
    return 'bg-red-500/20 text-red-700 dark:text-red-300 border-red-500/30';
  }
  return 'bg-gray-500/20 text-gray-700 dark:text-gray-300 border-gray-500/30';
}

function getScoreColor(score: number): string {
  if (score === 1) {
    return 'bg-green-500/20 text-green-700 dark:text-green-300';
  }
  if (score === 0) {
    return 'bg-red-500/20 text-red-700 dark:text-red-300';
  }
  // For scores between 0 and 1
  return 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-300';
}

function MetricItem({ metric }: { metric: CekuraMetric }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="w-full">
        <div
          className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium cursor-pointer hover:opacity-80 transition-opacity',
            getScoreColor(metric.score)
          )}
        >
          {isOpen ? (
            <ChevronDown className="h-3.5 w-3.5 flex-shrink-0" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" />
          )}
          <span className="truncate">{metric.name}</span>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="ml-6 mt-1 mb-2 p-2 bg-muted/50 rounded-md text-xs space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Score:</span>
            <span className={cn(
              'px-1.5 py-0.5 rounded font-medium',
              getScoreColor(metric.score)
            )}>
              {metric.score}
            </span>
          </div>
          {metric.explanation && (
            <div>
              <span className="text-muted-foreground">Explanation:</span>
              <p className="mt-0.5 text-foreground leading-relaxed">{metric.explanation}</p>
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function CekuraStatus({ callData, isLoading, isFullyLoaded, hasError }: CekuraStatusProps) {
  // Stop propagation to prevent row click from opening the detail modal
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  // Error state - API not configured or failed
  if (hasError) {
    return (
      <div
        className="inline-flex items-center gap-1 px-1.5 py-0.5 md:gap-1.5 md:px-3 md:py-1 rounded-full text-[10px] md:text-xs font-medium bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20"
        title="Cekura API error - check if CEKURA_API_KEY is configured"
      >
        <AlertCircle className="h-2.5 w-2.5 md:h-3 md:w-3" />
        <span>Error</span>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="inline-flex items-center gap-1 px-1.5 py-0.5 md:gap-1.5 md:px-3 md:py-1 rounded-full text-[10px] md:text-xs font-medium bg-muted/50 text-muted-foreground border border-border">
        <Loader2 className="h-2.5 w-2.5 md:h-3 md:w-3 animate-spin" />
        <span className="hidden md:inline">Loading</span>
        <span className="md:hidden">...</span>
      </div>
    );
  }

  // No data state (after fully loaded)
  if (!callData && isFullyLoaded) {
    return (
      <div className="inline-flex items-center px-1.5 py-0.5 md:px-3 md:py-1 rounded-full text-[10px] md:text-xs font-medium bg-black/10 dark:bg-white/10 text-muted-foreground border border-transparent">
        <span className="hidden md:inline">No Data</span>
        <span className="md:hidden">N/A</span>
      </div>
    );
  }

  // Still loading full data but no match yet
  if (!callData) {
    return (
      <div className="inline-flex items-center gap-1 px-1.5 py-0.5 md:gap-1.5 md:px-3 md:py-1 rounded-full text-[10px] md:text-xs font-medium bg-muted/50 text-muted-foreground border border-border">
        <Loader2 className="h-2.5 w-2.5 md:h-3 md:w-3 animate-spin" />
        <span className="hidden md:inline">Loading</span>
        <span className="md:hidden">...</span>
      </div>
    );
  }

  const hasMetrics = callData.metrics && callData.metrics.length > 0;

  // If no metrics, just show the status badge without dropdown
  if (!hasMetrics) {
    return (
      <div
        className={cn(
          'inline-flex items-center px-1.5 py-0.5 md:px-3 md:py-1 rounded-full text-[10px] md:text-xs font-medium border capitalize',
          getStatusColor(callData.status)
        )}
      >
        <span className="truncate max-w-[50px] md:max-w-none">{callData.status}</span>
      </div>
    );
  }

  // With metrics, show dropdown
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          onClick={handleClick}
          className={cn(
            'inline-flex items-center gap-0.5 px-1.5 py-0.5 md:gap-1 md:px-3 md:py-1 rounded-full text-[10px] md:text-xs font-medium border capitalize cursor-pointer hover:opacity-80 transition-opacity',
            getStatusColor(callData.status)
          )}
        >
          <span className="truncate max-w-[50px] md:max-w-none">{callData.status}</span>
          <ChevronDown className="h-2.5 w-2.5 md:h-3 md:w-3 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-2" align="start" onClick={handleClick}>
        <div className="space-y-1">
          <div className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Evaluation Metrics
          </div>
          <div className="max-h-64 overflow-y-auto space-y-1">
            {callData.metrics.map((metric, index) => (
              <MetricItem key={`${metric.name}-${index}`} metric={metric} />
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
