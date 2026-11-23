import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { askGemini, buildPostContext, getGeminiKey } from "@/lib/ai";
import type { SavedPostRow } from "@/lib/saved-posts";

const POST_COLS =
  "id, title, author_name, author_handle, summary, parsed_content, text_content";

// POST — ask a question about a saved post, answered by Gemini.
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { postId, question, history } = await request.json();
    if (!postId || !question || typeof question !== "string" || !question.trim()) {
      return NextResponse.json({ error: "Missing post id or question" }, { status: 400 });
    }

    const apiKey = await getGeminiKey(user.id);
    if (!apiKey) {
      return NextResponse.json(
        { error: "Set your Google API key in Settings first." },
        { status: 400 }
      );
    }

    const { data: post } = await supabase
      .from("saved_posts")
      .select(POST_COLS)
      .eq("id", postId)
      .single();

    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const turns = Array.isArray(history)
      ? history
          .filter(
            (t: unknown): t is { role: "user" | "model"; text: string } =>
              !!t &&
              typeof t === "object" &&
              ((t as { role?: string }).role === "user" ||
                (t as { role?: string }).role === "model") &&
              typeof (t as { text?: unknown }).text === "string"
          )
          .slice(-20)
      : [];

    const answer = await askGemini({
      apiKey,
      context: buildPostContext(post as SavedPostRow),
      history: turns,
      question: question.trim(),
    });

    return NextResponse.json({ answer });
  } catch (err) {
    console.error("POST /api/ai/ask error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message.includes("Gemini error") ? 502 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
