import { Message } from "@repo/shared";

// ==========================================
// LLM Client Abstraction
// ==========================================
// This file defines the interface for interacting with LLM providers.
// It supports Real (OpenAI), Mock, and Ollama implementations.

export interface LLMClient {
  /**
   * Streams the response token by token (for real-time chat UI).
   */
  streamChat(messages: Message[], signal?: AbortSignal): AsyncIterable<string>;

  /**
   * Waits for the full response and returns it as a string (for internal processing).
   */
  chat(messages: Message[], signal?: AbortSignal): Promise<string>;
}

/**
 * Factory to create the appropriate LLM Client based on environment variables.
 */
export function createLLMClient(): LLMClient {
  const provider = process.env.LLM_PROVIDER || "mock";
  const apiKey = process.env.LLM_API_KEY;
  const useMock = process.env.USE_MOCK_LLM === "true";

  if (useMock) {
    return new MockLLMClient();
  }

  if (provider === "ollama") {
    return new OllamaClient();
  }

  if (apiKey) {
    return new RealLLMClient();
  }

  // Default to Mock if nothing else matches
  return new MockLLMClient();
}

/**
 * Mock Client
 * Used for testing or when no API key is provided.
 * Simulates network delays and streaming behavior.
 */
export class MockLLMClient implements LLMClient {
  async chat(messages: Message[], signal?: AbortSignal): Promise<string> {
    let result = "";
    for await (const chunk of this.streamChat(messages, signal)) {
      result += chunk;
    }
    return result;
  }

  async *streamChat(messages: Message[], signal?: AbortSignal): AsyncIterable<string> {
    const lastMsg = messages[messages.length - 1];
    const prompt = lastMsg ? lastMsg.content : "No prompt provided";
    
    // Simulate thinking time
    await new Promise(resolve => setTimeout(resolve, 500));

    const responseText = `[MOCK] I received your request: "${prompt}". \n\nHere is a generated answer based on the enriched prompt. I am simulating a real LLM response to demonstrate the streaming capability.`;
    
    const chunks = responseText.split(" ");
    for (const chunk of chunks) {
      if (signal?.aborted) {
          throw new DOMException("Aborted", "AbortError");
      }
      await new Promise(resolve => setTimeout(resolve, 30)); // Simulate typing speed
      yield chunk + " ";
    }
    yield "\n\n(End of Mock Response)";
  }
}

/**
 * Ollama Client
 * Connects to local Ollama instance.
 * Does not require an API key.
 */
export class OllamaClient implements LLMClient {
  private baseUrl: string;
  private model: string;

  constructor() {
    this.baseUrl = process.env.LLM_BASE_URL || "http://localhost:11434";
    this.model = process.env.LLM_MODEL || "llama3";
  }

  async chat(messages: Message[], signal?: AbortSignal): Promise<string> {
    let result = "";
    for await (const chunk of this.streamChat(messages, signal)) {
      result += chunk;
    }
    return result;
  }

  async *streamChat(messages: Message[], signal?: AbortSignal): AsyncIterable<string> {
    // Extract the prompt from messages. 
    // Ideally we'd use /api/chat for full history, but requirements specify /api/generate with "prompt"
    // We'll combine messages or take the last user message.
    // For this specific tool flow, we usually send one block of text.
    const prompt = messages.map(m => {
        if (m.role === 'system') return `System: ${m.content}\n`;
        if (m.role === 'user') return `User: ${m.content}\n`;
        return `${m.role}: ${m.content}\n`;
    }).join("\n");

    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        prompt: prompt,
        stream: true,
      }),
      signal: signal, // Pass AbortSignal to fetch
    });

    if (!response.ok) {
        // Try to read error body
        const errorText = await response.text().catch(() => "Unknown error");
        throw new Error(`Ollama API Error: ${response.statusText} (${response.status}) - ${errorText}`);
    }

    if (!response.body) {
      throw new Error("No response body received from Ollama");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const data = JSON.parse(trimmed);
              if (data.done) {
                return; 
              }
              if (data.response) {
                yield data.response;
              }
            } catch (e) {
              // Ignore parse errors for partial chunks
            }
          }
        }

        // Process remaining buffer if stream ends without newline
        if (buffer.trim()) {
           try {
              const data = JSON.parse(buffer);
              if (data.response) yield data.response;
           } catch (e) {
               // Ignore malformed JSON at the very end
           }
        }
    } finally {
        reader.releaseLock();
    }
  }
}

/**
 * Real Client
 * Connects to OpenAI (or compatible APIs) to perform actual inference.
 * Requires LLM_API_KEY to be set in .env.
 */
export class RealLLMClient implements LLMClient {
  private baseUrl: string;
  private apiKey: string;
  private model: string;

  constructor() {
    this.baseUrl = process.env.LLM_BASE_URL || "https://api.openai.com/v1";
    this.apiKey = process.env.LLM_API_KEY || "";
    this.model = process.env.LLM_MODEL || "gpt-3.5-turbo";
  }

  // Reuse streamChat to implement chat() to avoid duplication
  async chat(messages: Message[], signal?: AbortSignal): Promise<string> {
      let result = "";
      for await (const chunk of this.streamChat(messages, signal)) {
          result += chunk;
      }
      return result;
  }

  async *streamChat(messages: Message[], signal?: AbortSignal): AsyncIterable<string> {
    if (!this.apiKey) {
        throw new Error("LLM_API_KEY is not set. Please set LLM_API_KEY in .env");
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
            model: this.model,
            messages: messages,
            stream: true
        }),
        signal: signal // Pass AbortSignal to fetch
    });

    if (!response.ok) {
        throw new Error(`LLM API Error: ${response.statusText} (${response.status})`);
    }

    if (!response.body) {
         throw new Error("No response body received from LLM provider");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
        // Parse Server-Sent Events (SSE) from the OpenAI stream
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed === "data: [DONE]") continue;
                if (trimmed.startsWith("data: ")) {
                    try {
                        const data = JSON.parse(trimmed.slice(6));
                        const content = data.choices[0]?.delta?.content;
                        if (content) {
                            yield content;
                        }
                    } catch (e) {
                        // Ignore parse errors for partial chunks
                    }
                }
            }
        }
    } finally {
        reader.releaseLock();
    }
  }
}
