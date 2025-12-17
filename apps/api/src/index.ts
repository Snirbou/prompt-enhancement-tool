import { app } from "./app";
import pino from "pino";
import dotenv from "dotenv";

dotenv.config();

const port = process.env.PORT || 8080;
const logger = pino({ level: process.env.LOG_LEVEL || "info" });

app.listen(port, async () => {
  const provider = process.env.LLM_PROVIDER || "mock";
  const model = process.env.LLM_MODEL || "unknown";
  
  // Use console.log as requested for clear visibility
  console.log(`API server started on port ${port}`);
  console.log(`Using LLM provider: ${provider} (${model})`);

  // Runtime check for Ollama availability
  if (provider === "ollama") {
    try {
      const baseUrl = process.env.LLM_BASE_URL || "http://localhost:11434";
      const res = await fetch(`${baseUrl}/api/tags`); // Simple health check for Ollama
      if (!res.ok) {
        console.warn(`WARNING: Ollama provider configured but unreachable at ${baseUrl}. Status: ${res.status}`);
      }
    } catch (err) {
      console.warn(`WARNING: Ollama provider configured but unreachable. Is Ollama running? Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
});
