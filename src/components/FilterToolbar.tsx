"use client";

import { useState } from "react";
import { Check, ChevronDown, ArrowLeft } from "lucide-react";

const TYPE_OPTIONS = [
  { value: "article", label: "Article" },
  { value: "video", label: "Video" },
  { value: "image", label: "Image" },
  { value: "text", label: "Text" },
];

const DATE_OPTIONS = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
];

type Dimension = "type" | "date" | "year" | "author" | "label";

const DIMENSION_PARAM: Record<Dimension, string> = {
  type: "type",
  date: "date",
  year: "year",
  author: "author",
  label: "tag",
};

function formatValue(dim: Dimension, value: string): string {
  if (dim === "type") {
    return TYPE_OPTIONS.find((o) => o.value === value)?.label ?? value;
  }
  if (dim === "date") {
    return DATE_OPTIONS.find((o) => o.value === value)?.label ?? value;
  }
  if (dim === "author") return `@${value}`;
  if (dim === "label") return `#${value}`;
  return value;
}

interface FilterToolbarProps {
  type: string;
  date: string;
  year: string;
  author: string;
  tag: string;
  sort: string;
  order: string;
  authors: string[];
  labels: string[];
  years: string[];
  onChange: (patch: Record<string, string>) => void;
}

export function FilterToolbar({
  type,
  date,
  year,
  author,
  tag,
  sort,
  order,
  authors,
  labels,
  years,
  onChange,
}: FilterToolbarProps) {
  const [open, setOpen] = useState<"filter" | "sort" | null>(null);
  const [sub, setSub] = useState<Dimension | null>(null);

  const activeDim: Dimension | null = type
    ? "type"
    : date
      ? "date"
      : year
        ? "year"
        : author
          ? "author"
          : tag
            ? "label"
            : null;
  const activeValue = activeDim
    ? ({ type, date, year, author, label: tag } as Record<Dimension, string>)[activeDim]
    : null;

  const filterLabel = activeDim && activeValue
    ? formatValue(activeDim, activeValue)
    : "None";

  const sortLabel = sort === "posted" ? "Date Posted" : "Date Imported";

  const close = () => {
    setOpen(null);
    setSub(null);
  };

  const pick = (patch: Record<string, string>) => {
    onChange(patch);
    close();
  };

  const clearFilter = () =>
    pick({ type: "", date: "", year: "", author: "", tag: "" });

  const valueOptions = (dim: Dimension) => {
    if (dim === "type") return TYPE_OPTIONS;
    if (dim === "date") return DATE_OPTIONS;
    if (dim === "year") return years.map((y) => ({ value: y, label: y }));
    if (dim === "author") return authors.map((a) => ({ value: a, label: `@${a}` }));
    return labels.map((l) => ({ value: l, label: `#${l}` }));
  };

  const selectedValue = (dim: Dimension) =>
    ({ type, date, year, author, label: tag } as Record<Dimension, string>)[dim];

  const pill =
    "inline-flex items-center gap-2 rounded-full border border-border bg-popover px-4 py-2 text-sm text-foreground hover:bg-secondary/60 transition-colors";

  return (
    <div className="relative flex items-center gap-2">
      {/* Filter pill */}
      <button
        onClick={() => {
          setOpen(open === "filter" ? null : "filter");
          setSub(null);
        }}
        className={pill}
      >
        <span className={activeDim ? "" : "text-muted-foreground"}>Filter</span>
        <span className={activeDim ? "font-medium" : "text-muted-foreground"}>{filterLabel}</span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </button>

      {/* Sort pill */}
      <button
        onClick={() => {
          setOpen(open === "sort" ? null : "sort");
          setSub(null);
        }}
        className={pill}
      >
        <span className="text-muted-foreground">{sortLabel}</span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </button>

      {open && (
        <div className="fixed inset-0 z-40" onClick={close} aria-hidden />
      )}

      {/* Filter menu */}
      {open === "filter" && (
        <div className="absolute left-0 top-full z-50 mt-1 w-56 rounded-xl border border-border bg-popover py-1 shadow-lg">
          {sub === null ? (
            <>
              {(["none", "type", "date", "year", "author", "label"] as const).map((d) => {
                if (d === "none") {
                  return (
                    <button
                      key={d}
                      onClick={clearFilter}
                      className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-secondary/60"
                    >
                      None
                      {!activeDim && <Check className="h-4 w-4 text-primary" />}
                    </button>
                  );
                }
                const dim = d as Dimension;
                return (
                  <button
                    key={d}
                    onClick={() => setSub(dim)}
                    className="flex w-full items-center justify-between px-3 py-2 text-sm capitalize hover:bg-secondary/60"
                  >
                    {d}
                    {activeDim === dim && <Check className="h-4 w-4 text-primary" />}
                    <ChevronDown className="-rotate-90 h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                );
              })}
            </>
          ) : (
            <>
              <button
                onClick={() => setSub(null)}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:bg-secondary/60"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back
              </button>
              {valueOptions(sub).map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => pick({ [DIMENSION_PARAM[sub]]: opt.value })}
                  className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-secondary/60"
                >
                  <span className="truncate">{opt.label}</span>
                  {selectedValue(sub) === opt.value && (
                    <Check className="h-4 w-4 shrink-0 text-primary" />
                  )}
                </button>
              ))}
            </>
          )}
        </div>
      )}

      {/* Sort menu */}
      {open === "sort" && (
        <div className="absolute left-0 top-full z-50 mt-1 w-60 rounded-xl border border-border bg-popover py-1 shadow-lg">
          <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Sort by
          </p>
          {[
            { value: "imported", label: "Date Imported" },
            { value: "posted", label: "Date Posted" },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => pick({ sort: opt.value })}
              className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-secondary/60"
            >
              {opt.label}
              {sort === opt.value && <Check className="h-4 w-4 text-primary" />}
            </button>
          ))}
          <div className="my-1 border-t border-border" />
          <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Order by
          </p>
          {[
            { value: "desc", label: "Recent → Old" },
            { value: "asc", label: "Old → Recent" },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => pick({ order: opt.value })}
              className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-secondary/60"
            >
              {opt.label}
              {order === opt.value && <Check className="h-4 w-4 text-primary" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
