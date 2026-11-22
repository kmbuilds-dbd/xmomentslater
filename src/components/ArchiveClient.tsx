"use client";

import { useState } from "react";
import { ExplorePostCard } from "@/components/ExplorePostCard";
import { ReaderDrawer } from "@/components/ReaderDrawer";
import type { ReaderPost } from "@/lib/reader";

export function ArchiveClient({ posts }: { posts: ReaderPost[] }) {
  const [selected, setSelected] = useState<ReaderPost | null>(null);

  return (
    <>
      <section className="mt-6 space-y-3">
        {posts.length > 0 ? (
          posts.map((p) => <ExplorePostCard key={p.id} post={p} archived onOpen={setSelected} />)
        ) : (
          <div className="rounded-xl border border-dashed px-8 py-16 text-center">
            <p className="text-lg text-muted-foreground">Nothing archived yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Archive a post from Explore and it&apos;ll move here.
            </p>
          </div>
        )}
      </section>

      <ReaderDrawer post={selected} onClose={() => setSelected(null)} />
    </>
  );
}
