import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { ReaderBody } from "@/components/ReaderBody";
import { mapSavedPostToReaderPost } from "@/lib/reader";
import type { SavedPostRow } from "@/lib/saved-posts";

export const dynamic = "force-dynamic";

const COLS =
  "id, author_name, author_handle, posted_at, saved_at, read_at, tags, x_post_url, parsed_content, raw_api_response, summary, title, source, category";

interface PageProps {
  params: Promise<{ postId: string }>;
}

export default async function ReaderPage({ params }: PageProps) {
  const { postId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: post } = await supabase
    .from("saved_posts")
    .select(COLS)
    .eq("id", postId)
    .single();

  if (!post) notFound();

  // Auto-mark as read on view.
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

  const readerPost = mapSavedPostToReaderPost(post as SavedPostRow);

  return (
    <main className="mx-auto max-w-2xl px-7 py-8">
      <Link
        href="/dashboard/reader"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Explore
      </Link>
      <ReaderBody post={readerPost} />
    </main>
  );
}
