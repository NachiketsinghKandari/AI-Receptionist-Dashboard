'use client';

import { useEffect } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogClose,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface DetailDialogProps {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  // Navigation props
  onPrevious?: () => void;
  onNext?: () => void;
  hasPrevious?: boolean;
  hasNext?: boolean;
}

export function DetailDialog({
  open,
  onClose,
  title,
  subtitle,
  children,
  className,
  onPrevious,
  onNext,
  hasPrevious = false,
  hasNext = false,
}: DetailDialogProps) {
  // Keyboard navigation
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.key === 'ArrowLeft' && hasPrevious && onPrevious) {
        e.preventDefault();
        onPrevious();
      }
      if (e.key === 'ArrowRight' && hasNext && onNext) {
        e.preventDefault();
        onNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, hasPrevious, hasNext, onPrevious, onNext]);

  const showNavigation = onPrevious !== undefined || onNext !== undefined;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent
        className={cn(
          'w-[calc(100vw-1rem)] sm:w-[calc(100vw-2rem)] max-w-4xl h-[calc(100vh-2rem)] sm:h-[calc(100vh-4rem)] max-h-[800px] rounded-lg flex flex-col p-0 gap-0 overflow-hidden',
          className
        )}
      >
        {/* Header - fixed at top */}
        <div className="px-4 py-3 md:px-6 md:py-4 border-b flex items-start justify-between gap-2 md:gap-4 shrink-0 bg-background">
          <div className="flex-1 min-w-0">
            <DialogTitle className="text-base md:text-lg font-semibold">
              {title}
            </DialogTitle>
            {subtitle && (
              <DialogDescription className="text-xs md:text-sm text-muted-foreground mt-1">
                {subtitle}
              </DialogDescription>
            )}
          </div>
          <div className="flex items-center gap-0.5 md:gap-1 shrink-0">
            {showNavigation && (
              <>
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
              </>
            )}
            <DialogClose asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
              >
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </Button>
            </DialogClose>
          </div>
        </div>

        {/* Content - scrollable */}
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
          <div className="px-4 py-3 md:px-6 md:py-4">
            {children}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
