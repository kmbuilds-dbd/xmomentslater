import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { syncUserBookmarksPage, type SyncConnection } from "@/lib/x-api/sync-bookmarks";

// A page can be up to 100 brand-new bookmarks, each needing a sequential
// LLM summary + embedding call — generous headroom for that worst case.
export const maxDuration = 300;

// POST — pull one page (up to 100) of bookmarks saved on X since the last
// sync. The caller (BookmarkSyncCard) drives the pagination loop itself so
// it can show progress between pages instead of blocking on the whole sync.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const paginationToken =
    typeof body.paginationToken === "string" ? body.paginationToken : undefined;

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey
  );

  const { data: connection, error: connError } = await admin
    .from("x_connections")
    .select("user_id, access_token, refresh_token, x_user_id, last_bookmark_sync_at")
    .eq("user_id", user.id)
    .single();

  if (connError || !connection) {
    return NextResponse.json({ error: "X account not connected" }, { status: 400 });
  }

  try {
    const result = await syncUserBookmarksPage(
      connection as SyncConnection,
      admin,
      paginationToken
    );
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error("Bookmark sync page failed:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    const expired = message.includes("Token refresh failed");
    return NextResponse.json(
      {
        error: expired
          ? "X session expired. Please reconnect your X account in Settings."
          : "Failed to sync bookmarks from X.",
      },
      { status: expired ? 401 : 502 }
    );
  }
}
