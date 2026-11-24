"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

const MAX_PAGES = 20;

export function ImportBookmarksButton({ hasXConnection }: { hasXConnection: boolean }) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);

  const sync = async () => {
    if (!hasXConnection) {
      toast.error("Connect your X account in Settings first.");
      return;
    }
    setSyncing(true);

    let token: string | undefined;
    let synced = 0;
    let skipped = 0;
    let page = 0;
    let capped = false;

    try {
      do {
        page++;
        const res = await fetch("/api/x/sync-bookmarks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paginationToken: token }),
        });
        const data = await res.json();
        if (!res.ok) {
          toast.error(data.error ?? "Sync failed");
          return;
        }
        synced += data.synced ?? 0;
        skipped += data.skipped ?? 0;
        if (data.hasMore && data.nextPaginationToken) {
          if (page >= MAX_PAGES) {
            capped = true;
            break;
          }
          token = data.nextPaginationToken;
        } else {
          token = undefined;
        }
      } while (token);

      if (synced > 0) {
        toast.success(
          `Imported ${synced} bookmark${synced === 1 ? "" : "s"}${
            skipped > 0 ? ` · ${skipped} already saved` : ""
          }${capped ? " · more remain" : ""}`
        );
      } else {
        toast.success("You're all caught up — no new bookmarks.");
      }
      router.refresh();
    } catch {
      toast.error("Network error — try again.");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <button
      onClick={sync}
      disabled={syncing}
      title="Import new bookmarks"
      aria-label="Import new bookmarks"
      className="rounded-full p-2 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
    >
      <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
    </button>
  );
}
