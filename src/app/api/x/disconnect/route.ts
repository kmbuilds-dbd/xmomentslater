import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(`${baseUrl}/login`);
  }

  const { createClient: createAdminClient } = await import("@supabase/supabase-js");
  const adminClient = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  await adminClient
    .from("x_connections")
    .delete()
    .eq("user_id", user.id);

  return NextResponse.redirect(`${baseUrl}/dashboard`);
}
