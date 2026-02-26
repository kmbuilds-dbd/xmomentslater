import Link from "next/link";
import { ArrowRight } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-5 md:px-12">
        <span className="font-[family-name:var(--font-fraunces)] text-lg font-semibold tracking-tight">
          xMomentsLater
        </span>
        <Link
          href="/login"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Sign in
        </Link>
      </nav>

      {/* Hero */}
      <main className="flex-1 flex items-center px-6 md:px-12 pb-24">
        <div className="max-w-2xl">
          <h1 className="font-[family-name:var(--font-fraunces)] text-5xl md:text-7xl font-semibold tracking-tight leading-[1.08] mb-8">
            Read it later,
            <br />
            <span className="text-primary">without the noise.</span>
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground leading-relaxed max-w-lg mb-12">
            Save any X post with one click. Read it in a clean, typographic
            reader — no feeds, no metrics, no distractions.
          </p>
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Get started
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="px-6 py-6 md:px-12 border-t">
        <p className="text-xs text-muted-foreground">
          A read-later app for X, built for people who actually want to read.
        </p>
      </footer>
    </div>
  );
}
