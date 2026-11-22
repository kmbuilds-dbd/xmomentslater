"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

/** Re-fetches a post from X and re-parses it (picks up inline-image / quote fixes on old saves). */
export function RefreshButton({ postId }: { postId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/posts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: postId }),
      });
      const data = await res.json();
      if (res.ok) router.refresh();
      else setError(data.error || "Failed to refresh");
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <span className="inline-flex items-center gap-2">
      <button
        onClick={refresh}
        disabled={loading}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        {loading ? "Refreshing…" : "Refresh"}
      </button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </span>
  );
}
