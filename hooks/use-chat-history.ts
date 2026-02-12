'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import type { Conversation, ChatMessage } from '@/types/chat';

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function titleFromMessages(messages: ChatMessage[]): string {
  const firstUser = messages.find((m) => m.role === 'user');
  if (!firstUser) return 'New chat';
  const text = firstUser.content.trim();
  return text.length > 60 ? `${text.slice(0, 57)}...` : text;
}

async function api(url: string, options?: RequestInit) {
  try {
    const res = await fetch(url, options);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export function useChatHistory() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);

  // Ref to read conversations without adding it as a dependency
  const conversationsRef = useRef<Conversation[]>([]);
  conversationsRef.current = conversations;

  // Debounced server persistence
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<Conversation | null>(null);

  const flushPersist = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    const conv = pendingRef.current;
    if (conv) {
      pendingRef.current = null;
      api('/api/chat/history', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation: conv }),
      });
    }
  }, []);

  const debouncedPersist = useCallback(
    (conversation: Conversation) => {
      pendingRef.current = conversation;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(flushPersist, 1000);
    },
    [flushPersist],
  );

  // Flush pending save on unmount / page unload
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      const conv = pendingRef.current;
      if (conv) {
        pendingRef.current = null;
        fetch('/api/chat/history', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversation: conv }),
          keepalive: true,
        }).catch(() => {});
      }
    };
  }, []);

  // Hydrate from server on mount
  useEffect(() => {
    api('/api/chat/history').then((data) => {
      if (data?.conversations) {
        setConversations(data.conversations);
      }
      setIsHydrated(true);
    });
  }, []);

  const saveMessages = useCallback(
    (messages: ChatMessage[]) => {
      if (messages.length === 0) return;

      const title = titleFromMessages(messages);
      const now = Date.now();

      if (activeId) {
        // Update existing conversation
        setConversations((prev) =>
          prev.map((c) =>
            c.id === activeId ? { ...c, messages, title, updatedAt: now } : c,
          ),
        );
        const existing = conversationsRef.current.find((c) => c.id === activeId);
        debouncedPersist({
          id: activeId,
          title,
          messages,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        });
      } else {
        // Create new conversation
        const newConv: Conversation = {
          id: generateId(),
          title,
          messages,
          createdAt: now,
          updatedAt: now,
        };
        setActiveId(newConv.id);
        setConversations((prev) => [newConv, ...prev]);
        debouncedPersist(newConv);
      }
    },
    [activeId, debouncedPersist],
  );

  const loadConversation = useCallback(
    (id: string): ChatMessage[] | null => {
      flushPersist();
      const conv = conversations.find((c) => c.id === id);
      if (!conv) return null;
      setActiveId(id);
      return conv.messages;
    },
    [conversations, flushPersist],
  );

  const startNewChat = useCallback(() => {
    flushPersist();
    setActiveId(null);
  }, [flushPersist]);

  const renameConversation = useCallback((id: string, newTitle: string) => {
    const trimmed = newTitle.trim();
    if (!trimmed) return;
    setConversations((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, title: trimmed, updatedAt: Date.now() } : c,
      ),
    );
    api('/api/chat/history', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, title: trimmed }),
    });
  }, []);

  const deleteConversation = useCallback(
    (id: string) => {
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeId === id) setActiveId(null);
      api(`/api/chat/history?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    },
    [activeId],
  );

  const clearAll = useCallback(() => {
    setConversations([]);
    setActiveId(null);
    api('/api/chat/history?all=true', { method: 'DELETE' });
  }, []);

  return {
    conversations,
    activeId,
    isHydrated,
    saveMessages,
    loadConversation,
    startNewChat,
    renameConversation,
    deleteConversation,
    clearAll,
  };
}
