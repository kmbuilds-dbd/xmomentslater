const button = document.getElementById("import");
const status = document.getElementById("status");

function setStatus(text, kind) {
  status.textContent = text;
  status.className = kind || "";
}

button.addEventListener("click", async () => {
  button.disabled = true;
  setStatus("Importing…");

  try {
    const result = await chrome.runtime.sendMessage({ type: "xml-import-bookmarks" });
    if (result?.ok) {
      if (result.imported === 0) {
        setStatus("You're caught up — no new bookmarks.", "ok");
      } else {
        setStatus(
          `Imported ${result.imported} new${result.skipped ? ` · ${result.skipped} already saved` : ""}`,
          "ok"
        );
      }
    } else {
      setStatus(result?.error || "Import failed", "error");
    }
  } catch (err) {
    setStatus(err?.message || "Import failed", "error");
  } finally {
    button.disabled = false;
  }
});
