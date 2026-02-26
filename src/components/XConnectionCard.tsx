"use client";

import { Button } from "@/components/ui/button";
import { ExternalLink, Unlink } from "lucide-react";

interface XConnectionCardProps {
  xHandle: string | null;
}

export function XConnectionCard({ xHandle }: XConnectionCardProps) {
  const handleDisconnect = async () => {
    const form = document.createElement("form");
    form.method = "POST";
    form.action = "/api/x/disconnect";
    document.body.appendChild(form);
    form.submit();
  };

  if (xHandle) {
    return (
      <div className="flex items-center justify-between rounded-lg border px-5 py-4">
        <div>
          <p className="text-sm font-medium">X Account Connected</p>
          <p className="text-sm text-muted-foreground">@{xHandle}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={handleDisconnect}>
          <Unlink className="h-4 w-4 mr-2" />
          Disconnect
        </Button>
      </div>
    );
  }

  return (
    <a
      href="/api/x/connect"
      className="flex items-center justify-between rounded-lg border border-dashed px-5 py-4 hover:border-primary/50 transition-colors"
    >
      <div>
        <p className="text-sm font-medium">Connect your X account</p>
        <p className="text-sm text-muted-foreground">
          Required to save and read posts
        </p>
      </div>
      <ExternalLink className="h-4 w-4 text-muted-foreground" />
    </a>
  );
}
