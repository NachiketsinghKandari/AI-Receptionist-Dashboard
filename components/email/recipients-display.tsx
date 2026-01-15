'use client';

import { useState } from 'react';
import { ChevronDown, Mail } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface RecipientsDisplayProps {
  recipients: string | string[];
  className?: string;
  compact?: boolean;
}

export function RecipientsDisplay({ recipients, className, compact = false }: RecipientsDisplayProps) {
  const [open, setOpen] = useState(false);

  // Normalize to array
  const recipientList = Array.isArray(recipients) ? recipients : [recipients];

  if (recipientList.length === 0) {
    return <span className={cn('text-muted-foreground', className)}>-</span>;
  }

  // If only one recipient, just show it
  if (recipientList.length === 1) {
    return <span className={className}>{recipientList[0]}</span>;
  }

  // Multiple recipients - show first with dropdown
  const firstRecipient = recipientList[0];
  const remainingCount = recipientList.length - 1;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'inline-flex items-center gap-1 text-left hover:text-primary transition-colors group',
            className
          )}
        >
          <span className="truncate">{firstRecipient}</span>
          <span className={cn(
            'inline-flex items-center gap-0.5 text-muted-foreground group-hover:text-primary shrink-0',
            compact ? 'text-xs' : 'text-sm'
          )}>
            <span>+{remainingCount}</span>
            <ChevronDown className={cn(
              'transition-transform',
              compact ? 'h-3 w-3' : 'h-3.5 w-3.5',
              open && 'rotate-180'
            )} />
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-auto max-w-sm p-2"
        sideOffset={4}
      >
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground px-2 py-1">
            {recipientList.length} Recipients
          </p>
          <div className="max-h-48 overflow-auto">
            {recipientList.map((email, index) => (
              <div
                key={index}
                className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50 text-sm"
              >
                <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="truncate">{email}</span>
              </div>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
