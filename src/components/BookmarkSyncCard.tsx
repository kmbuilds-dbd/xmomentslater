"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatTimeAgo } from "@/lib/utils";

interface BookmarkSyncCardProps {
  lastSyncedAt: string | null;
}

type Status = "idle" | "syncing" | "done" | "error";

// Safety bound on how many pages (of up to 100 bookmarks each) a single
// click will pull, so one sync can't run away against X's rate limit.
const MAX_PAGES_PER_SYNC = 20;

interface SyncPageResponse {
  success?: boolean;
  synced?: number;
  skipped?: number;
  hasMore?: boolean;
  nextPaginationToken?: string;
  error?: string;
}

export function BookmarkSyncCard({ lastSyncedAt }: BookmarkSyncCardProps) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ page: number; synced: number } | null>(null);
  const [syncedAt, setSyncedAt] = useState(lastSyncedAt);
  const cancelRef = useRef(false);

  const handleSync = async () => {
    cancelRef.current = false;
    setStatus("syncing");
    setMessage(null);

    let paginationToken: string | undefined;
    let totalSynced = 0;
    let totalSkipped = 0;
    let page = 0;
    let cappedByPageLimit = false;

    try {
      do {
        page++;
        setProgress({ page, synced: totalSynced });

        const res = await fetch("/api/x/sync-bookmarks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paginationToken }),
        });
        const data = (await res.json()) as SyncPageResponse;

        if (!res.ok) {
          setMessage(data.error ?? "Failed to sync bookmarks");
          setStatus("error");
          return;
        }

        totalSynced += data.synced ?? 0;
        totalSkipped += data.skipped ?? 0;
        setSyncedAt(new Date().toISOString());
        setProgress({ page, synced: totalSynced });

        if (cancelRef.current) break;

        if (data.hasMore && data.nextPaginationToken) {
          if (page >= MAX_PAGES_PER_SYNC) {
            cappedByPageLimit = true;
            break;
          }
          paginationToken = data.nextPaginationToken;
        } else {
          paginationToken = undefined;
        }
      } while (paginationToken);

      const stoppedEarly = cancelRef.current;
      setMessage(
        stoppedEarly
          ? `Stopped early — pulled ${totalSynced} new bookmark${totalSynced === 1 ? "" : "s"}.`
          : totalSynced > 0
            ? `Pulled ${totalSynced} new bookmark${totalSynced === 1 ? "" : "s"}${
                totalSkipped > 0 ? ` (${totalSkipped} already saved)` : ""
              }.${cappedByPageLimit ? " More remain — sync again to keep going." : ""}`
            : "You're all caught up — no new bookmarks."
      );
      setStatus("done");
      router.refresh();
    } catch {
      setMessage(`Network error after ${totalSynced} synced. Please try again.`);
      setStatus("error");
    } finally {
      setProgress(null);
    }
  };

  const handleCancel = () => {
    cancelRef.current = true;
  };

  return (
    <div className="rounded-lg border px-5 py-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Bookmark sync</p>
          <p className="text-xs text-muted-foreground">
            {status === "syncing" && progress
              ? `Syncing... page ${progress.page}, ${progress.synced} new so far`
              : syncedAt
                ? `Last synced ${formatTimeAgo(syncedAt)}`
                : "Never synced"}
          </p>
        </div>
        {status === "syncing" ? (
          <Button variant="ghost" size="sm" onClick={handleCancel}>
            Cancel
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={handleSync}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Sync now
          </Button>
        )}
      </div>
      {status === "syncing" && (
        <div className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-secondary">
          <div className="h-full w-full animate-pulse rounded-full bg-primary" />
        </div>
      )}
      {message && (
        <p className={`text-xs mt-2.5 ${status === "error" ? "text-destructive" : "text-muted-foreground"}`}>
          {message}
        </p>
      )}
    </div>
  );
}
