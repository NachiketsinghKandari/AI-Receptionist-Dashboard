'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { MessageSquare, MoreHorizontal, Pencil, Share2, Trash2, Plus, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { Conversation } from '@/types/chat';

interface ChatHistoryProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, newTitle: string) => void;
  onShare: (id: string) => void;
  onClearAll: () => void;
  onNew: () => void;
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

function ConversationItem({
  conv,
  isActive,
  onSelect,
  onDelete,
  onRename,
  onShare,
}: {
  conv: Conversation;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onRename: (newTitle: string) => void;
  onShare: () => void;
}) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(conv.title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isRenaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isRenaming]);

  const handleStartRename = useCallback(() => {
    setRenameValue(conv.title);
    setIsRenaming(true);
  }, [conv.title]);

  const handleConfirmRename = useCallback(() => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== conv.title) {
      onRename(trimmed);
    }
    setIsRenaming(false);
  }, [renameValue, conv.title, onRename]);

  const handleCancelRename = useCallback(() => {
    setRenameValue(conv.title);
    setIsRenaming(false);
  }, [conv.title]);

  const handleRenameKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleConfirmRename();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleCancelRename();
      }
    },
    [handleConfirmRename, handleCancelRename],
  );

  if (isRenaming) {
    return (
      <div className="flex items-center gap-1.5 w-full rounded-md px-2 py-1.5 bg-accent">
        <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onKeyDown={handleRenameKeyDown}
          onBlur={handleConfirmRename}
          className="h-6 text-sm px-1.5 py-0 border-primary/50"
        />
        <button
          type="button"
          className="inline-flex items-center justify-center h-5 w-5 rounded-md shrink-0 hover:bg-accent-foreground/10"
          onClick={handleConfirmRename}
          title="Confirm"
        >
          <Check className="h-3 w-3 text-green-600" />
        </button>
        <button
          type="button"
          className="inline-flex items-center justify-center h-5 w-5 rounded-md shrink-0 hover:bg-accent-foreground/10"
          onClick={handleCancelRename}
          title="Cancel"
        >
          <X className="h-3 w-3 text-muted-foreground" />
        </button>
      </div>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onSelect();
      }}
      className={cn(
        'group flex items-center gap-2 w-full rounded-md px-2.5 py-2 text-left transition-colors cursor-pointer',
        'hover:bg-accent',
        isActive && 'bg-accent',
      )}
    >
      <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <div className="flex-1 min-w-0">
        <p className="text-sm truncate" title={conv.title}>
          {conv.title}
        </p>
        <p className="text-xs text-muted-foreground truncate">
          {formatRelativeTime(conv.updatedAt)}
        </p>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              'inline-flex items-center justify-center h-7 w-7 rounded-md shrink-0',
              'text-muted-foreground hover:text-foreground hover:bg-accent-foreground/10',
              'opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-all',
            )}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-36">
          <DropdownMenuItem onClick={() => handleStartRename()}>
            <Pencil />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onShare()}>
            <Share2 />
            Share
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => onDelete()}>
            <Trash2 />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function ChatHistory({
  conversations,
  activeId,
  onSelect,
  onDelete,
  onRename,
  onShare,
  onClearAll,
  onNew,
}: ChatHistoryProps) {
  return (
    <div className="flex flex-col h-full min-h-0 border-r">
      <div className="shrink-0 flex items-center justify-between px-3 py-3 border-b">
        <span className="text-sm font-medium">History</span>
        <div className="flex items-center gap-0.5">
          {conversations.length > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" onClick={onClearAll}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Delete all chats</TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" onClick={onNew}>
                <Plus className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>New chat</TooltipContent>
          </Tooltip>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="p-2 space-y-0.5">
          {conversations.length === 0 && (
            <p className="px-2 py-4 text-xs text-center text-muted-foreground">
              No previous chats
            </p>
          )}
          {conversations.map((conv) => (
            <ConversationItem
              key={conv.id}
              conv={conv}
              isActive={activeId === conv.id}
              onSelect={() => onSelect(conv.id)}
              onDelete={() => onDelete(conv.id)}
              onRename={(newTitle) => onRename(conv.id, newTitle)}
              onShare={() => onShare(conv.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
