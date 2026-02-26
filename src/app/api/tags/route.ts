import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch all tags arrays, then deduplicate client-side
  // (Supabase JS client doesn't support unnest directly)
  const { data, error } = await supabase
    .from("saved_posts")
    .select("tags")
    .eq("user_id", user.id);

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
