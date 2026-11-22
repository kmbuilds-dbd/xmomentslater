# "Reader" — Explore-style reading page — Implementation Plan

> Status: **Draft, awaiting confirmation.** Do not implement until the open
> decisions in §8 are confirmed.

**Goal:** Add a new, separate page to xMomentsLater that recreates the
TweetsMash **Explore** experience (left sidebar, smart "Right Now" sections,
rich post cards, AI assistant), plus the "additional features" checklist the
user supplied. The existing Library (`/dashboard`) and single-post Reader
(`/dashboard/reader/[postId]`) are untouched.

**Smallest change that meets the goal:** one new route `/dashboard/reader`
with a sidebar shell, an Explore feed, three smart section cards, and a count —
built entirely on the existing `saved_posts` data and helpers. No new tables, no
new external services. AI chat and email digests are later phases.

---

## 1. What we are building (scope)

A new page at **`/dashboard/reader`** — the "Reader" area's landing/explore
view. It is a *new page*, not a rewrite:

| Route | Today | After |
|---|---|---|
| `/dashboard` | Library (search, tags, sort, pagination) | **unchanged** |
| `/dashboard/reader/[postId]` | Single-post typographic reader | **unchanged** |
| `/dashboard/reader` | *(does not exist)* | **NEW** — Explore-style page |

The new page links *into* the existing single-post reader (`/dashboard/reader/[postId]`)
when a card is opened, so the calm reading surface stays the destination.

> **Naming note:** `/dashboard/reader` (new explore page) and
> `/dashboard/reader/[postId]` (existing single-post reader) coexist under the
> same `reader/` segment. Clicking a card goes from the new page to the existing
> single-post reader. Confirm this is the intended shape, or suggest a clearer
> route name in §8.

---

## 2. Reference (what we are matching)

### 2.1 TweetsMash `/explore` — captured live

Recorded via Chrome DevTools + a vision read of the rendered page. Two-pane,
dark-on-dark, utilitarian SaaS layout:

- **Left sidebar (~248px, collapsible):**
  - Profile row (avatar, `kmorparia`, account switcher, collapse toggle)
  - Search field (`Search...`, `⌘ K` hint)
  - Grouped nav: **CURATION** (All Bookmarks, Labels, Archive, History),
    **CONSUMPTION** (Mash Picks, Live Collections), **AUTOMATIONS & EXPORTS**
    (Sync to Apps, Developer API, AI & Agents, Exports), **DISCOVER** (Twitter List)
  - "Free plan → Upgrade to Pro" card
  - Footer (help, settings)
- **Main column (~610px, centered):**
  - Sticky header: `Explore` title + count pill (`878`) + refresh + search + filter + kebab
  - **"RIGHT NOW"** — 3 cards in a row:
    1. *A quick pass through N saves* → `Start`
    2. *Videos you set aside* → `Watch`
    3. *Things you meant to try* → `Start` + "N in all"
  - **Feed** — single-column cards: avatar, name, `@handle • date`,
    action icons (label, archive, delete, open-on-X, AI), embedded content
    (tweet text / `𝕏 Article` card / media), AI bullet summary,
    `Read thread` / `Read full tweet`
  - **Floating AI assistant** bottom-right (the "Tina" mark), plus a per-card
    AI entry point
- **Palette:** bg `#131316`, cards `#1A1A1D`, hairlines `#37373A`, blue→violet
  accent; Inter-like sans.

### 2.2 "Additional features" — from the user's screenshot

A feature checklist (8 items). Mapped to build work in §6:

1. Chat with your bookmarks using AI
2. Daily / weekly email digests
3. Smart recipes & auto-organize
4. Full-text search across all bookmarks
5. Unlimited labels & folders
6. In-built thread reader
7. Threads unrolled automatically when you save them
8. Turn bookmarks into newsletters

---

## 3. Design decisions (proposals — confirm in §8)

| # | Decision | Proposal | Reason |
|---|---|---|---|
| D1 | "Upgrade to Pro" card | **Drop it.** Replace with a small "N saved · M unread" summary | No Pro tier exists |
| D2 | Theme | **Keep light/dark toggle**; no forced dark | Respects existing users; dark already matches reference |
| D3 | Fonts | **Keep Fraunces + Plus Jakarta Sans**; no new font | The experience is layout/flow, not the exact typeface |
| D4 | Sidebar nav stubs | Wire "All Bookmarks" → `/dashboard`; leave the rest **visible but disabled** | Those views don't exist yet; wiring them is later work |
| D5 | Cards link target | Cards open the existing `/dashboard/reader/[postId]` | Reuse the calm reading surface |
| D6 | Engagement metrics | **Strip them** (no like/retweet counts) | Matches the product's "no engagement metrics" rule |
| D7 | Product philosophy | This page is a deliberate departure from "no feeds" | Owner's call — flagged in §9 |

