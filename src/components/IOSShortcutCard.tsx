"use client";

import { useState } from "react";
import { Copy, Check, Smartphone } from "lucide-react";

export function IOSShortcutCard({
  saveUrl,
}: {
  saveUrl: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(saveUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-lg border px-5 py-4">
      <div className="flex items-center gap-2 mb-1">
        <Smartphone className="h-4 w-4 text-muted-foreground" />
        <p className="text-sm font-medium">iOS Shortcut</p>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Save posts from the X app&apos;s share sheet on iPhone/iPad.
      </p>
      <ol className="text-xs text-muted-foreground space-y-2 mb-4 list-decimal list-inside">
        <li>
          Open the <strong>Shortcuts</strong> app on your iPhone
        </li>
        <li>
          Create a new shortcut and set it to accept{" "}
          <strong>URLs</strong> from the <strong>Share Sheet</strong>
        </li>
        <li>
          Add an <strong>Open URL</strong> action with this URL:
        </li>
      </ol>
      <div className="flex items-center gap-2 mb-3">
        <code className="flex-1 text-xs bg-muted px-3 py-2 rounded-md truncate">
          {saveUrl}
        </code>
        <button
          onClick={handleCopy}
          className="shrink-0 text-muted-foreground hover:text-foreground p-2"
        >
          {copied ? (
            <Check className="h-4 w-4 text-primary" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        Replace the end of the URL with the shared link:{" "}
        <code className="bg-muted px-1 py-0.5 rounded text-[11px]">
          ?url=[Shortcut Input]
        </code>
      </p>
    </div>
  );
}
