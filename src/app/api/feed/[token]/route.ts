import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { ParsedContent } from "@/lib/parser";

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function blocksToHtml(parsed: ParsedContent): string {
  return parsed.blocks
    .map((block) => {
      if (block.type === "text") {
        return `<p>${escapeXml(block.content)}</p>`;
      }
      if (block.type === "image") {
        return `<p><img src="${escapeXml(block.content)}" alt="" style="max-width:100%;" /></p>`;
      }
      return "";
    })
    .join("\n");
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  // Use admin client — RSS endpoint authenticates via token, not session
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Look up user by feed token
  const { data: feedToken, error: tokenError } = await admin
    .from("feed_tokens")
    .select("user_id")
    .eq("token", token)
    .single();

  if (tokenError || !feedToken) {
    return new NextResponse("Feed not found", { status: 404 });
  }

  // Fetch saved posts for this user
  const { data: posts, error: postsError } = await admin
    .from("saved_posts")
    .select("x_post_id, x_post_url, author_name, author_handle, posted_at, saved_at, parsed_content")
    .eq("user_id", feedToken.user_id)
    .order("saved_at", { ascending: false })
    .limit(50);

  if (postsError) {
    return new NextResponse("Internal error", { status: 500 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";
  const items = (posts ?? [])
    .map((post) => {
      const parsed = post.parsed_content as ParsedContent | null;
      const title = `@${post.author_handle ?? "unknown"}: ${(parsed?.blocks?.[0]?.content ?? "").slice(0, 80)}`;
      const description = parsed ? blocksToHtml(parsed) : escapeXml(post.x_post_url);

      return `    <item>
      <title>${escapeXml(title)}</title>
      <link>${escapeXml(post.x_post_url)}</link>
      <description><![CDATA[${description}]]></description>
      <pubDate>${new Date(post.posted_at ?? post.saved_at).toUTCString()}</pubDate>
      <guid isPermaLink="false">${escapeXml(post.x_post_id)}</guid>
    </item>`;
    })
    .join("\n");

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>xMomentsLater</title>
    <link>${escapeXml(appUrl)}</link>
    <description>Your saved X posts</description>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>`;

  return new NextResponse(rss, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
