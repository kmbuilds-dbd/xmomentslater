"use client";

import { useState } from "react";
import { Copy, Check, Smartphone, ChevronDown, ChevronUp } from "lucide-react";

export function IOSShortcutCard({
  saveUrl,
}: {
  saveUrl: string;
}) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(saveUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-lg border px-5 py-4">
      <div className="flex items-center gap-2 mb-1">
        <Smartphone className="h-4 w-4 text-muted-foreground" />
        <p className="text-sm font-medium">iOS Shortcut</p>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Save posts from the X app&apos;s share sheet on iPhone or iPad.
      </p>

      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors mb-3"
      >
        {expanded ? (
          <ChevronUp className="h-3.5 w-3.5" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5" />
        )}
        {expanded ? "Hide setup instructions" : "Show setup instructions"}
      </button>

      {expanded && (
        <div className="space-y-4 mb-4">
          {/* Step 1 */}
          <div>
            <p className="text-xs font-medium mb-1">
              1. Create a new shortcut
            </p>
            <ul className="text-xs text-muted-foreground space-y-1 ml-4 list-disc">
              <li>
                Open the <strong>Shortcuts</strong> app on your iPhone
              </li>
              <li>
                Tap the <strong>+</strong> button in the top-right corner
              </li>
            </ul>
          </div>

          {/* Step 2 */}
          <div>
            <p className="text-xs font-medium mb-1">
              2. Make it appear in the Share Sheet
            </p>
            <ul className="text-xs text-muted-foreground space-y-1 ml-4 list-disc">
              <li>
                At the top of the new shortcut, tap the{" "}
                <strong>name field</strong> (it says &ldquo;New
                Shortcut&rdquo;) and type{" "}
                <strong>Save to xMomentsLater</strong>
              </li>
              <li>
                Tap the <strong>info icon</strong> (small{" "}
                <strong>&#9432;</strong>) at the top, or tap the
                dropdown arrow next to the shortcut name
              </li>
              <li>
                Turn on <strong>Show in Share Sheet</strong>
              </li>
              <li>
                Under <strong>Share Sheet Types</strong>, deselect
                everything except <strong>URLs</strong>
              </li>
            </ul>
          </div>

          {/* Step 3 */}
          <div>
            <p className="text-xs font-medium mb-1">
              3. Build the shortcut actions
            </p>
            <ul className="text-xs text-muted-foreground space-y-1 ml-4 list-disc">
              <li>
                Tap <strong>Add Action</strong>, search for{" "}
                <strong>Text</strong>, and add the{" "}
                <strong>Text</strong> action
              </li>
              <li>
                In the text field, type this URL (or paste it using the
                button below), then tap at the very end after the{" "}
                <code className="bg-muted px-1 py-0.5 rounded text-[11px]">
                  =
                </code>{" "}
                sign and insert the{" "}
                <strong>Shortcut Input</strong> variable
              </li>
            </ul>

            {/* Copyable URL */}
            <div className="flex items-center gap-2 mt-2 ml-4">
              <code className="flex-1 text-xs bg-muted px-3 py-2 rounded-md truncate">
                {saveUrl}
              </code>
              <button
                onClick={handleCopy}
                className="shrink-0 text-muted-foreground hover:text-foreground p-2"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-primary" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </button>
            </div>

            <ul className="text-xs text-muted-foreground space-y-1 ml-4 list-disc mt-2">
              <li>
                The Text action should read:{" "}
                <code className="bg-muted px-1 py-0.5 rounded text-[11px]">
                  {saveUrl}
                  <span className="text-primary">[Shortcut Input]</span>
                </code>
              </li>
              <li>
                Tap the search bar again, search for{" "}
                <strong>Open URLs</strong>, and add it
              </li>
              <li>
                It will automatically use the Text output as its
                input &mdash; if not, tap the URL field and select{" "}
                <strong>Text</strong> from the variables
              </li>
            </ul>
          </div>

          {/* Step 4 */}
          <div>
            <p className="text-xs font-medium mb-1">4. Done!</p>
            <p className="text-xs text-muted-foreground ml-4">
              Tap <strong>Done</strong> in the top-right. Now when you
              tap <strong>Share</strong> on any post in the X app,
              you&apos;ll see <strong>Save to xMomentsLater</strong> in
              the share sheet. It opens Safari with the post URL
              pre-filled so you can pick tags and save.
            </p>
          </div>
        </div>
      )}

      {!expanded && (
        <div className="flex items-center gap-2">
          <code className="flex-1 text-xs bg-muted px-3 py-2 rounded-md truncate">
            {saveUrl}
          </code>
          <button
            onClick={handleCopy}
            className="shrink-0 text-muted-foreground hover:text-foreground p-2"
          >
            {copied ? (
              <Check className="h-4 w-4 text-primary" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </button>
        </div>
      )}
    </div>
  );
}
