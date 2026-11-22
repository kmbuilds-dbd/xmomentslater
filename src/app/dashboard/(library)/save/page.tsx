import { SaveForm } from "@/components/SaveForm";

// Force dynamic rendering — this route sits behind the auth-checking
// dashboard layout/middleware and must never be statically prerendered
// at build time (matches every other /dashboard/* page).
export const dynamic = "force-dynamic";

export default function SavePage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="font-[family-name:var(--font-fraunces)] text-3xl font-semibold tracking-tight mb-2">
        Save a Post
      </h1>
      <p className="text-muted-foreground mb-8">
        Paste an X post URL to save it to your library.
      </p>
      <SaveForm />
    </main>
  );
}
