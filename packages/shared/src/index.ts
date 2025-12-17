import { z } from "zod";

// Updated IntentLevel enum
export type IntentLevel =
  | "casual"
  | "academic"
  | "concise"
  | "deep-dive";

// Updated schema to include intent level
export const ChatRequestSchema = z.object({
  message: z.string().min(1).max(8000),
  sessionId: z.string().optional(),
  intentLevel: z.enum(["casual", "academic", "concise", "deep-dive"]).optional().default("casual"),
});

export const EnrichRequestSchema = z.object({
  message: z.string().min(1).max(8000),
  sessionId: z.string().optional(),
  intentLevel: z.enum(["casual", "academic", "concise", "deep-dive"]).optional().default("casual"),
});

// Updated schema for chat execution to support history
export const FinalChatRequestSchema = z.object({
  finalPrompt: z.string().min(1),
  sessionId: z.string().min(1), // Session ID is now required for history
  useSystemRole: z.boolean().optional()
});

export type ChatRequest = z.infer<typeof ChatRequestSchema>;
export type EnrichRequest = z.infer<typeof EnrichRequestSchema>;
export type FinalChatRequest = z.infer<typeof FinalChatRequestSchema>;

export type Role = "system" | "user" | "assistant";

export type Message = {
  role: Role;
  content: string;
};

export type TargetMessages = Message[];

export type EnrichmentContext = {
  requestId: string;
  sessionId: string;
  userMessage: string;
  intentLevel: IntentLevel; // Added intent level
  language: "he" | "en" | "other";
  intent: "question" | "code" | "writing" | "planning" | "other";
  safetyFlags: string[];
};

export type EnrichResponse = {
  enrichedPrompt: string;
  metadata: {
    language: "he" | "en" | "other";
    intent: string;
  };
};
