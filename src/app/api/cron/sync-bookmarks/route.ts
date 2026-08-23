import { NextResponse, type NextRequest } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { syncUserBookmarks, type SyncConnection, type SyncResult } from "@/lib/x-api/sync-bookmarks";

export const maxDuration = 300; // 5 min max for Vercel

const MIN_SYNC_INTERVAL_MS = 23 * 60 * 60 * 1000;
const MAX_PAGES_PER_SYNC = 2;

export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }

  const authHeader = request.headers.get("Authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey
  );

  const { data: connections, error: connError } = await admin
    .from("x_connections")
    .select("user_id, access_token, refresh_token, x_user_id, last_bookmark_sync_at");

  if (connError || !connections) {
    return NextResponse.json({ error: "Failed to fetch connections", details: connError }, { status: 500 });
  }

  const now = Date.now();
  const throttled: SyncResult[] = [];
  const eligible: SyncConnection[] = [];

  for (const conn of connections as SyncConnection[]) {
    const last = conn.last_bookmark_sync_at;
    if (last && now - new Date(last).getTime() < MIN_SYNC_INTERVAL_MS) {
      throttled.push({ userId: conn.user_id, status: "throttled" });
    } else {
      eligible.push(conn);
    }
  }

  // Each user owns their own X rate-limit bucket, so users can run in parallel.
  const synced = await Promise.all(
    eligible.map((conn) => syncUserBookmarks(conn, admin, { maxPages: MAX_PAGES_PER_SYNC }))
  );

  return NextResponse.json({ success: true, results: [...synced, ...throttled] });
}
