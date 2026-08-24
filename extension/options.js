const DEFAULT_APP_URL = "http://localhost:3001";
const form = document.querySelector("#settings-form");
const input = document.querySelector("#app-url");
const status = document.querySelector("#status");

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

async function load() {
  const { appUrl } = await chrome.storage.sync.get("appUrl");
  input.value = normalizeAppUrl(appUrl) ?? DEFAULT_APP_URL;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const appUrl = normalizeAppUrl(input.value);
  if (!appUrl) {
    status.textContent = "Enter an HTTPS URL, or localhost for development.";
    input.focus();
    return;
  }

  await chrome.storage.sync.set({ appUrl });
  input.value = appUrl;
  status.textContent = "Saved.";
});

void load();
