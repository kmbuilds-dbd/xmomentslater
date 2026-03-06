import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

export async function GET(request: NextRequest) {
  let userId: string;

  const authHeader = request.headers.get("Authorization");

  if (authHeader?.startsWith("Bearer ")) {
    // Token-based auth (iOS Shortcuts, public /save page)
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }
    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceRoleKey
    );
    const token = authHeader.slice(7);
    const { data: feedToken } = await admin
      .from("feed_tokens")
      .select("user_id")
      .eq("token", token)
      .single();

    if (!feedToken) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }
    userId = feedToken.user_id;

    // Fetch tags using admin client
    const { data, error } = await admin
      .from("saved_posts")
      .select("tags")
      .eq("user_id", userId);

    if (error) {
      return NextResponse.json({ error: "Failed to fetch tags" }, { status: 500 });
    }

    const tagSet = new Set<string>();
    for (const row of data ?? []) {
      for (const tag of row.tags ?? []) {
        tagSet.add(tag);
      }
    }

    return NextResponse.json({ tags: [...tagSet].sort() });
  } else {
    // Session-based auth (bookmarklet, web app)
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    userId = user.id;

    const { data, error } = await supabase
      .from("saved_posts")
      .select("tags")
      .eq("user_id", userId);

    if (error) {
      return NextResponse.json({ error: "Failed to fetch tags" }, { status: 500 });
    }

    const tagSet = new Set<string>();
    for (const row of data ?? []) {
      for (const tag of row.tags ?? []) {
        tagSet.add(tag);
      }
    }

    return NextResponse.json({ tags: [...tagSet].sort() });
  }
}
