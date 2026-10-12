"use client";

import { useState } from "react";

const payload = `{
  "text": "<<<{{Text}}>>>",
  "author": "<<<{{UserName}}>>>",
  "url": "<<<{{LinkToTweet}}>>>",
  "created_at": "<<<{{CreatedAt}}>>>"
}`;

export function IFTTTCard({ ingestUrl, token }: { ingestUrl: string; token: string }) {
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const copy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setError(false);
    } catch {
      setError(true);
    }
  };
  return (
    <div className="rounded-lg border px-5 py-4 space-y-3">
      <p className="text-sm">Save posts you like through IFTTT, without connecting an X developer account.</p>
      <ol className="list-decimal pl-5 space-y-2 text-xs text-muted-foreground">
        <li>In IFTTT, choose X (Twitter) → <strong>New liked tweet by you</strong>.</li>
        <li>Choose Webhooks → <strong>Make a web request</strong>. Set method to POST and content type to application/json.</li>
        <li>Paste the URL, Authorization header and body below. Keep the escape markers around each ingredient.</li>
      </ol>
      {([
        ["URL", ingestUrl],
        ["Header", `Authorization: Bearer ${token}`],
        ["Body", payload],
      ] as const).map(([label, value]) => (
        <div key={label} className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">{label}{label === "Header" ? " (Additional Headers)" : ""}</span>
            <button type="button" className="text-xs text-primary" onClick={() => copy(label, value)}>{copied === label ? "Copied" : `Copy ${label.toLowerCase()}`}</button>
          </div>
          {label === "Header" ? <p className="text-xs text-muted-foreground">Your private token is included when you copy. Keep it secret: it also grants access to your RSS feed and save API.</p> : <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto">{value}</pre>}
        </div>
      ))}
      {error && <p role="alert" className="text-xs text-destructive">Could not copy. Check browser clipboard permissions.</p>}
      <p className="text-xs text-muted-foreground">Requires IFTTT Pro or higher. Polling can take several minutes. Text may be shortened and images are not included. Test a new like and check your library before cancelling your X developer subscription.</p>
      <a href="https://ifttt.com/twitter/triggers/new_favorite_tweet" target="_blank" rel="noopener noreferrer" className="inline-block text-xs text-primary">Open IFTTT trigger</a>
    </div>
  );
}
