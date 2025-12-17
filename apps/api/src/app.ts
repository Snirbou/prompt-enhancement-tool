import express, { Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import { ChatRequestSchema, FinalChatRequestSchema, Message, Role } from "@repo/shared";
import { runPipeline, formatEnrichedPrompt } from "./pipeline";
import { createLLMClient } from "./llm";
import pino from "pino";

dotenv.config();

// Initialize Express App
export const app = express();
const logger = pino({ level: process.env.LOG_LEVEL || "info" });

// ==========================================
// Middleware Configuration
// ==========================================
app.use(cors({ origin: ["http://localhost:3000"] }));
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  if (process.env.NODE_ENV !== 'test') {
      logger.info({ method: req.method, url: req.url, requestId: req.headers["x-request-id"] }, "Incoming request");
  }
  next();
});

// Health check endpoint for monitoring
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

// ==========================================
// IN-MEMORY SESSION STORE (Simple for V1)
// ==========================================
const sessionStore: Record<string, Message[]> = {};

// ==========================================
// ENDPOINT 1: Enrichment (/api/enrich)
// ==========================================
app.post("/api/enrich", async (req: Request, res: Response) => {
    // 1. Validate Input
    const result = ChatRequestSchema.safeParse(req.body);

    if (!result.success) {
        res.status(400).json({ error: "Invalid request", details: result.error });
        return;
    }

    const { message, sessionId, intentLevel } = result.data;

    // 2. Setup AbortController for Enrichment
    const abortController = new AbortController();
    const onResClose = () => abortController.abort();
    res.on('close', onResClose);

    try {
        // 3. Run the Enrichment Pipeline (Normalize -> Safety -> AI Rewrite)
        // Pass signal to allow cancellation
        const { messages, ctx } = await runPipeline(message, sessionId, intentLevel, abortController.signal);
        
        // Remove listener if completed successfully
        res.off('close', onResClose);

        // 4. Format result for the user (Plain text for easy editing)
        const enrichedPrompt = formatEnrichedPrompt(messages);

        res.json({
            enrichedPrompt,
            metadata: {
                language: ctx.language,
                intent: ctx.intent,
                safetyFlags: ctx.safetyFlags
            }
        });
    } catch (err: unknown) {
        res.off('close', onResClose);
        
        // Handle cancellation gracefully
        if (err instanceof Error && err.name === 'AbortError') {
             // Request was aborted by client, nothing to do or log
             return;
        }

        logger.error(err, "Enrichment failed");
        res.status(500).json({ error: "Enrichment failed" });
    }
});

// ==========================================
// ENDPOINT 2: Chat Execution (/api/chat)
// ==========================================
app.post("/api/chat", async (req: Request, res: Response) => {
  // 1. Validate Input
  const result = FinalChatRequestSchema.safeParse(req.body);

  if (!result.success) {
    res.status(400).json({ error: "Invalid request", details: result.error });
    return;
  }

  const { finalPrompt, sessionId, useSystemRole } = result.data;

  // Initialize session history if it doesn't exist
  if (!sessionStore[sessionId]) {
    sessionStore[sessionId] = [];
  }

  // 2. Construct Message Payload with History
  const currentRole: Role = useSystemRole ? "system" : "user";
  const currentMessage: Message = { role: currentRole, content: finalPrompt };

  const messagesToSend: Message[] = [
      ...sessionStore[sessionId],
      currentMessage
  ];

  // Use the LLM provider for the chat execution
  const provider = process.env.LLM_PROVIDER || "mock";
  if (process.env.NODE_ENV !== 'test') {
      console.log(`Using LLM provider: ${provider}`);
      console.log(`Session ID: ${sessionId} | History Length: ${sessionStore[sessionId].length}`);
  }

  // 3. Setup SSE Headers for Streaming
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  // 4. Setup AbortController for Chat Execution
  // Standard Express req.on('close') handles client disconnects
  // Fetch API inside createLLMClient needs a signal if we want strict abort propagation
  // For streamChat, we can pass a signal.
  const abortController = new AbortController();
  const onResClose = () => abortController.abort();
  res.on('close', onResClose);

  try {
    const llmClient = createLLMClient();
    let fullResponse = "";

    try {
        // 5. Stream the response chunks to the client
        for await (const chunk of llmClient.streamChat(messagesToSend, abortController.signal)) {
            res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
            fullResponse += chunk;
        }
        res.write("data: [DONE]\n\n");

        // 6. Persist Conversation History (After successful completion)
        sessionStore[sessionId].push({ role: "user", content: finalPrompt });
        sessionStore[sessionId].push({ role: "assistant", content: fullResponse });

    } catch (streamError: unknown) {
        if (streamError instanceof Error && streamError.name === 'AbortError') {
            // Stream aborted by client
            res.write(`data: ${JSON.stringify({ error: "Stream aborted" })}\n\n`);
            return; 
        }
        logger.error(streamError, "Streaming error");
        res.write(`data: ${JSON.stringify({ error: "Stream interrupted" })}\n\n`);
    } finally {
        res.end();
        res.off('close', onResClose);
    }

  } catch (err) {
    res.off('close', onResClose);
    logger.error(err, "Internal server error");
    if (!res.headersSent) {
        res.status(500).json({ error: "Internal server error" });
    }
  }
});
