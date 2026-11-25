"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { ReaderSidebar } from "@/components/ReaderSidebar";

interface ReaderShellProps {
  userEmail: string;
  topLabels: { tag: string; count: number }[];
  children: React.ReactNode;
}

export function ReaderShell({ userEmail, topLabels, children }: ReaderShellProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-screen font-[family-name:var(--font-inter)]">
      {/* Desktop: static sidebar column */}
      <div className="hidden lg:block shrink-0">
        <ReaderSidebar userEmail={userEmail} topLabels={topLabels} />
      </div>

      {/* Mobile: floating menu button */}
      <button
        onClick={() => setOpen(true)}
        className="lg:hidden fixed left-3 top-3 z-40 flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background text-foreground shadow"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Mobile: sidebar as an overlay */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-y-0 left-0">
            <ReaderSidebar
              userEmail={userEmail}
              topLabels={topLabels}
              onNavigate={() => setOpen(false)}
            />
          </div>
        </div>
      )}

      <div className="flex-1 min-w-0 pt-14 lg:pt-0">{children}</div>
    </div>
  );
}
