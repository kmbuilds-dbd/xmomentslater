const button = document.getElementById("import");
const fixButton = document.getElementById("fixAuthors");
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

fixButton.addEventListener("click", async () => {
  fixButton.disabled = true;
  setStatus("Fixing authors…");

  try {
    const result = await chrome.runtime.sendMessage({ type: "xml-fix-authors" });
    if (result?.ok) {
      setStatus(
        `Fixed ${result.updated} author${result.updated === 1 ? "" : "s"}${result.skipped ? ` · ${result.skipped} unchanged` : ""}`,
        "ok"
      );
    } else {
      setStatus(result?.error || "Fix failed", "error");
    }
  } catch (err) {
    setStatus(err?.message || "Fix failed", "error");
  } finally {
    fixButton.disabled = false;
  }
});
