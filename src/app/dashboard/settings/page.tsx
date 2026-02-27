import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { XConnectionCard } from "@/components/XConnectionCard";
import { FeedUrlCard } from "@/components/FeedUrlCard";
import { BookmarkletButton } from "@/components/BookmarkletButton";
import { IOSShortcutCard } from "@/components/IOSShortcutCard";
import { getBookmarkletCode } from "@/lib/bookmarklet";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Fetch X connection
  const { data: xConnection } = await supabase
    .from("x_connections")
    .select("x_handle")
    .single();

  // Fetch or create feed token
  let feedToken: string | null = null;
  if (user) {
    try {
      const { data: existing } = await supabase
        .from("feed_tokens")
        .select("token")
        .single();

      if (existing) {
        feedToken = existing.token;
      } else if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
        const admin = createAdminClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY
        );
        const { data: created } = await admin
          .from("feed_tokens")
          .insert({ user_id: user.id })
          .select("token")
          .single();
        feedToken = created?.token ?? null;
      }
    } catch (err) {
      console.error("Feed token error:", err);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="font-[family-name:var(--font-fraunces)] text-3xl font-semibold tracking-tight mb-2">
        Settings
      </h1>
      <p className="text-muted-foreground mb-8">
        {user?.email ? `Signed in as ${user.email}` : "Welcome"}
      </p>

      {/* X Connection */}
      <section className="mb-8">
        <h2 className="text-sm font-medium mb-3">X Account</h2>
        <XConnectionCard xHandle={xConnection?.x_handle ?? null} />
      </section>

      {/* Bookmarklet */}
      {xConnection && (
        <section className="mb-8">
          <h2 className="text-sm font-medium mb-3">Bookmarklet</h2>
          <div className="rounded-lg border px-5 py-4">
            <p className="text-xs text-muted-foreground mb-3">
              Drag this button to your bookmarks bar. Click it on any X post to save it.
            </p>
            <BookmarkletButton bookmarkletCode={getBookmarkletCode(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001")} />
          </div>
        </section>
      )}

      {/* iOS Shortcut */}
      {xConnection && feedToken && (
        <section className="mb-8">
          <h2 className="text-sm font-medium mb-3">Save from iOS</h2>
          <IOSShortcutCard
            saveUrl={`${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001"}/save?token=${feedToken}&url=`}
          />
        </section>
      )}

      {/* RSS Feed */}
      {feedToken && (
        <section className="mb-8">
          <h2 className="text-sm font-medium mb-3">RSS Feed</h2>
          <FeedUrlCard
            feedUrl={`${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001"}/api/feed/${feedToken}`}
          />
        </section>
      )}
    </main>
  );
}
