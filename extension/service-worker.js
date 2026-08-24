const DEFAULT_APP_URL = "http://localhost:3001";

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

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== "xml-open-tag-picker" || typeof message.postUrl !== "string") {
    return;
  }

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
});
