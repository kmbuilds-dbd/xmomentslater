"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { createClient } from "@/lib/supabase/client";
import {
  Tag,
  Archive,
  Clock,
  Search,
  Settings,
  Sun,
  Moon,
  Monitor,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";

interface TopLabel {
  tag: string;
  count: number;
}

interface ReaderSidebarProps {
  userEmail: string;
  topLabels: TopLabel[];
}

export function ReaderSidebar({ userEmail, topLabels }: ReaderSidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();
  const { theme, setTheme } = useTheme();
  const [collapsed, setCollapsed] = useState(false);
  const [query, setQuery] = useState("");

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const cycleTheme = () => {
    const order = ["system", "light", "dark"] as const;
    const idx = order.indexOf(theme as (typeof order)[number]);
    setTheme(order[(idx + 1) % order.length]);
  };
  const ThemeIcon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    router.push(`/dashboard/reader?q=${encodeURIComponent(query)}`);
  };

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="sticky top-0 h-screen w-12 flex justify-center pt-4 border-r border-border text-muted-foreground hover:text-foreground"
        aria-label="Expand sidebar"
      >
        <PanelLeftOpen className="h-4 w-4" />
      </button>
    );
  }

  const navLink = (active: boolean) =>
    `flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors ${
      active
        ? "bg-secondary text-foreground"
        : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
    }`;

  return (
    <aside className="sticky top-0 h-screen w-60 shrink-0 border-r border-border flex flex-col">
      {/* Profile + collapse */}
      <div className="flex items-center gap-2 px-3 pt-4 pb-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold">
          {userEmail.charAt(0).toUpperCase() || "U"}
        </div>
        <span className="flex-1 min-w-0 truncate text-sm font-medium">
          {userEmail || "Reader"}
        </span>
        <button
          onClick={() => setCollapsed(true)}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Collapse sidebar"
        >
          <PanelLeftClose className="h-4 w-4" />
        </button>
      </div>

      {/* Search */}
      <form onSubmit={submitSearch} className="px-3 pb-2">
        <div className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5 text-sm">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            className="w-full bg-transparent outline-none text-sm placeholder:text-muted-foreground"
          />
        </div>
      </form>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-4">
        <div>
          <p className="px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Curation
          </p>
          <div className="mt-1 space-y-0.5">
            <Link href="/dashboard/reader" className={navLink(pathname === "/dashboard/reader")}>
              <Search className="h-4 w-4" />
              Explore
            </Link>
            <Link
              href="/dashboard/reader/archive"
              className={navLink(pathname === "/dashboard/reader/archive")}
            >
              <Archive className="h-4 w-4" />
              Archive
            </Link>
            <Link href="/dashboard/reader?read=1" className={navLink(false)}>
              <Clock className="h-4 w-4" />
              History
            </Link>
          </div>
        </div>

        {topLabels.length > 0 && (
          <div>
            <p className="px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Labels
            </p>
            <div className="mt-1 space-y-0.5">
              {topLabels.map(({ tag, count }) => (
                <Link
                  key={tag}
                  href={`/dashboard/reader?tag=${encodeURIComponent(tag)}`}
                  className={navLink(false)}
                >
                  <Tag className="h-4 w-4" />
                  <span className="flex-1 truncate">{tag}</span>
                  <span className="text-xs text-muted-foreground">{count}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </nav>

      {/* Footer */}
      <div className="border-t border-border p-2 flex items-center gap-1">
        <Link href="/dashboard/settings" className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 flex-1">
          <Settings className="h-4 w-4" />
          Settings
        </Link>
        <button
          onClick={cycleTheme}
          className="rounded-md p-2 text-muted-foreground hover:text-foreground"
          aria-label="Toggle theme"
        >
          <ThemeIcon className="h-4 w-4" />
        </button>
        <button
          onClick={handleSignOut}
          className="rounded-md p-2 text-muted-foreground hover:text-foreground"
          aria-label="Sign out"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </aside>
  );
}
