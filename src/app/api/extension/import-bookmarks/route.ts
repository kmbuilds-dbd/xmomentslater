import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import {
  processBookmarkPage,
  type SyncConnection,
} from "@/lib/x-api/sync-bookmarks";
import type { BookmarksResponse } from "@/lib/x-api/fetch-bookmarks";

export const maxDuration = 300;

// POST — import bookmarks fetched by the browser extension (cookie session),
// already normalized to the X API v2 shape by the extension.
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
  if (!Array.isArray(tweets) || tweets.length === 0) {
    return NextResponse.json({ error: "No bookmarks provided" }, { status: 400 });
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey
  );

  const page: BookmarksResponse = {
    data: tweets,
    includes: body.includes,
  };

  try {
    const { synced, skipped } = await processBookmarkPage(
      page,
      { user_id: user.id } as SyncConnection,
      admin
    );
    return NextResponse.json({ success: true, imported: synced, skipped });
  } catch (err) {
    console.error("Extension bookmark import failed:", err);
    return NextResponse.json(
      { error: "Failed to import bookmarks" },
      { status: 500 }
    );
  }
}
