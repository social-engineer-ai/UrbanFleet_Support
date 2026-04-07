"use client";

import { useState, useEffect, useRef } from "react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

const PERSONA_INFO: Record<string, { name: string; title: string; color: string }> = {
  elena: { name: "Elena Vasquez", title: "VP of Operations", color: "blue" },
  marcus: { name: "Marcus Chen", title: "CFO", color: "indigo" },
  priya: { name: "Priya Sharma", title: "CTO", color: "purple" },
  james: { name: "James Whitfield", title: "Compliance Director", color: "slate" },
  mentor: { name: "Dr. Raj Patel", title: "Senior Cloud Architect", color: "emerald" },
};

export function ChatInterface({
  conversationId,
  onEnd,
}: {
  conversationId: string;
  onEnd: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [remainingMessages, setRemainingMessages] = useState<number | null>(null);
  const [conversationEnded, setConversationEnded] = useState(false);
  const [persona, setPersona] = useState<string>("mentor");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    loadMessages();
  }, [conversationId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText]);

  async function loadMessages() {
    const res = await fetch(`/api/conversations/${conversationId}/messages`);
    if (res.ok) {
      const data = await res.json();
      setMessages(data);

      // Detect persona from conversation
      const convRes = await fetch("/api/conversations");
      if (convRes.ok) {
        const convs = await convRes.json();
        const conv = convs.find((c: { id: string }) => c.id === conversationId);
        if (conv) {
          setPersona(conv.persona || "mentor");
          setConversationEnded(!!conv.endedAt);
        }
      }
    }
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || sending || conversationEnded) return;

    const userMessage = input.trim();
    setInput("");
    setSending(true);
    setStreamingText("");

    // Optimistically add user message
    const tempUserMsg: Message = {
      id: `temp-${Date.now()}`,
      role: "user",
      content: userMessage,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      const res = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: userMessage }),
      });

      if (!res.ok) {
        const err = await res.json();
        if (err.error) {
          setStreamingText(`Error: ${err.error}`);
          setSending(false);
          return;
        }
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let fullText = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.text) {
                  fullText += data.text;
                  setStreamingText(fullText);
                }
                if (data.done) {
                  setRemainingMessages(data.remainingMessages);
                }
                if (data.error) {
                  fullText += `\n\n[Error: ${data.error}]`;
                  setStreamingText(fullText);
                }
              } catch {
                // ignore parse errors for partial chunks
              }
            }
          }
        }
      }

      // Replace streaming text with final message
      const assistantMsg: Message = {
        id: `msg-${Date.now()}`,
        role: "assistant",
        content: fullText,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
      setStreamingText("");
    } catch (error) {
      console.error("Send error:", error);
      setStreamingText("Failed to send message. Please try again.");
    }

    setSending(false);
    textareaRef.current?.focus();
  }

  const MOOD_OPTIONS = [
    { id: "frustrated", label: "Frustrated", icon: "😤", message: "[I'm feeling frustrated right now]" },
    { id: "nervous", label: "Nervous", icon: "😰", message: "[I'm feeling nervous about this]" },
    { id: "confident", label: "Gaining confidence", icon: "💪", message: "[I'm starting to feel more confident about this]" },
    { id: "insightful", label: "Had an insight", icon: "💡", message: "[I just had an insight about this]" },
    { id: "lost", label: "Lost", icon: "😕", message: "[I'm feeling lost and not sure where to go from here]" },
  ];

  async function sendMood(mood: typeof MOOD_OPTIONS[0]) {
    if (sending || conversationEnded) return;
    // Send as a user message — the agent sees it and adjusts tone
    setInput("");
    setSending(true);
    setStreamingText("");

    const tempUserMsg: Message = {
      id: `temp-${Date.now()}`,
      role: "user",
      content: mood.message,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      const res = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: mood.message }),
      });

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let fullText = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n");
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.text) { fullText += data.text; setStreamingText(fullText); }
                if (data.done) setRemainingMessages(data.remainingMessages);
              } catch { /* partial chunk */ }
            }
          }
        }
      }

      const assistantMsg: Message = {
        id: `msg-${Date.now()}`,
        role: "assistant",
        content: fullText,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
      setStreamingText("");
    } catch (error) {
      console.error("Mood send error:", error);
    }
    setSending(false);
  }

  async function handleEndConversation() {
    if (confirm("End this conversation? The session will be analyzed and saved.")) {
      setConversationEnded(true);
      onEnd();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(e);
    }
  }

  const info = PERSONA_INFO[persona] || PERSONA_INFO.mentor;

  return (
    <div className="flex-1 flex flex-col h-screen">
      {/* Header */}
      <div className="bg-white border-b px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-full bg-${info.color}-100 flex items-center justify-center`}
          >
            <span className={`text-${info.color}-700 font-semibold text-sm`}>
              {info.name.split(" ").map((n) => n[0]).join("")}
            </span>
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">{info.name}</h2>
            <p className="text-xs text-gray-500">{info.title}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {remainingMessages !== null && remainingMessages <= 20 && (
            <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded" title="After the limit, a new session starts. Your progress and key points are saved.">
              {remainingMessages} messages left in this session
            </span>
          )}
          {!conversationEnded && (
            <button
              onClick={handleEndConversation}
              className="text-sm text-gray-500 hover:text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
            >
              End Session
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[75%] rounded-2xl px-4 py-3 ${
                msg.role === "user"
                  ? "bg-blue-600 text-white"
                  : "bg-white border border-gray-200 text-gray-800"
              }`}
            >
              <div className="whitespace-pre-wrap text-sm leading-relaxed">
                {msg.content}
              </div>
            </div>
          </div>
        ))}

        {streamingText && (
          <div className="flex justify-start">
            <div className="max-w-[75%] rounded-2xl px-4 py-3 bg-white border border-gray-200 text-gray-800">
              <div className="whitespace-pre-wrap text-sm leading-relaxed">
                {streamingText}
                <span className="inline-block w-1.5 h-4 bg-gray-400 animate-pulse ml-0.5 align-text-bottom" />
              </div>
            </div>
          </div>
        )}

        {sending && !streamingText && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      {conversationEnded ? (
        <div className="px-6 py-4 bg-gray-100 border-t text-center text-sm text-gray-500">
          This conversation has ended. Start a new one from the sidebar.
        </div>
      ) : (
        <div className="bg-white border-t shrink-0">
          <div className="px-6 pt-3 flex items-center gap-1.5">
            <span className="text-xs text-gray-400 mr-1">How are you feeling?</span>
            {MOOD_OPTIONS.map((mood) => (
              <button
                key={mood.id}
                type="button"
                onClick={() => sendMood(mood)}
                disabled={sending}
                className="px-2.5 py-1 text-xs rounded-full border border-gray-200 hover:border-gray-400 hover:bg-gray-50 disabled:opacity-40 transition-colors"
                title={mood.label}
              >
                {mood.icon} {mood.label}
              </button>
            ))}
          </div>
          <form onSubmit={sendMessage} className="px-6 py-3">
            <div className="flex gap-3 items-end">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type your message... (Enter to send, Shift+Enter for new line)"
                rows={2}
                className="flex-1 resize-none rounded-xl border border-gray-300 px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                disabled={sending}
              />
              <button
                type="submit"
                disabled={sending || !input.trim()}
                className="bg-blue-600 text-white px-5 py-3 rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
              >
                Send
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
