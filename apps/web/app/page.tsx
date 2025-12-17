"use client";

import { useState, useRef, useEffect } from "react";
import { Loader2, Sparkles, Send, Square, User, Bot } from "lucide-react";
import { v4 as uuidv4 } from "uuid";

type ChatPhase = "idle" | "enriching" | "review" | "streaming" | "stopped" | "error";
type IntentLevel = "casual" | "academic" | "concise" | "deep-dive";

type ChatMessage = {
    id: string;
    role: "user" | "assistant";
    content: string;
};

export default function Home() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [intentLevel, setIntentLevel] = useState<IntentLevel>("casual");
  
  const [phase, setPhase] = useState<ChatPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  
  // Enriched Prompt State
  const [enrichedPrompt, setEnrichedPrompt] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Initialize Session ID on mount
  useEffect(() => {
    setSessionId(uuidv4());
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, phase]);

  const handleStop = () => {
    const wasEnriching = phase === "enriching";
    
    if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
    }
    setPhase("stopped");
    
    // Logic:
    // If we were enriching, we want to keep the raw input so the user can edit/retry.
    // If we were streaming (chatting), the message is already in history, so we clear the input.
    setEnrichedPrompt(""); // Always clear enriched prompt on stop
    
    if (!wasEnriching) {
        setInput("");
    }
  };

  const handleEnrich = async () => {
    if (!input.trim() || phase === "enriching" || phase === "streaming") return;

    setPhase("enriching");
    setError(null);
    setEnrichedPrompt("");

    // Setup AbortController for Enrichment
    abortControllerRef.current = new AbortController();

    try {
        const response = await fetch("http://localhost:8080/api/enrich", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
                message: input.trim(),
                sessionId,
                intentLevel
            }),
            signal: abortControllerRef.current.signal
        });

        if (!response.ok) throw new Error("Enrichment failed");

        const data = await response.json();
        setEnrichedPrompt(data.enrichedPrompt);
        setPhase("review");
        abortControllerRef.current = null;
    } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') {
            // Handled by handleStop
            return;
        }
        setError(err instanceof Error ? err.message : "Enrichment failed");
        setPhase("error");
        abortControllerRef.current = null;
    }
  };

  /**
   * Universal Send Function
   * @param useEnhanced If true, sends enrichedPrompt. If false, sends input.
   */
  const handleSend = async (useEnhanced: boolean) => {
    // 1. Single Source of Truth for Chat Message
    const promptToSend = useEnhanced ? enrichedPrompt : input;
    if (!promptToSend.trim()) return;

    // Display EXACTLY what is being sent to the model
    const displayContent = promptToSend;

    // Add user message to UI immediately
    const userMsgId = uuidv4();
    setMessages(prev => [...prev, { id: userMsgId, role: "user", content: displayContent }]);

    setPhase("streaming");
    setError(null);

    // Create placeholder for assistant response
    const assistantMsgId = uuidv4();
    setMessages(prev => [...prev, { id: assistantMsgId, role: "assistant", content: "" }]);

    // Setup AbortController for Stop functionality
    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch("http://localhost:8080/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
            finalPrompt: promptToSend,
            sessionId,
            useSystemRole: useEnhanced 
        }),
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) throw new Error(`Error: ${response.statusText}`);
      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let done = false;

      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        const chunkValue = decoder.decode(value, { stream: true });
        const lines = chunkValue.split("\n");
        
        for (const line of lines) {
            if (line.startsWith("data: ")) {
                const data = line.slice(6);
                if (data === "[DONE]") {
                    done = true;
                    break;
                }
                try {
                    const parsed = JSON.parse(data);
                    const content = parsed.content;
                    if (content) {
                        setMessages(prev => prev.map(msg => 
                            msg.id === assistantMsgId 
                                ? { ...msg, content: msg.content + content }
                                : msg
                        ));
                    }
                } catch (e) { console.error(e); }
            }
        }
      }
      setPhase("idle");
      // Clear inputs on success
      setInput("");
      setEnrichedPrompt("");
      abortControllerRef.current = null;

    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
          // Handled by handleStop
          return;
      }
      setError(err instanceof Error ? err.message : "An error occurred");
      setPhase("error");
      abortControllerRef.current = null;
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center p-6 bg-[#1e1e1e] text-[#d4d4d4] font-sans">
      <div className="w-full max-w-5xl flex flex-col h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#333] pb-4 mb-4 shrink-0">
            <h1 className="text-xl font-bold text-gray-100 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-yellow-500" />
                Prompt Enhancement Tool
            </h1>
            <div className="flex items-center gap-4">
                 <select 
                    value={intentLevel}
                    onChange={(e) => setIntentLevel(e.target.value as IntentLevel)}
                    className="bg-[#252526] border border-[#333] text-sm rounded px-3 py-1 focus:outline-none focus:border-[#555]"
                    // LOCK: Disable intent selection during streaming AND enriching
                    disabled={phase === "streaming" || phase === "enriching"}
                 >
                     <option value="casual">🟢 Casual (Default)</option>
                     <option value="academic">🔵 Academic</option>
                     <option value="concise">🟣 Concise</option>
                     <option value="deep-dive">🔴 Deep Dive</option>
                 </select>
                <div className="text-xs text-gray-500">
                    Conversational Mode
                </div>
            </div>
        </div>

        {/* Chat History (Scrollable) */}
        <div className="flex-1 overflow-y-auto mb-6 pr-2 space-y-6">
            {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-gray-600 space-y-2">
                    <Sparkles className="w-10 h-10 opacity-20" />
                    <p>Start a conversation by typing a prompt below.</p>
                </div>
            ) : (
                messages.map((msg) => (
                    <div key={msg.id} className={`flex gap-4 ${msg.role === "assistant" ? "bg-[#252526]/50 rounded-lg p-4" : "pl-4"}`}>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                            msg.role === "assistant" ? "bg-green-700/20 text-green-500" : "bg-blue-600/20 text-blue-400"
                        }`}>
                            {msg.role === "assistant" ? <Bot className="w-5 h-5" /> : <User className="w-5 h-5" />}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-xs font-bold uppercase text-gray-500 mb-1">
                                {msg.role}
                            </div>
                            <div className="prose prose-invert max-w-none text-gray-300 leading-relaxed whitespace-pre-wrap text-sm">
                                {msg.content}
                                {phase === "streaming" && msg.id === messages[messages.length - 1].id && (
                                    <span className="inline-block w-2 h-4 ml-1 bg-gray-500 animate-pulse align-middle" />
                                )}
                            </div>
                        </div>
                    </div>
                ))
            )}
            <div ref={messagesEndRef} />
        </div>

        {/* Input Area (Fixed at bottom) */}
        <div className="shrink-0 space-y-4 bg-[#1e1e1e] pt-2">
             
             {/* Enriched Prompt Panel (Conditionally Visible) */}
             {(enrichedPrompt || phase === "enriching" || phase === "review") && (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 border border-[#333] rounded-md bg-[#252526] p-3 relative">
                    <div className="flex justify-between items-center mb-2">
                         <span className="text-[10px] uppercase font-bold text-yellow-500/80 tracking-wider">
                            Internal System Instruction
                         </span>
                         <button 
                            onClick={() => setEnrichedPrompt("")} 
                            className="text-gray-500 hover:text-gray-300"
                            // LOCK: Disable dismiss during streaming OR enriching
                            disabled={phase === "streaming" || phase === "enriching"}
                         >
                             <span className="sr-only">Dismiss</span>
                             ×
                         </button>
                    </div>
                    {phase === "enriching" ? (
                        <div className="flex items-center gap-2 text-sm text-gray-400 py-4">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Optimizing prompt for <strong>{intentLevel}</strong> tone...
                        </div>
                    ) : (
                        <textarea 
                            value={enrichedPrompt}
                            onChange={(e) => setEnrichedPrompt(e.target.value)}
                            className="w-full bg-transparent border-none focus:ring-0 text-[#a1a1a1] font-mono text-xs resize-none h-24 p-0"
                            placeholder="Enriched prompt will appear here..."
                            // LOCK: Read-only during streaming OR enriching
                            disabled={phase === "streaming" || phase === "enriching"}
                        />
                    )}
                </div>
            )}

            {/* Main Input & Controls */}
            <div className="flex gap-4 items-start">
                 <div className="flex-1 relative">
                    <textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Type your request here..."
                        className="w-full p-4 bg-[#252526] border border-[#333] rounded-lg focus:border-[#555] focus:outline-none text-white resize-none h-[80px]"
                        // LOCK: Disabled during streaming or enriching
                        disabled={phase === "streaming" || phase === "enriching"}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                            }
                        }}
                    />
                    {error && (
                        <div className="absolute -top-8 left-0 text-xs text-red-400 bg-[#2d1a1a] px-2 py-1 rounded">
                            {error}
                        </div>
                    )}
                 </div>

                 <div className="flex flex-col gap-2 w-[180px]">
                    {phase === "streaming" || phase === "enriching" ? (
                        <button
                            onClick={handleStop}
                            className="h-[80px] w-full bg-red-900/30 hover:bg-red-900/50 border border-red-800 text-red-200 rounded-lg flex flex-col items-center justify-center gap-2 transition-all"
                        >
                            <Square className="w-5 h-5 fill-current" />
                            Stop {phase === "enriching" ? "Enriching" : "Generating"}
                        </button>
                    ) : (
                        <>
                             <button
                                onClick={handleEnrich}
                                // LOCK: Disable enrich during streaming/stopped state if not reset?
                                // "Re-enable controls only when: Streaming completes OR user clicks Stop"
                                // If stopped, phase is "stopped", so this should be enabled if input is valid.
                                disabled={!input.trim() || (phase !== "idle" && phase !== "stopped" && phase !== "review")}
                                className="flex-1 bg-[#333] hover:bg-[#444] text-white rounded-md text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                <Sparkles className="w-3 h-3 text-yellow-500" />
                                Enrich
                            </button>
                            <div className="flex gap-2 h-10">
                                <button
                                    onClick={() => handleSend(false)}
                                    disabled={!input.trim()}
                                    className="flex-1 bg-[#2d2d2d] hover:bg-[#3d3d3d] border border-[#444] text-gray-300 rounded-md text-xs font-medium transition-colors disabled:opacity-50"
                                    title="Send Raw"
                                >
                                    Raw
                                </button>
                                <button
                                    onClick={() => handleSend(true)}
                                    disabled={!enrichedPrompt.trim()}
                                    className="flex-[2] bg-green-700/80 hover:bg-green-700 text-white rounded-md text-xs font-medium transition-colors disabled:opacity-50"
                                    title="Send Enhanced"
                                >
                                    Send Enhanced
                                </button>
                            </div>
                        </>
                    )}
                 </div>
            </div>
        </div>

      </div>
    </main>
  );
}
