'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Database } from 'lucide-react';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { CopyButton } from '@/components/ui/copy-button';

interface ChatSqlBadgeProps {
  sql: string;
}

export function ChatSqlBadge({ sql }: ChatSqlBadgeProps) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="my-2 overflow-hidden">
      <CollapsibleTrigger className="flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
        <Database className="h-3 w-3" />
        <span>SQL Query</span>
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1 relative">
          <pre className="rounded-md bg-muted p-3 pr-10 text-xs overflow-x-auto font-mono whitespace-pre-wrap break-all">
            {sql}
          </pre>
          <CopyButton value={sql} className="absolute top-1.5 right-1.5" />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
