'use client';

import { useState, useRef, useEffect } from 'react';
import { Pencil, Loader2, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCekuraFeedbackMutation, type CekuraCallData } from '@/hooks/use-cekura';

interface CekuraFeedbackProps {
  callData: CekuraCallData | undefined;
  correlationId: string | null;
  isLoading: boolean;
  isFullyLoaded: boolean;
}

export function CekuraFeedback({ callData, correlationId, isLoading, isFullyLoaded }: CekuraFeedbackProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mutation = useCekuraFeedbackMutation();

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current && isEditing) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [editValue, isEditing]);

  // Focus textarea when entering edit mode
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      // Move cursor to end
      const len = textareaRef.current.value.length;
      textareaRef.current.setSelectionRange(len, len);
    }
  }, [isEditing]);

  const handleStartEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditValue(callData?.feedback || '');
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (!callData?.cekuraId || !correlationId) return;

    try {
      await mutation.mutateAsync({
        cekuraId: callData.cekuraId,
        feedback: editValue,
        correlationId,
      });
      setIsEditing(false);
    } catch (error) {
      console.error('Failed to save feedback:', error);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="inline-flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
      </div>
    );
  }

  // No cekura data state
  if (!callData && isFullyLoaded) {
    return <span className="text-muted-foreground text-xs">-</span>;
  }

  // Still loading
  if (!callData) {
    return (
      <div className="inline-flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
      </div>
    );
  }

  // Editing mode
  if (isEditing) {
    return (
      <div className="flex flex-col gap-1 w-full max-w-[200px]" onClick={handleClick}>
        <textarea
          ref={textareaRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Enter feedback..."
          className={cn(
            "w-full min-h-[60px] px-2 py-1.5 text-xs rounded-md resize-none",
            "border border-input bg-background",
            "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
            "placeholder:text-muted-foreground"
          )}
          disabled={mutation.isPending}
        />
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <span>Enter to save, Shift+Enter for new line</span>
          {mutation.isPending && <Loader2 className="h-3 w-3 animate-spin ml-auto" />}
          {!mutation.isPending && (
            <div className="flex items-center gap-1 ml-auto">
              <button
                onClick={handleSave}
                className="p-1 hover:bg-accent rounded transition-colors text-green-600 dark:text-green-400"
                title="Save (Enter)"
              >
                <Check className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={handleCancel}
                className="p-1 hover:bg-accent rounded transition-colors text-red-600 dark:text-red-400"
                title="Cancel (Escape)"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Display mode
  const feedback = callData.feedback;
  const hasFeedback = feedback && feedback.trim().length > 0;

  return (
    <div
      className="flex items-start gap-1.5 group cursor-pointer max-w-[200px]"
      onClick={handleStartEdit}
    >
      {hasFeedback ? (
        <span className="text-xs text-foreground truncate flex-1" title={feedback}>
          {feedback.length > 50 ? `${feedback.substring(0, 50)}...` : feedback}
        </span>
      ) : (
        <span className="text-xs text-muted-foreground italic">No feedback</span>
      )}
      <button
        onClick={handleStartEdit}
        className="p-1 opacity-0 group-hover:opacity-100 hover:bg-accent rounded transition-all"
        title="Edit feedback"
      >
        <Pencil className="h-3 w-3 text-muted-foreground" />
      </button>
    </div>
  );
}
