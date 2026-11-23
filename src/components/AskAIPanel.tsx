"use client";

import { useState } from "react";
import { Sparkles, X, ArrowUp } from "lucide-react";
import type { ReaderPost } from "@/lib/reader";

interface Msg {
  role: "user" | "model";
  text: string;
}

const SUGGESTIONS = [
  { label: "Summarise it", prompt: "Summarise this post in a few bullet points." },
  { label: "Explain it", prompt: "Explain this post in simple terms." },
  { label: "Find related saves", prompt: "What topics or themes does this post relate to? Suggest related searches I could run." },
  { label: "Draft a post", prompt: "Draft a short X post inspired by this." },
];

export function AskAIPanel({ post, onClose }: { post: ReaderPost; onClose: () => void }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || loading) return;
    setInput("");
    setError(null);
    const history = messages.map((m) => ({ role: m.role, text: m.text }));
    setMessages((prev) => [...prev, { role: "user", text: question }]);
    setLoading(true);
    try {
      const res = await fetch("/api/ai/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId: post.id, question, history }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessages((prev) => [...prev, { role: "model", text: data.answer }]);
      } else {
        setError(data.error || "Failed to get an answer");
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  const displayName = post.authorName || post.authorHandle || "Unknown";

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 pt-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-b from-blue-400 to-violet-500">
          <Sparkles className="h-4 w-4 text-white" />
        </div>
        <span className="font-semibold">Ask AI</span>
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        <button
          onClick={onClose}
          className="ml-auto rounded-md p-2 text-muted-foreground hover:text-foreground hover:bg-secondary"
          aria-label="Close chat"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Context */}
      <div className="mx-4 mt-3 rounded-xl border border-blue-500/30 bg-blue-500/5 px-3 py-2">
        <p className="truncate text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{displayName}</span>
          {post.authorHandle ? ` @${post.authorHandle}` : ""} · Post
        </p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && !loading && (
          <div className="mt-6 text-center">
            <p className="text-sm text-muted-foreground max-w-[20rem] mx-auto">
              Ask me to summarise, pull takeaways, or draft from this post.
            </p>
          </div>
        )}

        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl bg-blue-500 px-3.5 py-2 text-sm text-white">
                {m.text}
              </div>
            </div>
          ) : (
            <div key={i} className="rounded-xl border border-border bg-card px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap">
              {m.text}
            </div>
          )
        )}

        {loading && (
          <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
            Thinking…
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
            {error.includes("API key") && (
              <>
                {" "}
                <a href="/dashboard/settings" className="underline">
                  Open Settings
                </a>
              </>
            )}
          </div>
        )}

        {messages.length === 0 && !loading && (
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s.label}
                onClick={() => send(s.prompt)}
                className="rounded-full border border-border bg-secondary/50 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="px-4 pb-4 pt-2">
        <div className="relative rounded-2xl border border-border bg-secondary/30">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={2}
            placeholder="Chat with your bookmarks…"
            className="w-full resize-none bg-transparent px-3.5 py-3 pr-12 text-sm outline-none placeholder:text-muted-foreground"
          />
          <button
            onClick={() => send(input)}
            disabled={!input.trim() || loading}
            className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-foreground/10 text-muted-foreground hover:text-foreground disabled:opacity-40"
            aria-label="Send"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
