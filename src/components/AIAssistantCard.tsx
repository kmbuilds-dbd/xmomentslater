"use client";

import { useState } from "react";
import { KeyRound, Check, Trash2 } from "lucide-react";

export function AIAssistantCard({ initialHasKey }: { initialHasKey: boolean }) {
  const [hasKey, setHasKey] = useState(initialHasKey);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      const data = await res.json();
      if (res.ok) {
        setHasKey(true);
        setKey("");
        setSaved(true);
      } else {
        setError(data.error || "Failed to save");
      }
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/key", { method: "DELETE" });
      if (res.ok) {
        setHasKey(false);
        setSaved(false);
      } else {
        const data = await res.json();
        setError(data.error || "Failed to remove");
      }
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border px-5 py-4">
      <div className="flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-muted-foreground" />
        <p className="text-sm font-medium">AI Assistant (Gemini)</p>
        {hasKey && (
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] text-green-600 dark:text-green-400">
            <Check className="h-3 w-3" />
            Connected
          </span>
        )}
      </div>

      <p className="mt-1 text-xs text-muted-foreground">
        Add a Google AI Studio API key to ask questions about any saved post.
        Your key is encrypted and used only for your own requests.
      </p>

      {hasKey ? (
        <button
          onClick={remove}
          disabled={busy}
          className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive px-2 py-1 rounded-md hover:bg-secondary transition-colors disabled:opacity-50"
        >
          <Trash2 className="h-3 w-3" />
          Remove key
        </button>
      ) : (
        <div className="mt-3 flex items-center gap-2">
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="Paste your Google API key…"
            className="flex-1 text-sm px-3 py-2 rounded-md border bg-background focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <button
            onClick={save}
            disabled={busy || !key.trim()}
            className="inline-flex items-center gap-1.5 text-sm px-3 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      )}

      {saved && !error && (
        <p className="mt-2 text-xs text-green-600 dark:text-green-400">
          Key saved.
        </p>
      )}
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}
