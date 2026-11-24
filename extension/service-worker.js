const DEFAULT_APP_URL = "http://localhost:3001";

// X's internal GraphQL query id for the Bookmarks timeline. This hash changes
// occasionally on X's side; if imports start 404ing, update it here (or in
// options). See README for how to find the current value.
const BOOKMARKS_QUERY_ID = "X1TiFAk2aL2JpX2ZRZR2xA";

function normalizeAppUrl(value) {
  try {
    const url = new URL(value);
    const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if ((url.protocol !== "https:" && !isLocal) || !["http:", "https:"].includes(url.protocol)) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

async function getAppUrl() {
  const { appUrl } = await chrome.storage.sync.get("appUrl");
  return normalizeAppUrl(appUrl) ?? DEFAULT_APP_URL;
}

chrome.runtime.onInstalled.addListener(async () => {
  const { appUrl } = await chrome.storage.sync.get("appUrl");
  if (!normalizeAppUrl(appUrl)) {
    await chrome.storage.sync.set({ appUrl: DEFAULT_APP_URL });
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "xml-open-tag-picker" && typeof message.postUrl === "string") {
    void getAppUrl().then((appUrl) => {
      const pickerUrl = new URL("/bookmarklet", appUrl);
      pickerUrl.searchParams.set("url", message.postUrl);
      return chrome.windows.create({
        url: pickerUrl.href,
        type: "popup",
        width: 400,
        height: 480,
      });
    });
    return;
  }

  if (message?.type === "xml-import-bookmarks") {
    importBookmarks()
      .then((r) => sendResponse({ ok: true, ...r }))
      .catch((err) => sendResponse({ ok: false, error: err?.message ?? "Import failed" }));
    return true; // keep the channel open for the async response
  }
});

async function getCookie(name) {
  try {
    const c = await chrome.cookies.get({ url: "https://x.com", name });
    return c?.value ?? null;
  } catch {
    return null;
  }
}

// Map one tweet from X's internal GraphQL shape to the X API v2 shape the app
// backend already parses.
function normalizeTweet(result) {
  const legacy = result?.legacy ?? {};
  const user = result?.core?.user_results?.result;
  const noteText = result?.note_tweet?.note_tweet_results?.result?.text;
  const media = legacy.extended_entities?.media ?? legacy.entities?.media ?? [];
  return {
    id: result?.rest_id,
    text: legacy.full_text ?? "",
    note_tweet: noteText ? { text: noteText } : undefined,
    author_id: user?.rest_id,
    created_at: legacy.created_at
      ? new Date(legacy.created_at).toISOString()
      : undefined,
    attachments: media.length
      ? { media_keys: media.map((m) => m.media_key ?? m.id_str).filter(Boolean) }
      : undefined,
  };
}

function collectIncludes(results) {
  const users = new Map();
  const media = [];
  for (const r of results) {
    const u = r?.core?.user_results?.result;
    if (u?.rest_id && !users.has(u.rest_id)) {
      users.set(u.rest_id, {
        id: u.rest_id,
        name: u.legacy?.name ?? "",
        username: u.legacy?.screen_name ?? "",
        profile_image_url: u.legacy?.profile_image_url_https,
      });
    }
    const m = r?.legacy?.extended_entities?.media ?? r?.legacy?.entities?.media ?? [];
    for (const mm of m) {
      media.push({
        media_key: mm.media_key ?? mm.id_str,
        type: mm.type,
        url: mm.media_url_https,
        preview_image_url:
          mm.type === "video" || mm.type === "animated_gif"
            ? mm.media_url_https
            : undefined,
        width: mm.original_info?.width,
        height: mm.original_info?.height,
      });
    }
  }
  return { users: [...users.values()], media };
}

// Walk the Bookmarks timeline instructions and collect tweet results + cursor.
function extractBookmarks(json) {
  const instructions =
    json?.data?.bookmark_timeline_v2?.timeline?.instructions ?? [];
  const results = [];
  let cursor = null;
  for (const instr of instructions) {
    if (instr?.type === "TimelineAddEntries") {
      for (const entry of instr.entries ?? []) {
        const result = entry?.content?.itemContent?.tweet_results?.result;
        if (result?.rest_id) results.push(result);
      }
    } else if (instr?.type === "TimelineReplaceEntry") {
      const result = instr?.entry?.content?.itemContent?.tweet_results?.result;
      if (result?.rest_id) results.push(result);
    }
  }
  // The bottom cursor entry.
  for (const instr of instructions) {
    if (instr?.type === "TimelineAddEntries") {
      for (const entry of instr.entries ?? []) {
        if (entry?.content?.entryType === "TimelineTimelineCursor" && entry?.content?.value) {
          cursor = entry.content.value;
        }
      }
    }
  }
  return { results, cursor };
}

async function fetchBookmarksPage(authToken, ct0, cursor) {
  const variables = { count: 100, includePromotedContent: false };
  if (cursor) variables.cursor = cursor;
  const url =
    `https://x.com/i/api/graphql/${BOOKMARKS_QUERY_ID}/Bookmarks?` +
    `variables=${encodeURIComponent(JSON.stringify(variables))}&` +
    `features=${encodeURIComponent(JSON.stringify({}))}`;

  const res = await fetch(url, {
    headers: {
      authorization: `Bearer ${authToken}`,
      "x-csrf-token": ct0,
      "content-type": "application/json",
    },
    credentials: "include",
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`X returned ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

async function importBookmarks() {
  const appUrl = await getAppUrl();
  const authToken = await getCookie("auth_token");
  const ct0 = await getCookie("ct0");
  if (!authToken || !ct0) {
    throw new Error("Sign in to X in this browser first, then retry.");
  }

  let cursor;
  let imported = 0;
  let skipped = 0;
  for (let page = 0; page < 20; page++) {
    const json = await fetchBookmarksPage(authToken, ct0, cursor);
    const { results, cursor: next } = extractBookmarks(json);
    if (!results.length) break;

    const tweets = results.map(normalizeTweet).filter((t) => t.id);
    const includes = collectIncludes(results);

    const res = await fetch(`${appUrl}/api/extension/import-bookmarks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ data: tweets, includes }),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(out.error || `Import failed (${res.status})`);

    imported += out.imported ?? 0;
    skipped += out.skipped ?? 0;
    cursor = next;
    if (!cursor) break;
  }

  return { imported, skipped };
}
