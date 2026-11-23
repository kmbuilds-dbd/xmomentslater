import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { encrypt } from "@/lib/encryption";
import { hasGeminiKey } from "@/lib/ai";

// GET — whether the user has a Gemini API key configured.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ hasKey: await hasGeminiKey(user.id) });
}

// POST — store the user's Gemini API key (encrypted).
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { key } = await request.json();
    if (!key || typeof key !== "string" || !key.trim()) {
      return NextResponse.json({ error: "Missing API key" }, { status: 400 });
    }

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceRoleKey
    );

    const encrypted = encrypt(key.trim());
    const { error } = await admin.from("ai_keys").upsert({
      user_id: user.id,
      encrypted_key: encrypted,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      console.error("Save AI key error:", error);
      return NextResponse.json({ error: "Failed to save key" }, { status: 500 });
    }

    return NextResponse.json({ hasKey: true });
  } catch (err) {
    console.error("POST /api/ai/key error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE — remove the user's Gemini API key.
export async function DELETE() {
  try {
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
    await admin.from("ai_keys").delete().eq("user_id", user.id);

    return NextResponse.json({ hasKey: false });
  } catch (err) {
    console.error("DELETE /api/ai/key error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
