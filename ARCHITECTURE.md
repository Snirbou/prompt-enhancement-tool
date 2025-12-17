# Architecture & Implementation Overview

This document explains the technical implementation of the Prompt Enhancement Tool.

## 1. High-Level Flow

The application follows a **two-step process** to help users get better results from AI models:

### Step A: Enrichment (Prompt Engineering)
1.  **User Input:** User types a rough idea (e.g., "write python script").
2.  **API Request:** Frontend sends this to `/api/enrich`.
3.  **Pipeline Processing:**
    *   **Normalization:** Trims whitespace and limits length.
    *   **Safety Check:** Scans for malicious keywords.
    *   **AI Enrichment:** The server acts as a "Professional Prompt Engineer". It sends the user's draft to an LLM with instructions to rewrite it for clarity, precision, and context.
4.  **Review:** The server returns the *enhanced* prompt to the frontend. The user sees it in an editable text area.

### Step B: Execution (Chat)
1.  **User Review:** User edits or approves the enhanced prompt.
2.  **API Request:** Frontend sends the *final* prompt to `/api/chat`.
3.  **LLM Execution:** The server sends this final prompt to the LLM (as a User message).
4.  **Streaming:** The LLM's response is streamed back to the frontend in real-time using Server-Sent Events (SSE).

## 2. Key Components (Backend)

### `apps/api/src/app.ts` (The Entry Point)
*   **Express Server:** Handles HTTP requests.
*   **Endpoints:**
    *   `POST /api/enrich`: Trigger the enrichment pipeline.
    *   `POST /api/chat`: Execute the final prompt and stream results.
*   **Client Selection:** Automatically selects between `RealLLMClient` and `MockLLMClient` based on the presence of `LLM_API_KEY`.

### `apps/api/src/pipeline.ts` (Business Logic)
*   **`runPipeline`:** The main coordinator function.
*   **`aiEnrichmentStep`:** The core logic that asks the AI to improve the user's prompt. It constructs a meta-prompt: *"You are a Prompt Engineer... rewrite this: [User Input]"*.
*   **`safetyCheckStep`:** A basic guardrail against misuse.

### `apps/api/src/llm.ts` (AI Abstraction)
*   **`LLMClient` Interface:** Defines methods for `chat` (one-shot) and `streamChat` (streaming).
*   **`RealLLMClient`:** Connects to OpenAI API. Requires `LLM_API_KEY`.
*   **`MockLLMClient`:** A simulation used for testing and development without costs. It returns hardcoded responses with simulated delays.

## 3. Key Components (Frontend)

### `apps/web/app/page.tsx`
*   **React State Machine:** Manages the UI phases: `idle` -> `enriching` -> `review` -> `streaming`.
*   **Enrichment Bubble:** A dedicated UI area that shows the "Processed Prompt" separately from the chat history, allowing users to verify what is being sent to the AI.

## 4. Configuration

The system is configured via environment variables in `apps/api/.env`:

```env
PORT=8080
LLM_API_KEY=sk-...  # (Optional) OpenAI Key. If missing, Mock mode is used.
USE_MOCK_LLM=false  # (Optional) Force Mock mode even if key exists.
```
