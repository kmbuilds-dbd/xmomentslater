import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ExplorePostCard } from "@/components/ExplorePostCard";
import { mapSavedPostToReaderPost } from "@/lib/reader";
import type { SavedPostRow } from "@/lib/saved-posts";

export const dynamic = "force-dynamic";

const COLS =
  "id, author_name, author_handle, posted_at, saved_at, read_at, tags, x_post_url, parsed_content, raw_api_response, summary, title, source, category";

export default async function ArchivePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("saved_posts")
    .select(COLS)
    .not("archived_at", "is", null)
    .order("archived_at", { ascending: false });

  const posts = (data ?? []).map((p) =>
    mapSavedPostToReaderPost(p as SavedPostRow)
  );

  return (
    <main className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="text-2xl font-bold tracking-tight">Archive</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Posts you archived after reading.
      </p>

      <section className="mt-6 space-y-3">
        {posts.length > 0 ? (
          posts.map((p) => <ExplorePostCard key={p.id} post={p} archived />)
        ) : (
          <div className="rounded-xl border border-dashed px-8 py-16 text-center">
            <p className="text-lg text-muted-foreground">Nothing archived yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Archive a post from Explore and it&apos;ll move here.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
