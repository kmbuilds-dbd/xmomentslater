import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

export const maxDuration = 300;

// POST — rewrite author name/handle for already-saved posts, from freshly
// fetched bookmark data. Only touches posts whose incoming author is known,
// so a broken/empty extraction never clobbers a good author.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const body = await request.json().catch(() => null);
  const tweets = body?.data;
  const includes = body?.includes;
  if (!Array.isArray(tweets) || tweets.length === 0) {
    return NextResponse.json({ error: "No tweets provided" }, { status: 400 });
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey
  );

  let updated = 0;
  let skipped = 0;

  for (const tweet of tweets) {
    const author = includes?.users?.find(
      (u: { id?: string }) => u.id === tweet.author_id
    );
    if (!author?.name) {
      skipped++;
      continue;
    }

    const { data, error } = await admin
      .from("saved_posts")
      .update({
        author_name: author.name,
        author_handle: author.username,
      })
      .eq("x_post_id", tweet.id)
      .eq("user_id", user.id)
      .select("id");

    if (error) {
      console.error("Fix author update failed:", error);
    } else if (data?.length) {
      updated++;
    } else {
      skipped++;
    }
  }

  return NextResponse.json({ success: true, updated, skipped });
}
