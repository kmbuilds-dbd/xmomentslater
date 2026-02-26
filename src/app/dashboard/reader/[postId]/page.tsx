import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { ReaderContent } from "@/components/ReaderContent";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ postId: string }>;
}

export default async function ReaderPage({ params }: PageProps) {
  const { postId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    notFound();
  }

  // Fetch the post (RLS ensures only own posts)
  const { data: post } = await supabase
    .from("saved_posts")
    .select(
      "id, author_name, author_handle, posted_at, saved_at, read_at, tags, x_post_url, parsed_content"
    )
    .eq("id", postId)
    .single();

  if (!post) {
    notFound();
  }

  // Auto-mark as read on view
  if (!post.read_at) {
    try {
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (serviceRoleKey) {
        const admin = createAdminClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          serviceRoleKey
        );
        await admin
          .from("saved_posts")
          .update({ read_at: new Date().toISOString() })
          .eq("id", postId)
          .eq("user_id", user.id);
      }
    } catch (err) {
      console.error("Auto-mark read error:", err);
    }
  }

  return (
    <ReaderContent
      postId={post.id}
      authorName={post.author_name}
      authorHandle={post.author_handle}
      postedAt={post.posted_at}
      savedAt={post.saved_at}
      tags={post.tags ?? []}
      xPostUrl={post.x_post_url}
      parsedContent={post.parsed_content}
    />
  );
}
