"use client";

export function BookmarkletButton({ bookmarkletCode }: { bookmarkletCode: string }) {
  return (
    <a
      href={bookmarkletCode}
      className="inline-block text-xs font-medium px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
      onClick={(e) => e.preventDefault()}
    >
      Save to xMomentsLater
    </a>
  );
}
