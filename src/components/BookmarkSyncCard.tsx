"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatTimeAgo } from "@/lib/utils";

interface BookmarkSyncCardProps {
  lastSyncedAt: string | null;
}

type Status = "idle" | "syncing" | "done" | "error";

export function BookmarkSyncCard({ lastSyncedAt }: BookmarkSyncCardProps) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [syncedAt, setSyncedAt] = useState(lastSyncedAt);

  const handleSync = async () => {
    setStatus("syncing");
    setMessage(null);
    try {
      const res = await fetch("/api/x/sync-bookmarks", { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        setMessage(data.error ?? "Failed to sync bookmarks");
        setStatus("error");
        return;
      }

      setSyncedAt(new Date().toISOString());
      setMessage(
        data.synced > 0
          ? `Pulled ${data.synced} new bookmark${data.synced === 1 ? "" : "s"}.${
              data.pagesCapped ? " More remain — sync again to keep going." : ""
            }`
          : "You're all caught up — no new bookmarks."
      );
      setStatus("done");
      router.refresh();
    } catch {
      setMessage("Network error. Please try again.");
      setStatus("error");
    }
  };

  return (
    <div className="rounded-lg border px-5 py-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Bookmark sync</p>
          <p className="text-xs text-muted-foreground">
            {syncedAt ? `Last synced ${formatTimeAgo(syncedAt)}` : "Never synced"}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleSync}
          disabled={status === "syncing"}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${status === "syncing" ? "animate-spin" : ""}`} />
          {status === "syncing" ? "Syncing..." : "Sync now"}
        </Button>
      </div>
      {message && (
        <p className={`text-xs mt-2.5 ${status === "error" ? "text-destructive" : "text-muted-foreground"}`}>
          {message}
        </p>
      )}
    </div>
  );
}
