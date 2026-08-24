const BUTTON_CLASS = "xml-save-button";
const WRAPPER_CLASS = "xml-save-wrapper";
const BOOKMARK_SELECTORS = [
  'button[data-testid="bookmark"]',
  'button[data-testid="removeBookmark"]',
];

function getPostUrl(bookmarkButton) {
  const article = bookmarkButton.closest("article");
  const statusLink = article?.querySelector('a[href*="/status/"]');
  const candidate = statusLink?.href ?? (location.pathname.includes("/status/") ? location.href : null);

  if (!candidate) return null;

  try {
    const url = new URL(candidate, location.origin);
    return `${url.origin}${url.pathname}`;
  } catch {
    return null;
  }
}

function createSaveButton(postUrl) {
  const wrapper = document.createElement("span");
  wrapper.className = WRAPPER_CLASS;

  const button = document.createElement("button");
  button.type = "button";
  button.className = BUTTON_CLASS;
  button.setAttribute("aria-label", "Save to xMomentsLater");
  button.setAttribute("data-tooltip", "Save to xMomentsLater");
  button.title = "Save to xMomentsLater";
  button.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M5.2 3.5A1.7 1.7 0 0 1 6.9 1.8h10.2a1.7 1.7 0 0 1 1.7 1.7v18.7l-6.8-4.35-6.8 4.35V3.5Z" />
      <path class="xml-save-mark" d="m8.8 10.2 2.05 2.05 4.35-4.35" />
    </svg>`;
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    chrome.runtime.sendMessage({ type: "xml-open-tag-picker", postUrl });
  });

  wrapper.append(button);
  return wrapper;
}

function installButtons() {
  for (const selector of BOOKMARK_SELECTORS) {
    for (const bookmarkButton of document.querySelectorAll(selector)) {
      const actionSlot = bookmarkButton.parentElement;
      if (!actionSlot || actionSlot.nextElementSibling?.classList.contains(WRAPPER_CLASS)) continue;

      const postUrl = getPostUrl(bookmarkButton);
      if (!postUrl) continue;

      actionSlot.insertAdjacentElement("afterend", createSaveButton(postUrl));
    }
  }
}

let scanQueued = false;
function queueScan() {
  if (scanQueued) return;
  scanQueued = true;
  requestAnimationFrame(() => {
    scanQueued = false;
    installButtons();
  });
}

const observer = new MutationObserver(queueScan);
observer.observe(document.documentElement, { childList: true, subtree: true });
queueScan();
