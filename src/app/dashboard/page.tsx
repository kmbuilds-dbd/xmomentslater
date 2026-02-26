import { createClient } from "@/lib/supabase/server";
import { SavedPostCard } from "@/components/SavedPostCard";

export const dynamic = "force-dynamic";

interface ParsedContent {
  blocks?: { type: string; content: string }[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getPreview(parsed: ParsedContent | null, raw?: any): string {
  // Try parsed blocks first
  if (parsed?.blocks) {
    const textBlock = parsed.blocks.find((b) => b.type === "text");
    if (textBlock?.content) return textBlock.content.slice(0, 200);
  }
  // Fallback: extract text directly from raw API response
  if (raw?.data) {
    const text = raw.data.note_tweet?.text ?? raw.data.text;
    if (text) return text.slice(0, 200);
  }
  return "";
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Fetch saved posts (newest first)
  const { data: savedPosts } = await supabase
    .from("saved_posts")
    .select("id, author_name, author_handle, posted_at, saved_at, read_at, tags, x_post_url, parsed_content, raw_api_response")
    .order("saved_at", { ascending: false })
    .limit(50);

  // Check if X is connected (for empty state message)
  const { data: xConnection } = await supabase
    .from("x_connections")
    .select("x_handle")
    .single();

  const posts = savedPosts ?? [];

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="font-[family-name:var(--font-fraunces)] text-3xl font-semibold tracking-tight mb-2">
        Your Library
      </h1>
      <p className="text-muted-foreground mb-8">
        {user?.email ? `Signed in as ${user.email}` : "Welcome"}
      </p>

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
              preview={getPreview(post.parsed_content as ParsedContent | null, post.raw_api_response)}
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
              : "Connect your X account in Settings to get started."}
          </p>
        </div>
      )}
    </main>
  );
}
