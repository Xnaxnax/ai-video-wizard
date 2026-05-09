// src/app/api/openai/chat/route.ts
import { NextResponse } from 'next/server';

type ChatMessage = {
  role: 'system' | 'assistant' | 'user';
  content: string | any[];
};

type ChatRequestBody = {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
};

export async function POST(req: Request) {
  const { messages, model = 'gpt-4o-mini', temperature = 0.7 } = (await req.json()) as ChatRequestBody;

  if (!messages) {
    return NextResponse.json({ error: { message: 'Missing `messages` in request body' } }, { status: 400 });
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: { message: 'OPENAI_API_KEY is not configured on the server' } }, { status: 500 });
  }

  const MAX_RETRIES = 3;
  let lastError: any = null;
  let lastStatus = 500;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let response: Response;
    try {
      // 120s timeout — network to OpenAI can be very slow (40s+ for SSL)
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120_000);

      response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          ...(process.env.OPENAI_ORG_ID && { 'OpenAI-Organization': process.env.OPENAI_ORG_ID })
        },
        body: JSON.stringify({
          model,
          messages,
          temperature,
          stream: false
        }),
        signal: controller.signal
      });

      clearTimeout(timeout);
    } catch (networkError: any) {
      const msg = networkError.name === 'AbortError'
        ? 'Request timed out (120s). Network to OpenAI is very slow.'
        : networkError.message;
      console.error(`[OpenAI Chat] Network error on attempt ${attempt + 1}:`, msg);
      lastError = { message: `Network error: ${msg}` };
      lastStatus = 502;
      if (attempt < MAX_RETRIES) {
        const delay = 3000 * (attempt + 1);
        console.warn(`[OpenAI Chat] Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      break;
    }

    if (response.ok) {
      const data = await response.json();
      return NextResponse.json(data);
    }

    // Parse error body safely (response.json() can only be called once)
    let err: any;
    try {
      err = await response.json();
    } catch {
      err = { error: { message: `OpenAI returned status ${response.status} with non-JSON body` } };
    }

    lastError = err;
    lastStatus = response.status;

    // Retry on rate limit (429) or server errors (5xx) with exponential backoff
    if ((response.status === 429 || response.status >= 500) && attempt < MAX_RETRIES) {
      const retryAfter = parseInt(response.headers.get('retry-after') || '0', 10);
      const delay = retryAfter > 0 ? retryAfter * 1000 : Math.min(5000 * Math.pow(2, attempt), 30000);
      console.warn(`[OpenAI Chat] ${response.status} error, retry ${attempt + 1}/${MAX_RETRIES} in ${delay}ms`);
      await new Promise(resolve => setTimeout(resolve, delay));
      continue;
    }

    // Non-retryable error — return immediately
    const errorMessage = err?.error?.message || `OpenAI API error (${response.status})`;
    return NextResponse.json({ error: { message: errorMessage } }, { status: response.status });
  }

  // All retries exhausted
  const errorMessage = lastError?.error?.message || 'OpenAI API: max retries exceeded';
  return NextResponse.json({ error: { message: errorMessage } }, { status: lastStatus });
}
