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

  // Track in-flight save to coalesce rapid updates
  const savingRef = useRef(false);
  const queuedRef = useRef<Conversation | null>(null);

  /** Persist a conversation to the server immediately, coalescing rapid calls */
  const persistNow = useCallback((conversation: Conversation) => {
    if (savingRef.current) {
      // A save is already in-flight — queue this one so it fires when the current finishes
      queuedRef.current = conversation;
      return;
    }

    savingRef.current = true;
    api('/api/chat/history', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversation }),
    }).finally(() => {
      savingRef.current = false;
      // If another save was queued while we were saving, fire it now
      const queued = queuedRef.current;
      if (queued) {
        queuedRef.current = null;
        persistNow(queued);
      }
    });
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
        persistNow({
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
        persistNow(newConv);
      }
    },
    [activeId, persistNow],
  );

  const loadConversation = useCallback(
    (id: string): ChatMessage[] | null => {
      const conv = conversations.find((c) => c.id === id);
      if (!conv) return null;
      setActiveId(id);
      return conv.messages;
    },
    [conversations],
  );

  const startNewChat = useCallback(() => {
    setActiveId(null);
  }, []);

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