---

## 4. Route & layout

Today `src/app/dashboard/layout.tsx` renders `<Navbar/>` on every dashboard
page. The new page needs a sidebar shell instead, so we introduce a route group
(URLs do not change):

```
src/app/dashboard/
  (library)/layout.tsx        # = current Navbar layout (moved)
  (library)/page.tsx          # current library (moved)
  (library)/save/page.tsx     # moved
  (library)/settings/page.tsx # moved
  reader/layout.tsx           # NEW — full-height sidebar shell, no Navbar
  reader/page.tsx             # NEW — the Explore page
  reader/[postId]/page.tsx    # moved — sits inside the reader shell
```

Net change: 3 file moves + 2 new layouts + 2 new components + 1 new page.

---

## 5. Data shapes (named before writing logic)

```ts
// src/lib/reader.ts — new

type PostKind = "article" | "video" | "image" | "text";

interface ReaderPost extends LibraryPost {   // LibraryPost from lib/saved-posts.ts
  kind: PostKind;          // drives card body: article embed vs media vs text
  mediaUrls: string[];     // image / video preview URLs
  readMinutes: number;     // reuse estimateReadTime from ReaderContent
}

interface SmartSection {
  id: "quick-pass" | "videos" | "to-try";
  title: string;
  blurb: string;
  actionLabel: "Start" | "Watch";
  posts: ReaderPost[];
}
```

`PostKind` is a discriminated union — the card component switches on `kind`
instead of growing an if/else chain. Smart sections are derived in the server
component, no new tables.

Derivation rules (all from existing columns):
- **quick-pass** = unread, `readMinutes <= 1`
- **videos** = `kind === "video"`, unread
- **to-try** = category/tags in a small "actionable" set (tool, how-to, guide)

---

## 6. "Additional features" → work mapping

| Feature (from screenshot) | Status today | Work |
|---|---|---|
| Chat with bookmarks using AI | ✗ | Phase 2 — chat over posts (existing Anthropic client + `/api/search/semantic`) |
| Daily / weekly email digests | ✗ | Phase 3 — needs email provider + reuse `/api/cron/sync-bookmarks` |
| Smart recipes & auto-organize | ⚠ auto-tags exist | Named filter/automation rules on top of tags |
| Full-text search across all bookmarks | ✓ mostly | Surface globally via ⌘K dialog |
| Unlimited labels & folders | ⚠ labels=tags; folders ✗ | Folders as a new column, or treat tags as folders |
| In-built thread reader | ✓ partial | `parse-tweet.ts` already unrolls; verify/polish |
| Threads unrolled automatically on save | ⚠ partial | Confirm bookmark sync unrolls threads too |
| Turn bookmarks into newsletters | ✗ | Phase 3 — same email infra as digests |

---

## 7. Build order

- **Phase 1 (MVP — the Explore page):** route-group move + sidebar shell +
  `ReaderPost`/`SmartSection` shapes + Explore page + post cards + "Right Now"
  cards + count + search/⌘K. Ships on existing data, no backend, no external
  services.
- **Phase 2 (AI):** floating AI + "chat with your bookmarks" (existing
  Anthropic + semantic search).
- **Phase 3 (outbound):** email digests + newsletter export (needs an email
  provider + keys — the only external dependency).
- **Polish:** folders, recipes, thread-unroll verification, wire the disabled
  sidebar items.

---

## 8. Open decisions (need your confirmation)

1. **D1** — drop the "Upgrade to Pro" card in favor of a "N saved · M unread" summary? 
2. **D2** — keep light/dark toggle (no forced dark)? 
3. **D3** — keep existing fonts (no new font)? 
4. **D4** — leave unused sidebar items (Labels, Archive, History, Mash Picks, Exports, …) visible-but-disabled for now? 
5. **Naming** — keep the new page at `/dashboard/reader` alongside the existing `/dashboard/reader/[postId]`? (or prefer a different route, e.g. `/dashboard/explore`?) 
6. **REA capture** — run the formal `capture_browser_scenario` + `export_environment_bundle` to store the reference in-repo, or proceed with the capture already gathered? 
7. **Scope of Phase 1** — ship the Explore page first, then AI chat and digests later? (recommended)

---

## 9. Risks / tensions

- **Philosophy shift:** the product spec says "no feeds". The Explore page is a
  curated feed + AI. This is the owner's call, but it changes the app's
  personality. 
- **New parallel home:** until wired into navigation, the page is reachable only
  by URL. Add a nav entry as part of Phase 1. 
- **Derived smart sections are heuristic** (read-time estimate, media detection,
  "actionable" tag set). They will be imperfect until refined with real data.
