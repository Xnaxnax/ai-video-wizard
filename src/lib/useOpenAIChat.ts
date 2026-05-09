// src/lib/useOpenAIChat.ts
import { useState } from 'react';

export interface ChatMessage {
  role: 'system' | 'assistant' | 'user';
  content: string | any[];
}

export interface ChatResult {
  id: string;
  object: string;
  created: number;
  choices: Array<{
    message: ChatMessage;
    finish_reason: string;
    index: number;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Simple hook to call the OpenAI proxy API.
 */
export function useOpenAIChat() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<ChatResult | null>(null);

  const send = async (
    messages: ChatMessage[],
    opts?: { model?: string; temperature?: number }
  ) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/openai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, ...opts })
      });

      if (!res.ok) {
        let errorMessage = `Ошибка сервера (${res.status})`;
        try {
          const err = await res.json();
          errorMessage = err?.error?.message || err?.error || errorMessage;
        } catch {
          // Response body was empty or not JSON
        }
        throw new Error(errorMessage);
      }

      const data: ChatResult = await res.json();
      setResponse(data);
      return data;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      setError(message);
      throw e;
    } finally {
      setLoading(false);
    }
  };

  return { send, loading, error, response };
}
