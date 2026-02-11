'use client';

import { MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

interface ChatButtonProps {
  onClick: () => void;
}

export function ChatButton({ onClick }: ChatButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          onClick={onClick}
          size="icon-lg"
          className="fixed bottom-20 right-6 z-40 rounded-full shadow-lg"
        >
          <MessageSquare className="h-5 w-5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="left">Chat with your data</TooltipContent>
    </Tooltip>
  );
}
