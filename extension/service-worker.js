const DEFAULT_APP_URL = "http://localhost:3001";

// Live values captured from X's web client on the bookmarks page.
const BOOKMARKS_QUERY_ID = "fjf5b5Lu82lYMSBRhppK2g";
const BOOKMARKS_FEATURES = {
  rweb_video_screen_enabled: false,
  rweb_cashtags_enabled: true,
  profile_label_improvements_pcf_label_in_post_enabled: true,
  responsive_web_profile_redirect_enabled: true,
  rweb_tipjar_consumption_enabled: false,
  verified_phone_label_enabled: false,
  creator_subscriptions_tweet_preview_api_enabled: true,
  responsive_web_graphql_timeline_navigation_enabled: true,
  premium_content_api_read_enabled: false,
  communities_web_enable_tweet_community_results_fetch: true,
  c9s_tweet_anatomy_moderator_badge_enabled: true,
  responsive_web_grok_analyze_button_fetch_trends_enabled: false,
  responsive_web_grok_analyze_post_followups_enabled: true,
  rweb_cashtags_composer_attachment_enabled: true,
  responsive_web_jetfuel_frame: true,
  rweb_sports_post_context_enabled: false,
  x_elections_post_context_enabled: true,
  responsive_web_grok_share_attachment_enabled: true,
  responsive_web_grok_annotations_enabled: true,
  articles_preview_enabled: true,
  responsive_web_edit_tweet_api_enabled: true,
  rweb_conversational_replies_downvote_enabled: false,
  graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
  view_counts_everywhere_api_enabled: true,
  longform_notetweets_consumption_enabled: true,
  responsive_web_twitter_article_tweet_consumption_enabled: true,
  content_disclosure_indicator_enabled: true,
  content_disclosure_ai_generated_indicator_enabled: true,
  responsive_web_grok_show_grok_translated_post: true,
  responsive_web_grok_analysis_button_from_backend: true,
  post_ctas_fetch_enabled: true,
  freedom_of_speech_not_reach_fetch_enabled: true,
  standardized_nudges_misinfo: true,
  tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
  longform_notetweets_rich_text_read_enabled: true,
  longform_notetweets_inline_media_enabled: false,
  responsive_web_nested_quote_preview_enabled: true,
  responsive_web_grok_image_annotation_enabled: true,
  responsive_web_grok_imagine_annotation_enabled: true,
  responsive_web_made_on_x_label_enabled: false,
  responsive_web_grok_community_note_auto_translation_is_enabled: true,
  responsive_web_enhance_cards_enabled: false,
};

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

// Walk the Bookmarks response and collect every tweet + the pagination cursor.
// The instruction shape varies, so this searches recursively rather than
// assuming a fixed instruction type.
function extractBookmarks(json) {
  const results = [];
  const seen = new Set();
  let cursor = null;

  function walk(node) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (node.__typename === "Tweet" && node.rest_id) {
      if (!seen.has(node.rest_id)) {
        seen.add(node.rest_id);
        results.push(node);
      }
      return;
    }
    if (node.entryType === "TimelineTimelineCursor" && node.value) {
      cursor = node.value;
      return;
    }
    for (const key of Object.keys(node)) walk(node[key]);
  }

  walk(json);
  return { results, cursor };
}

// Read a cookie (including httpOnly) in the extension context.
async function getCookie(name) {
  try {
    const all = await chrome.cookies.getAll({ url: "https://x.com" });
    const matches = all.filter((c) => c.name === name);
    if (!matches.length) return null;
    const domain = matches.find((c) => c.domain.startsWith("."));
    return (domain ?? matches[0]).value;
  } catch {
    return null;
  }
}

// Ask the x.com page to fetch a bookmarks page same-origin. The page's own
// session cookies are sent automatically; the auth token (httpOnly, read in
// the extension context) is passed in for the Authorization header.
async function fetchBookmarksViaContent(cursor) {
  const tabs = await chrome.tabs.query({ url: ["*://x.com/*", "*://*.x.com/*"] });
  if (!tabs.length) {
    throw new Error("Open x.com in a tab, then retry.");
  }

  const authToken = await getCookie("auth_token");
  const ct0 = await getCookie("ct0");

  const [result] = await chrome.scripting.executeScript({
    target: { tabId: tabs[0].id },
    func: async (args) => {
      const { authToken, ct0, cursor, queryId, features } = args;
      const variables = { count: 100, includePromotedContent: false };
      if (cursor) variables.cursor = cursor;
      const url =
        `/i/api/graphql/${queryId}/Bookmarks?` +
        `variables=${encodeURIComponent(JSON.stringify(variables))}&` +
        `features=${encodeURIComponent(JSON.stringify(features))}`;
      const headers = { "content-type": "application/json" };
      if (authToken) headers.authorization = `Bearer ${authToken}`;
      if (ct0) headers["x-csrf-token"] = ct0;
      const res = await fetch(url, { headers, credentials: "same-origin" });
      if (!res.ok) {
        throw new Error(`X returned ${res.status}: ${(await res.text()).slice(0, 300)}`);
      }
      return res.json();
    },
    args: [
      { authToken, ct0, cursor, queryId: BOOKMARKS_QUERY_ID, features: BOOKMARKS_FEATURES },
    ],
  });

  return result.result;
}

async function importBookmarks() {
  const appUrl = await getAppUrl();

  let cursor;
  let imported = 0;
  let skipped = 0;
  for (let page = 0; page < 20; page++) {
    const json = await fetchBookmarksViaContent(cursor);
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
