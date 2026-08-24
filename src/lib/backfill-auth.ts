import "server-only";

/**
 * Shared allowlist gate for one-off backfill endpoints (semantic search,
 * tags, ...). Same env var across all of them — it means "admin emails
 * allowed to run backfills," not anything semantic-search-specific.
 */
export function isBackfillAdmin(email: string | null | undefined): boolean {
  const adminEmails = (process.env.SEMANTIC_BACKFILL_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return !!email && adminEmails.includes(email.toLowerCase());
}
