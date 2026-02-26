import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { XConnectionCard } from "@/components/XConnectionCard";
import { FeedUrlCard } from "@/components/FeedUrlCard";
import { BookmarkletButton } from "@/components/BookmarkletButton";
import { SavedPostCard } from "@/components/SavedPostCard";
import { getBookmarkletCode } from "@/lib/bookmarklet";

export const dynamic = "force-dynamic";

interface ParsedContent {
  blocks?: { type: string; content: string }[];
}

function getPreview(parsed: ParsedContent | null): string {
  if (!parsed?.blocks) return "";
  const textBlock = parsed.blocks.find((b) => b.type === "text");
  return textBlock?.content?.slice(0, 200) ?? "";
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Fetch X connection (RLS ensures only own row)
  const { data: xConnection } = await supabase
    .from("x_connections")
    .select("x_handle")
    .single();

  // Fetch saved posts (newest first)
  const { data: savedPosts } = await supabase
    .from("saved_posts")
    .select("id, author_name, author_handle, posted_at, saved_at, read_at, tags, x_post_url, parsed_content")
    .order("saved_at", { ascending: false })
    .limit(50);

  // Fetch or create feed token
  let feedToken: string | null = null;
  if (user) {
    try {
      const { data: existing } = await supabase
        .from("feed_tokens")
        .select("token")
        .single();

      if (existing) {
        feedToken = existing.token;
      } else if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
        const admin = createAdminClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY
        );
        const { data: created } = await admin
          .from("feed_tokens")
          .insert({ user_id: user.id })
          .select("token")
          .single();
        feedToken = created?.token ?? null;
      }
    } catch (err) {
      console.error("Feed token error:", err);
    }
  }

  const posts = savedPosts ?? [];

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="font-[family-name:var(--font-fraunces)] text-3xl font-semibold tracking-tight mb-2">
        Your Library
      </h1>
      <p className="text-muted-foreground mb-8">
        {user?.email ? `Signed in as ${user.email}` : "Welcome"}
      </p>

      <div className="mb-12">
        <XConnectionCard xHandle={xConnection?.x_handle ?? null} />
      </div>

      {xConnection && (
        <div className="mb-8 rounded-lg border px-5 py-4">
          <p className="text-sm font-medium mb-1">Install Bookmarklet</p>
          <p className="text-xs text-muted-foreground mb-3">
            Drag this button to your bookmarks bar. Click it on any X post to save it.
          </p>
          <BookmarkletButton bookmarkletCode={getBookmarkletCode(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001")} />
        </div>
      )}

      {feedToken && (
        <FeedUrlCard
          feedUrl={`${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001"}/api/feed/${feedToken}`}
        />
      )}

      {/* Saved posts */}
      {posts.length > 0 ? (
        <div className="space-y-3">
          <p className="text-sm font-medium text-muted-foreground">
            {posts.length} saved post{posts.length !== 1 ? "s" : ""}
          </p>
          {posts.map((post) => (
            <SavedPostCard
              key={post.id}
              id={post.id}
              authorName={post.author_name}
              authorHandle={post.author_handle}
              postedAt={post.posted_at}
              savedAt={post.saved_at}
              readAt={post.read_at}
              tags={post.tags ?? []}
              xPostUrl={post.x_post_url}
              preview={getPreview(post.parsed_content as ParsedContent | null)}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed py-16 px-8 text-center">
          <p className="font-[family-name:var(--font-fraunces)] text-lg text-muted-foreground mb-2">
            No saved posts yet
          </p>
          <p className="text-sm text-muted-foreground">
            {xConnection
              ? "Use the bookmarklet to save posts from X."
              : "Connect your X account above to get started."}
          </p>
        </div>
      )}
    </main>
  );
}
