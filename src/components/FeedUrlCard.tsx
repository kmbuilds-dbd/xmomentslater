"use client";

import { useState } from "react";
import { Copy, Check, Rss } from "lucide-react";

export function FeedUrlCard({ feedUrl }: { feedUrl: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(feedUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mb-8 rounded-lg border px-5 py-4">
      <div className="flex items-center gap-2 mb-1">
        <Rss className="h-4 w-4 text-muted-foreground" />
        <p className="text-sm font-medium">RSS Feed</p>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Add this URL to your RSS reader to follow your saved posts.
      </p>
      <div className="flex items-center gap-2">
        <code className="flex-1 text-xs bg-muted px-3 py-2 rounded-md truncate">
          {feedUrl}
        </code>
        <button
          onClick={handleCopy}
          className="shrink-0 text-muted-foreground hover:text-foreground p-2"
        >
          {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
