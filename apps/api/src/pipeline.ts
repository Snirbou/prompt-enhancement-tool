import { EnrichmentContext, Message, IntentLevel } from "@repo/shared";
import { v4 as uuidv4 } from "uuid";
import { createLLMClient } from "./llm";

// ==========================================
// PIPELINE: Prompt Processing Logic
// ==========================================
// This file orchestrates the enrichment process.
// It takes a raw user prompt, cleans it, checks for safety,
// and then uses an AI model (Prompt Engineer persona) to rewrite it.

/**
 * Step 1: Normalize
 * Cleans up the input text (trims whitespace, limits length)
 * to ensure we don't send garbage to the LLM.
 */
export const normalizeStep = async (ctx: EnrichmentContext): Promise<EnrichmentContext> => {
  let normalized = ctx.userMessage.trim();
  normalized = normalized.replace(/\s+/g, " ");
  // Hard limit to prevent abuse
  if (normalized.length > 8000) {
    normalized = normalized.substring(0, 8000);
  }
  return { ...ctx, userMessage: normalized };
};

/**
 * Step 2: Safety Check
 * Basic heuristic check for unsafe or malicious inputs (e.g., prompt injection).
 * If flagged, we stop the process early.
 */
export const safetyCheckStep = async (ctx: EnrichmentContext): Promise<EnrichmentContext> => {
  const unsafeKeywords = ["ignore previous instructions", "system prompt", "drop table"];
  const flags = [...ctx.safetyFlags];
  
  if (unsafeKeywords.some(k => ctx.userMessage.toLowerCase().includes(k))) {
    flags.push("unsafe_keyword_detected");
  }

  return { ...ctx, safetyFlags: flags };
};

/**
 * Helper to get System Instruction based on Intent Level
 */
const getIntentSystemPrompt = (intent: IntentLevel): string => {
  switch (intent) {
    case "academic":
      return `You are an academic instructor.
Provide formal definitions and structured explanations.
Use precise terminology and clear organization.
Assume the reader is a university-level student.`;
    case "concise":
      return `You are a concise expert assistant.
Provide a short, direct answer.
Focus only on the most important points.
Avoid long explanations, examples, or repetition.`;
    case "deep-dive":
      return `You are an expert providing an in-depth explanation.
Cover theory, structure, edge cases, and implications.
Include detailed explanations and multiple perspectives.
Assume a technically advanced audience.`;
    case "casual":
    default:
      return `You are a friendly and knowledgeable assistant.
Explain concepts clearly and intuitively.
Use simple language and examples.
Avoid unnecessary formalism or deep theory unless explicitly requested.`;
  }
};

/**
 * Step 3: AI Enrichment Step
 * This is the core logic. It constructs a meta-prompt that asks an AI
 * to act as a "Professional Prompt Engineer" and rewrite the user's request.
 */
export const aiEnrichmentStep = async (ctx: EnrichmentContext, signal?: AbortSignal): Promise<string> => {
    // 1. If safety checks failed, return a refusal message.
    if (ctx.safetyFlags.length > 0) {
        return "I cannot fulfill this request due to safety concerns.";
    }

    // 2. Select the LLM client using the factory
    const llmClient = createLLMClient();

    // 3. Construct the "System Prompt" for the enrichment task
    // Added specific instruction to prevent self-reflection/meta-commentary in future steps
    const intentInstruction = getIntentSystemPrompt(ctx.intentLevel);

    const enrichmentPrompt = `You are a professional Prompt Engineer.
Your goal is to rewrite the user's prompt to be more effective, precise, and robust for an LLM.
Retain the user's original intent but improve clarity, context, and structure.
Do not answer the user's prompt. Only rewrite it.

IMPORTANT: The rewritten prompt should be self-contained and strictly instructions for the model.
Do not include conversational filler like "Here is the improved prompt".
Do not include the user's original request in the output, only the enhanced version.
Embed the following persona/intent instructions into the rewritten prompt:
"${intentInstruction}"

User's Original Prompt:
"${ctx.userMessage}"

Enriched Prompt:`;

    const messages: Message[] = [
        { role: "system", content: "You are a professional Prompt Engineer." },
        { role: "user", content: enrichmentPrompt }
    ];

    try {
        // 4. Call the LLM to get the improved prompt
        const enrichedText = await llmClient.chat(messages, signal);
        return enrichedText;
    } catch (error: unknown) {
        if (error instanceof Error && error.name === 'AbortError') {
            throw error;
        }
        console.error("AI Enrichment failed:", error);
        return ctx.userMessage; // Fallback: return original if AI fails
    }
};

/**
 * Helper: Format for Frontend
 * Extracts the enriched text content from the message structure
 * so it can be displayed easily in the UI bubble.
 */
export const formatEnrichedPrompt = (messages: Message[]): string => {
    if (messages.length === 1 && messages[0].role === "assistant") {
        return messages[0].content;
    }

    const systemMsg = messages.find(m => m.role === "system")?.content || "";
    const userMsg = messages.find(m => m.role === "user")?.content || "";

    if (systemMsg && userMsg) {
        return `${systemMsg}\n\nUser request:\n${userMsg}`;
    }
    return systemMsg || userMsg;
};

/**
 * Main Pipeline Runner
 * Connects all the steps together: Normalize -> Safety -> AI Enrichment
 */
export const runPipeline = async (
  rawMessage: string, 
  sessionId?: string,
  intentLevel: IntentLevel = "casual",
  signal?: AbortSignal
): Promise<{ messages: Message[]; ctx: EnrichmentContext }> => {
  // Initialize context
  let ctx: EnrichmentContext = {
    requestId: uuidv4(),
    sessionId: sessionId || uuidv4(),
    userMessage: rawMessage,
    intentLevel: intentLevel,
    language: "en",
    intent: "other", 
    safetyFlags: [],
  };

  // Run steps sequentially
  ctx = await normalizeStep(ctx);
  ctx = await safetyCheckStep(ctx);
  
  // Perform the enrichment
  const enrichedText = await aiEnrichmentStep(ctx, signal);

  // Wrap the result in a message structure
  const messages: Message[] = [
      { role: "assistant", content: enrichedText }
  ];

  return { messages, ctx };
};
