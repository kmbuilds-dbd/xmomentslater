import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { syncUserBookmarks, type SyncConnection } from "@/lib/x-api/sync-bookmarks";

export const maxDuration = 300;

// User-triggered, so we don't apply the cron's 23h throttle — but still cap
// pages per click so one request can't run indefinitely against X's rate
// limit. Each page is up to 100 bookmarks, so this covers up to ~2000 in a
// single sync; anyone with more can just click again.
const MAX_PAGES_PER_MANUAL_SYNC = 20;

// POST — pull any bookmarks saved on X since the last sync, right now.
export async function POST() {
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

  const result = await syncUserBookmarks(connection as SyncConnection, admin, {
    maxPages: MAX_PAGES_PER_MANUAL_SYNC,
  });

  if (result.status === "failed") {
    const expired = result.error.includes("Token refresh failed");
    return NextResponse.json(
      {
        error: expired
          ? "X session expired. Please reconnect your X account in Settings."
          : "Failed to sync bookmarks from X.",
      },
      { status: expired ? 401 : 502 }
    );
  }

  if (result.status === "throttled") {
    // Never actually produced here — "throttled" only comes from the cron's
    // own pre-check, which this route doesn't run — but narrow for TS.
    return NextResponse.json({ success: true, synced: 0, skipped: 0, pagesCapped: false });
  }

  return NextResponse.json({
    success: true,
    synced: result.synced,
    skipped: result.skipped,
    pagesCapped: result.pagesCapped,
  });
}
