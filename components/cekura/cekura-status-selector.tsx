'use client';

import { useState } from 'react';
import { BarChart3, Check, ChevronDown, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useCekuraStatusMutation, type CekuraReviewedStatus } from '@/hooks/use-cekura';

interface CekuraStatusSelectorProps {
  status: string;
  cekuraId: number;
  correlationId: string;
  className?: string;
}

const STATUS_OPTIONS: { value: CekuraReviewedStatus; label: string; description: string }[] = [
  { value: 'reviewed_success', label: 'Reviewed Success', description: 'Mark this call as reviewed and successful' },
  { value: 'reviewed_failure', label: 'Reviewed Failure', description: 'Mark this call as reviewed with issues found' },
];

function getStatusStyles(status: string) {
  const lowerStatus = status.toLowerCase();
  if (lowerStatus === 'success' || lowerStatus === 'reviewed_success') {
    return {
      button: 'border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/30',
      text: 'text-green-700 dark:text-green-300',
    };
  }
  if (lowerStatus === 'failure' || lowerStatus === 'reviewed_failure' || lowerStatus === 'failed' || lowerStatus === 'error') {
    return {
      button: 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/30',
      text: 'text-red-700 dark:text-red-300',
    };
  }
  return {
    button: 'border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700',
    text: 'text-gray-700 dark:text-gray-300',
  };
}

function formatStatusLabel(status: string) {
  // Convert snake_case to Title Case
  return status
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function getStatusDescription(status: string) {
  const lowerStatus = status.toLowerCase();
  if (lowerStatus === 'success') {
    return 'Call completed successfully. Click to change review status.';
  }
  if (lowerStatus === 'reviewed_success') {
    return 'Reviewed and marked as successful. Click to change.';
  }
  if (lowerStatus === 'failure' || lowerStatus === 'failed' || lowerStatus === 'error') {
    return 'Call had issues. Click to change review status.';
  }
  if (lowerStatus === 'reviewed_failure') {
    return 'Reviewed and marked as having issues. Click to change.';
  }
  return 'Click to set review status.';
}

export function CekuraStatusSelector({
  status,
  cekuraId,
  correlationId,
  className,
}: CekuraStatusSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const mutation = useCekuraStatusMutation();
  const styles = getStatusStyles(status);

  const handleStatusChange = (newStatus: CekuraReviewedStatus) => {
    mutation.mutate({
      cekuraId,
      status: newStatus,
      correlationId,
    });
    setIsOpen(false);
  };

  return (
    <TooltipProvider>
      <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(styles.button, className)}
                disabled={mutation.isPending}
              >
                {mutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <BarChart3 className="h-3.5 w-3.5 mr-1.5" />
                )}
                {formatStatusLabel(status)}
                <ChevronDown className="h-3 w-3 ml-1.5" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-[200px]">
            <p className="text-xs">{getStatusDescription(status)}</p>
          </TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="start" className="w-52">
          {STATUS_OPTIONS.map((option) => (
            <DropdownMenuItem
              key={option.value}
              onClick={() => handleStatusChange(option.value)}
              className="flex flex-col items-start gap-0.5 py-2"
            >
              <div className="flex items-center justify-between w-full">
                <span className="font-medium">{option.label}</span>
                {status === option.value && (
                  <Check className="h-4 w-4 text-green-600" />
                )}
              </div>
              <span className="text-xs text-muted-foreground">{option.description}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </TooltipProvider>
  );
}
