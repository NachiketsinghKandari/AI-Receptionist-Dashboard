'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useEnvironment } from '@/components/providers/environment-provider';
import type { ChatMessage, StreamEvent } from '@/types/chat';

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

interface UseChatOptions {
  onMessagesChange?: (messages: ChatMessage[]) => void;
}

export function useChat({ onMessagesChange }: UseChatOptions = {}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const { environment } = useEnvironment();
  const onMessagesChangeRef = useRef(onMessagesChange);
  onMessagesChangeRef.current = onMessagesChange;

  // Notify parent when messages change (for auto-save)
  useEffect(() => {
    onMessagesChangeRef.current?.(messages);
  }, [messages]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsLoading(false);
  }, []);

  const send = useCallback(
    async (content: string) => {
      if (!content.trim() || isLoading) return;

      const userMessage: ChatMessage = {
        id: generateId(),
        role: 'user',
        content: content.trim(),
        createdAt: Date.now(),
      };

      const assistantMessage: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: '',
        createdAt: Date.now(),
      };

      setMessages((prev) => [...prev, userMessage, assistantMessage]);
      setIsLoading(true);

      const abortController = new AbortController();
      abortRef.current = abortController;

      // Build messages payload (include tool metadata for multi-turn context)
      const apiMessages = [...messages, userMessage].map((m) => ({
        role: m.role,
        content: m.content,
        ...(m.sql && { sql: m.sql }),
        ...(m.result && { result: m.result }),
        ...(m.chart && { chart: m.chart }),
      }));

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: apiMessages, environment }),
          signal: abortController.signal,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => null);
          throw new Error(errorData?.error || `HTTP ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error('No response stream');

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          // Keep the last incomplete line in the buffer
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.trim()) continue;

            let event: StreamEvent;
            try {
              event = JSON.parse(line);
            } catch {
              continue;
            }

            setMessages((prev) => {
              const updated = [...prev];
              const last = { ...updated[updated.length - 1] };

              switch (event.type) {
                case 'text':
                  last.content += event.content;
                  break;
                case 'sql':
                  last.sql = event.sql;
                  break;
                case 'result':
                  last.result = event.result;
                  break;
                case 'chart':
                  last.chart = event.chart;
                  break;
                case 'error':
                  last.error = event.error;
                  break;
                case 'done':
                  break;
              }

              updated[updated.length - 1] = last;
              return updated;
            });
          }
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;

        setMessages((prev) => {
          const updated = [...prev];
          const last = { ...updated[updated.length - 1] };
          last.error = err instanceof Error ? err.message : 'Failed to send message';
          updated[updated.length - 1] = last;
          return updated;
        });
      } finally {
        abortRef.current = null;
        setIsLoading(false);
      }
    },
    [messages, isLoading, environment],
  );

  const clear = useCallback(() => {
    stop();
    setMessages([]);
  }, [stop]);

  const loadMessages = useCallback((msgs: ChatMessage[]) => {
    setMessages(msgs);
  }, []);

  return { messages, isLoading, send, stop, clear, loadMessages };
}
