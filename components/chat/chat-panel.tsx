'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Plus, Maximize2, Minimize2, PanelLeftOpen, PanelLeftClose, Sparkles } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-is-mobile';
import { useChat } from '@/hooks/use-chat';
import { useChatHistory } from '@/hooks/use-chat-history';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from '@/components/ui/drawer';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { ChatButton } from './chat-button';
import { ChatInput } from './chat-input';
import { ChatMessage } from './chat-message';
import { ChatHistory } from './chat-history';
import { cn } from '@/lib/utils';
import type { ChatMessage as ChatMessageType } from '@/types/chat';

function IconAction({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" onClick={onClick}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function ChatPanel() {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const isMobile = useIsMobile();

  const {
    conversations,
    activeId,
    saveMessages,
    loadConversation,
    startNewChat,
    renameConversation,
    deleteConversation,
    clearAll,
  } = useChatHistory();

  const handleMessagesChange = useCallback(
    (msgs: ChatMessageType[]) => {
      const hasContent = msgs.some((m) => m.role === 'user');
      if (hasContent) {
        saveMessages(msgs);
      }
    },
    [saveMessages],
  );

  const { messages, isLoading, send, stop, clear, loadMessages } = useChat({
    onMessagesChange: handleMessagesChange,
  });
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  const toggleExpanded = useCallback(() => {
    setExpanded((prev) => {
      const next = !prev;
      if (next && !isMobile) setShowHistory(true);
      return next;
    });
  }, [isMobile]);

  const handleSelectConversation = useCallback(
    (id: string) => {
      const msgs = loadConversation(id);
      if (msgs) {
        loadMessages(msgs);
      }
      if (isMobile) setShowHistory(false);
    },
    [loadConversation, loadMessages, isMobile],
  );

  const handleNewChat = useCallback(() => {
    startNewChat();
    clear();
    if (isMobile) setShowHistory(false);
  }, [startNewChat, clear, isMobile]);

  const handleClear = useCallback(() => {
    startNewChat();
    clear();
  }, [startNewChat, clear]);

  const handleClearAll = useCallback(() => {
    clearAll();
    clear();
  }, [clearAll, clear]);

  const handleShareConversation = useCallback(
    async (id: string) => {
      const conv = conversations.find((c) => c.id === id);
      if (!conv) return;

      const lines = [`${conv.title}`, '---'];
      for (const msg of conv.messages) {
        const role = msg.role === 'user' ? 'You' : 'Assistant';
        lines.push(`${role}: ${msg.content}`);
      }
      const text = lines.join('\n');

      try {
        await navigator.clipboard.writeText(text);
      } catch {
        // Clipboard API unavailable
      }
    },
    [conversations],
  );

  const chatContent = (
    <div className="flex flex-1 min-h-0 min-w-0 flex-col">
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4">
        <div className="space-y-4 py-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-3 pt-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
                <Sparkles className="h-6 w-6 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">Ask about your data</p>
                <p className="text-xs text-muted-foreground max-w-[260px]">
                  Try &quot;How many calls were there today?&quot; or &quot;Show me transfers by firm&quot;
                </p>
              </div>
            </div>
          )}
          {messages.map((msg) => (
            <ChatMessage key={msg.id} message={msg} />
          ))}
          {isLoading && messages[messages.length - 1]?.role === 'assistant' && !messages[messages.length - 1]?.content && !messages[messages.length - 1]?.result && (
            <div className="flex gap-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted">
                <Sparkles className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex items-center gap-1 rounded-2xl bg-muted px-4 py-3">
                <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:0ms]" />
                <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:150ms]" />
                <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          )}
        </div>
      </div>
      <ChatInput onSend={send} onStop={stop} isLoading={isLoading} />
    </div>
  );

  const historySidebar = showHistory && (
    <div className={cn('shrink-0 self-stretch overflow-hidden', expanded ? 'w-72' : 'w-64')}>
      <ChatHistory
        conversations={conversations}
        activeId={activeId}
        onSelect={handleSelectConversation}
        onDelete={deleteConversation}
        onRename={renameConversation}
        onShare={handleShareConversation}
        onClearAll={handleClearAll}
        onNew={handleNewChat}
      />
    </div>
  );

  const headerActions = (
    <div className="flex items-center gap-1">
      {!isMobile && (
        <IconAction
          label={showHistory ? 'Hide history' : 'Show history'}
          onClick={() => setShowHistory(!showHistory)}
        >
          {showHistory ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
        </IconAction>
      )}
      {!isMobile && (
        <IconAction
          label={expanded ? 'Collapse' : 'Expand'}
          onClick={toggleExpanded}
        >
          {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </IconAction>
      )}
      {messages.length > 0 && (
        <IconAction label="New chat" onClick={handleClear}>
          <Plus className="h-4 w-4" />
        </IconAction>
      )}
      <IconAction
        label="Close"
        onClick={() => { setOpen(false); setExpanded(false); }}
      >
        <X className="h-4 w-4" />
      </IconAction>
    </div>
  );

  // Mobile: Drawer
  if (isMobile) {
    return (
      <>
        {!open && <ChatButton onClick={() => setOpen(true)} />}
        <Drawer open={open} onOpenChange={setOpen}>
          <DrawerContent className="h-[85vh]">
            <DrawerHeader className="shrink-0 flex flex-row items-center justify-between border-b px-4 py-3">
              <div className="flex items-center gap-2">
                <DrawerTitle className="text-base">Data Chat</DrawerTitle>
                {conversations.length > 0 && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setShowHistory(!showHistory)}
                    aria-label={showHistory ? 'Hide history' : 'Show history'}
                  >
                    {showHistory ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-1">
                {messages.length > 0 && (
                  <Button variant="ghost" size="icon-sm" onClick={handleClear} aria-label="New chat">
                    <Plus className="h-4 w-4" />
                  </Button>
                )}
                <Button variant="ghost" size="icon-sm" onClick={() => setOpen(false)} aria-label="Close">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </DrawerHeader>
            <DrawerDescription className="sr-only">
              Chat with your dashboard data using natural language queries
            </DrawerDescription>
            {showHistory ? (
              <div className="flex-1 min-h-0 overflow-hidden">
                <ChatHistory
                  conversations={conversations}
                  activeId={activeId}
                  onSelect={handleSelectConversation}
                  onDelete={deleteConversation}
                  onRename={renameConversation}
                  onShare={handleShareConversation}
                  onClearAll={handleClearAll}
                  onNew={handleNewChat}
                />
              </div>
            ) : (
              chatContent
            )}
          </DrawerContent>
        </Drawer>
      </>
    );
  }

  // Desktop: Dialog for expanded, Sheet for default
  return (
    <>
      {!open && <ChatButton onClick={() => setOpen(true)} />}

      {/* Expanded mode: centered dialog */}
      <Dialog
        open={open && expanded}
        onOpenChange={(v) => {
          if (!v) {
            setOpen(false);
            setExpanded(false);
          }
        }}
      >
        <DialogContent className="w-[min(1200px,95vw)] h-[min(850px,90vh)] max-w-none p-0 flex flex-col rounded-xl gap-0 overflow-hidden">
          <div className="flex items-center justify-between border-b px-4 py-3 shrink-0">
            <DialogTitle className="text-base font-semibold">Data Chat</DialogTitle>
            {headerActions}
          </div>
          <DialogDescription className="sr-only">
            Chat with your dashboard data using natural language queries
          </DialogDescription>
          <div className="flex flex-1 min-h-0 overflow-hidden">
            {historySidebar}
            {chatContent}
          </div>
        </DialogContent>
      </Dialog>

      {/* Default mode: side sheet */}
      <Sheet
        open={open && !expanded}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setExpanded(false);
        }}
      >
        <SheetContent
          side="right"
          className="p-0 flex flex-col [&>button:first-child]:hidden sm:max-w-none w-[480px] gap-0"
          hideCloseButton
        >
          <SheetHeader className="flex flex-row items-center justify-between border-b px-4 py-3 shrink-0 space-y-0">
            <SheetTitle className="text-base">Data Chat</SheetTitle>
            {headerActions}
          </SheetHeader>
          <SheetDescription className="sr-only">
            Chat with your dashboard data using natural language queries
          </SheetDescription>
          <div className="flex flex-1 min-h-0 overflow-hidden">
            {historySidebar}
            {chatContent}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
