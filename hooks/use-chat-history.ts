'use client';

import { useState, useCallback, useEffect } from 'react';
import type { Conversation, ChatMessage } from '@/types/chat';

const STORAGE_KEY = 'hc-chat-history';
const MAX_CONVERSATIONS = 50;

function loadConversations(): Conversation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Conversation[];
  } catch {
    return [];
  }
}

function saveConversations(conversations: Conversation[]) {
  try {
    // Keep only the most recent conversations
    const trimmed = conversations.slice(0, MAX_CONVERSATIONS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function titleFromMessages(messages: ChatMessage[]): string {
  const firstUser = messages.find((m) => m.role === 'user');
  if (!firstUser) return 'New chat';
  const text = firstUser.content.trim();
  return text.length > 60 ? `${text.slice(0, 57)}...` : text;
}

export function useChatHistory() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);

  // Hydrate from localStorage
  useEffect(() => {
    setConversations(loadConversations());
    setIsHydrated(true);
  }, []);

  // Persist whenever conversations change (after hydration)
  useEffect(() => {
    if (isHydrated) {
      saveConversations(conversations);
    }
  }, [conversations, isHydrated]);

  const saveMessages = useCallback(
    (messages: ChatMessage[]) => {
      if (messages.length === 0) return;

      setConversations((prev) => {
        if (activeId) {
          // Update existing conversation
          return prev.map((c) =>
            c.id === activeId
              ? { ...c, messages, title: titleFromMessages(messages), updatedAt: Date.now() }
              : c,
          );
        }
        // Create new conversation
        const newConv: Conversation = {
          id: generateId(),
          title: titleFromMessages(messages),
          messages,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        setActiveId(newConv.id);
        return [newConv, ...prev];
      });
    },
    [activeId],
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

  const renameConversation = useCallback(
    (id: string, newTitle: string) => {
      const trimmed = newTitle.trim();
      if (!trimmed) return;
      setConversations((prev) =>
        prev.map((c) =>
          c.id === id ? { ...c, title: trimmed, updatedAt: Date.now() } : c,
        ),
      );
    },
    [],
  );

  const deleteConversation = useCallback(
    (id: string) => {
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeId === id) {
        setActiveId(null);
      }
    },
    [activeId],
  );

  const clearAll = useCallback(() => {
    setConversations([]);
    setActiveId(null);
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
