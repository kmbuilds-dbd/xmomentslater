import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { IftttPayloadError, parseIftttPayload, readIftttBody } from "@/lib/ifttt";
import { enrichPost } from "@/lib/enrich-post";
import { indexSavedPostVector } from "@/lib/vector-search";
export async function POST(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  const match = authorization?.match(/^Bearer ([^\s]+)$/i);
  if (!match || match[1].length > 512)
    return NextResponse.json({ error: "Bearer token required" }, { status: 401 });
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!serviceKey || !supabaseUrl)
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  try {
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: token, error: authError } = await admin.from("feed_tokens").select("user_id").eq("token", match[1]).maybeSingle();
    if (authError)
      return NextResponse.json({ error: "Unable to authenticate" }, { status: 500 });
    if (!token)
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json")
      return NextResponse.json({ error: "Content-Type must be application/json" }, { status: 415 });
    const post = parseIftttPayload(await readIftttBody(request));
    const { data: existing, error: lookupError } = await admin.from("saved_posts").select("id").eq("user_id", token.user_id).eq("x_post_id", post.postId).maybeSingle();
    if (lookupError)
      return NextResponse.json({ error: "Unable to check existing posts" }, { status: 500 });
    if (existing)
      return NextResponse.json({ success: true, duplicate: true, postId: existing.id });
    const { data: saved, error } = await admin.from("saved_posts").insert({
      user_id: token.user_id, x_post_id: post.postId, x_post_url: post.url,
      author_name: post.author, author_handle: post.handle, posted_at: post.createdAt,
      parsed_content: post.parsed, text_content: post.text, source: "ifttt", title: null,
      raw_api_response: { source: "ifttt", text: post.text, author: post.author, url: post.url, created_at: post.createdAt },
      summary: null, tags: [], category: null, kind: "text",
    }).select("id, saved_at").single();
    if (error?.code === "23505")
      return NextResponse.json({ success: true, duplicate: true });
    if (error || !saved)
      return NextResponse.json({ error: "Failed to save post" }, { status: 500 });
    // Reserve the unique row before AI work: concurrent deliveries enrich only once.
    try {
      const metadata = await enrichPost(post.text);
      const { error: metadataError } = await admin.from("saved_posts")
        .update(metadata).eq("id", saved.id).eq("user_id", token.user_id);
      if (metadataError) console.error("IFTTT metadata update failed");
    } catch {
      console.error("IFTTT metadata enrichment failed");
    }
    try {
      await indexSavedPostVector({ postId: saved.id, userId: token.user_id, xPostId: post.postId, text: post.text, authorHandle: post.handle, source: "ifttt", savedAt: saved.saved_at });
    }
    catch {
      console.error("IFTTT vector indexing failed");
    }
    return NextResponse.json({ success: true, duplicate: false, postId: saved.id });
  }
  catch (error) {
    if (error instanceof IftttPayloadError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("IFTTT ingestion failed");
    return NextResponse.json({ error: "Failed to ingest post" }, { status: 500 });
  }
}
