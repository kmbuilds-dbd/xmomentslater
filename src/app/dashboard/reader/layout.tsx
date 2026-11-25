import { createClient } from "@/lib/supabase/server";
import { ReaderShell } from "@/components/ReaderShell";

export default async function ReaderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: tagRows } = await supabase.from("saved_posts").select("tags");
  const counts = new Map<string, number>();
  for (const row of tagRows ?? []) {
    for (const t of row.tags ?? []) {
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
  }
  const topLabels = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8)
    .map(([tag, count]) => ({ tag, count }));

  return (
    <ReaderShell userEmail={user?.email ?? ""} topLabels={topLabels}>
      {children}
    </ReaderShell>
  );
}
