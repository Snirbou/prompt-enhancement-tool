# Prompt Enhancement Tool (Human-in-the-Loop AI)

A local-first, privacy-focused tool designed to help users craft better prompts for AI models. It acts as an intelligent intermediary layer between your raw idea and the final LLM execution, allowing you to enrich, review, and refine your request before sending it.

Built with **React**, **Node.js**, and **Ollama**, this tool runs entirely on your local machine—no external API keys required.

---

## Key Features

*   **Prompt Enrichment Pipeline**: Automatically transforms vague user inputs into structured, professional prompts using an expert persona.
*   **Human-in-the-Loop Review**: Users can review and edit the enhanced prompt before execution. You are never forced to use the AI's suggestion.
*   **Multiple Intent Modes**: Choose the tone and structure of the enhancement:
    *   🟢 **Casual** (Friendly and intuitive)
    *   🔵 **Academic** (Formal and structured)
    *   🟣 **Concise** (Direct and brief)
    *   🔴 **Deep Dive** (Comprehensive and theoretical)
*   **Dual Execution Path**: Explicitly choose to send either your **Raw Original** prompt or the **Enhanced System** prompt.
*   **Conversational Interface**: Full chat history support, allowing for multi-turn conversations with context memory.
*   **Real-Time Streaming**: Responses stream token-by-token for immediate feedback.
*   **Control & Safety**:
    *   **Stop Generation**: Abort enrichment or chat generation instantly at any time.
    *   **Input Preservation**: Your raw input is preserved even if you stop generation, allowing for easy edits.
    *   **UI Locking**: Prevents accidental state changes during active processing.
*   **Local AI Integration**: Native support for **Ollama** (running Llama 3 or other models locally).

---

## Why This Tool Exists

Direct interaction with LLMs often leads to suboptimal results because users may not know how to structure their request (the "blank page problem").

Most tools force you to either write the perfect prompt yourself or blindly trust an automated agent. This tool bridges that gap:
1.  You provide the **intent** (e.g., "explain graphs").
2.  The tool acts as a **Prompt Engineer** to structure it (add context, constraints, and persona).
3.  **You decide** whether to use that structure or stick to your own words.

It transforms prompt engineering from a manual chore into an assisted, interactive workflow.

---

## Architecture Overview

The system is built as a monorepo with a clear separation of concerns:

1.  **Frontend (`apps/web`)**: A modern React application that handles the chat interface, state management, and user interaction. It communicates with the backend via REST and Server-Sent Events (SSE).
2.  **Backend (`apps/api`)**: An Express.js server that orchestrates the logic. It manages:
    *   The Enrichment Pipeline (Normalization -> Safety Check -> AI Rewrite).
    *   Session memory (In-memory conversation history).
    *   Connection to the LLM provider.
3.  **LLM Layer (`packages/shared`, `llm.ts`)**: An abstraction layer that connects to the AI provider. Currently optimized for **Ollama** but extensible to others.

---

## Tech Stack

*   **Frontend**: React, Next.js (App Router), Tailwind CSS, Lucide Icons.
*   **Backend**: Node.js, Express, TypeScript, Zod (Validation).
*   **AI / LLM**: Ollama (Local Inference), Fetch API with Streaming.
*   **State Management**: React Hooks + AbortController for request cancellation.

---

## Prerequisites

Before running the project, ensure you have the following installed:

*   **Node.js** (v18 or higher recommended)
*   **npm** (Node Package Manager)
*   **Ollama** (for running local models)
    *   Download from [ollama.com](https://ollama.com)
    *   Supported on Windows, macOS, and Linux.

---

## Installation & Setup

### 1. Clone the Repository
```bash
git clone https://github.com/your-username/prompt-enhancement-tool.git
cd prompt-enhancement-tool
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Setup Ollama
Ensure Ollama is installed and running. Pull the model you intend to use (default is `llama3`):
```bash
ollama pull llama3
```
*Verify it is running by visiting `http://localhost:11434` in your browser.*

### 4. Configure Environment
Create a `.env` file in the `apps/api` directory:
```bash
# apps/api/.env

PORT=8080
LOG_LEVEL=info

# LLM Configuration
LLM_PROVIDER=ollama
LLM_BASE_URL=http://localhost:11434
LLM_MODEL=llama3
```

### 5. Run the Project
Start both the backend and frontend in development mode:
```bash
npm run dev
```
*   Frontend will be available at: `http://localhost:3000`
*   Backend API will be available at: `http://localhost:8080`

---

## Environment Variables

| Variable | Description | Default |
| :--- | :--- | :--- |
| `PORT` | The port for the API server. | `8080` |
| `LLM_PROVIDER` | The AI provider to use. Set to `ollama` for local use. | `mock` |
| `LLM_BASE_URL` | The URL of the Ollama instance. | `http://localhost:11434` |
| `LLM_MODEL` | The specific model name to load (must match what you pulled in Ollama). | `llama3` |
| `USE_MOCK_LLM` | Set to `true` to force simulated responses (useful for UI testing without AI). | `false` |

---

## Usage Guide

1.  **Enter Request**: Type your rough idea in the main text box.
2.  **Select Intent**: Choose a style (Casual, Academic, Concise, Deep Dive) from the dropdown.
3.  **Enrich**: Click the **Enrich** button. The AI will analyze your request and generate a structured System Prompt.
4.  **Review**: A new panel will appear with the "Processed Prompt". You can edit this text if needed.
5.  **Execute**:
    *   Click **Send Original** to send your raw input as a User message.
    *   Click **Send Enhanced** to send the enriched prompt as a System instruction.
6.  **Interact**: The model's response will stream into the chat. You can continue the conversation naturally.
7.  **Control**: Use the **Stop** button at any time to halt the process.

---

## Local AI with Ollama

This tool leverages **Ollama** to provide a privacy-first experience.
*   **No Data Leaks**: Your prompts and chat history never leave your machine.
*   **Cost-Free**: No API credits or subscription fees are required.
*   **Offline Capable**: Once the model is downloaded, the tool works without an internet connection.

---

## Project Status

**Version 1.0 (Stable)**
This project is a complete, functional proof-of-concept for a local-first prompt engineering workflow. It is designed to be a foundation for developers who want to build their own AI tools or improve their personal productivity.

---

## Future Improvements

*   **Diff View**: Visual comparison between original and enhanced prompts.
*   **Prompt Templates**: Save and load custom system instructions.
*   **Session Persistence**: Save chat history to a local database (SQLite/JSON).
*   **Model Switching**: Change models directly from the UI.

---

## License

MIT License

Copyright (c) 2025 Snir Boukris

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files...
