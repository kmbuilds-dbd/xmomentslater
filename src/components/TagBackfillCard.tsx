"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Tags } from "lucide-react";
import { Button } from "@/components/ui/button";

type Status = "idle" | "running" | "done" | "error";

interface BackfillResponse {
  success?: boolean;
  tagged?: number;
  alreadyTagged?: number;
  noText?: number;
  tooShort?: number;
  failed?: number;
  nextCursor?: string | null;
  error?: string;
}

export function TagBackfillCard() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ batch: number; tagged: number } | null>(null);
  const cancelRef = useRef(false);

  const handleRun = async () => {
    cancelRef.current = false;
    setStatus("running");
    setMessage(null);

    let cursor: string | undefined;
    let totalTagged = 0;
    let totalAlreadyTagged = 0;
    let totalNoText = 0;
    let totalTooShort = 0;
    let totalFailed = 0;
    let batch = 0;

    try {
      do {
        batch++;
        setProgress({ batch, tagged: totalTagged });

        const res = await fetch("/api/tags/backfill", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cursor, limit: 50 }),
        });
        const data = (await res.json()) as BackfillResponse;

        if (!res.ok) {
          setMessage(data.error ?? "Backfill failed");
          setStatus("error");
          return;
        }

        totalTagged += data.tagged ?? 0;
        totalAlreadyTagged += data.alreadyTagged ?? 0;
        totalNoText += data.noText ?? 0;
        totalTooShort += data.tooShort ?? 0;
        totalFailed += data.failed ?? 0;
        setProgress({ batch, tagged: totalTagged });

        cursor = cancelRef.current ? undefined : data.nextCursor ?? undefined;
      } while (cursor);

      const breakdown = [
        totalAlreadyTagged > 0 ? `${totalAlreadyTagged} already tagged` : null,
        totalNoText > 0 ? `${totalNoText} had no text` : null,
        totalTooShort > 0 ? `${totalTooShort} too short to tag` : null,
        totalFailed > 0 ? `${totalFailed} failed — check server logs` : null,
      ].filter(Boolean);

      setMessage(
        (cancelRef.current
          ? `Stopped early — tagged ${totalTagged} post${totalTagged === 1 ? "" : "s"}.`
          : `Done — tagged ${totalTagged} post${totalTagged === 1 ? "" : "s"}.`) +
          (breakdown.length ? ` (${breakdown.join(", ")})` : "")
      );
      setStatus("done");
      router.refresh();
    } catch {
      setMessage(`Network error after tagging ${totalTagged}. Please try again.`);
      setStatus("error");
    } finally {
      setProgress(null);
    }
  };

  return (
    <div className="rounded-lg border border-dashed px-5 py-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium flex items-center gap-1.5">
            <Tags className="h-3.5 w-3.5" />
            Backfill missing tags
          </p>
          <p className="text-xs text-muted-foreground">
            {status === "running" && progress
              ? `Running... batch ${progress.batch}, ${progress.tagged} tagged so far`
              : "Admin-only: assigns two topical tags to any post that's untagged."}
          </p>
        </div>
        {status === "running" ? (
          <Button variant="ghost" size="sm" onClick={() => (cancelRef.current = true)}>
            Cancel
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={handleRun}>
            Run backfill
          </Button>
        )}
      </div>
      {message && (
        <p className={`text-xs mt-2.5 ${status === "error" ? "text-destructive" : "text-muted-foreground"}`}>
          {message}
        </p>
      )}
    </div>
  );
}
