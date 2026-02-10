'use client';

import { useRef, useCallback } from 'react';
import { ArrowUp, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ChatInputProps {
  onSend: (message: string) => void;
  onStop: () => void;
  isLoading: boolean;
}

export function ChatInput({ onSend, onStop, isLoading }: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = useCallback(() => {
    const value = textareaRef.current?.value.trim();
    if (!value || isLoading) return;
    onSend(value);
    if (textareaRef.current) {
      textareaRef.current.value = '';
      textareaRef.current.style.height = 'auto';
    }
  }, [onSend, isLoading]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  const handleInput = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  }, []);

  return (
    <div className="shrink-0 border-t p-3">
      <div className="flex items-end gap-2 rounded-xl border bg-muted/40 px-3 py-2 focus-within:ring-2 focus-within:ring-ring/50 transition-shadow">
        <textarea
          ref={textareaRef}
          placeholder="Ask about your data..."
          className="flex-1 resize-none bg-transparent py-1 text-sm placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          rows={1}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          disabled={isLoading}
        />
        {isLoading ? (
          <Button
            variant="outline"
            size="icon-sm"
            className="shrink-0 rounded-lg"
            onClick={onStop}
            aria-label="Stop generating"
          >
            <Square className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            size="icon-sm"
            className="shrink-0 rounded-lg"
            onClick={handleSubmit}
            aria-label="Send message"
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
