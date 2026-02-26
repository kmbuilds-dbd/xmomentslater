"use client";

import { useRef, useEffect } from "react";

export function BookmarkletButton({ bookmarkletCode }: { bookmarkletCode: string }) {
  const ref = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    // Set href via DOM directly — React 19 blocks javascript: URLs in JSX
    if (ref.current) {
      ref.current.setAttribute("href", bookmarkletCode);
    }
  }, [bookmarkletCode]);

  return (
    <a
      ref={ref}
      href="#"
      className="inline-block text-xs font-medium px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
      onClick={(e) => e.preventDefault()}
    >
      Save to xMomentsLater
    </a>
  );
}
