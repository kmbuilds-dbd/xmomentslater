import Link from "next/link";
import { Zap, Play, Wrench, Sparkles } from "lucide-react";
import type { SmartSection } from "@/lib/reader";

const ICONS = {
  "quick-pass": Zap,
  videos: Play,
  "to-try": Wrench,
} as const;

export function SmartSections({ sections }: { sections: SmartSection[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {sections.map((section) => {
        const Icon = ICONS[section.id];
        const first = section.posts[0];
        return (
          <div
            key={section.id}
            className="flex flex-col rounded-xl border border-border bg-card p-4"
          >
            <div className="flex items-center gap-2">
              <Icon className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold">{section.title}</p>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">{section.blurb}</p>

            <div className="mt-3 space-y-1.5">
              {section.posts.slice(0, 2).map((p) => (
                <p key={p.id} className="truncate text-xs text-muted-foreground">
                  <span className="text-foreground/80">@{p.authorHandle ?? "unknown"}</span>{" "}
                  {p.preview}
                </p>
              ))}
              {section.posts.length === 0 && (
                <p className="text-xs text-muted-foreground">Nothing here yet.</p>
              )}
            </div>

            <div className="mt-3 flex items-center gap-2 pt-1">
              {first ? (
                <Link
                  href={`/dashboard/reader/${first.id}`}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-secondary transition-colors"
                >
                  <Icon className="h-3.5 w-3.5" />
                  {section.actionLabel}
                </Link>
              ) : null}
              <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Sparkles className="h-3 w-3" />
                {section.posts.length} in all
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
