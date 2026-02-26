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
        <div className="space-y-5 mb-4">
          {/* Step 1 */}
          <div>
            <p className="text-xs font-medium mb-1.5">
              1. Create a new shortcut
            </p>
            <ul className="text-xs text-muted-foreground space-y-1.5 ml-4 list-disc">
              <li>
                Open the <strong>Shortcuts</strong> app on your iPhone
              </li>
              <li>
                Tap the <strong>+</strong> button in the top-right
                corner to create a new shortcut
              </li>
            </ul>
          </div>

          {/* Step 2 */}
          <div>
            <p className="text-xs font-medium mb-1.5">
              2. Name it and enable the Share Sheet
            </p>
            <ul className="text-xs text-muted-foreground space-y-1.5 ml-4 list-disc">
              <li>
                Tap the <strong>dropdown arrow</strong> (&#9662;) next
                to &ldquo;New Shortcut&rdquo; at the top, then tap{" "}
                <strong>Rename</strong> and type{" "}
                <strong>Save to xMomentsLater</strong>
              </li>
              <li>
                Tap the <strong>&#9432; info button</strong> in the
                bottom toolbar of the editor
              </li>
              <li>
                Turn on <strong>Show in Share Sheet</strong>
              </li>
              <li>
                Under <strong>Share Sheet Types</strong>, deselect
                everything except <strong>URLs</strong> (found under
                the Web category)
              </li>
              <li>
                Tap <strong>Done</strong> to close the details pane
              </li>
            </ul>
            <p className="text-[11px] text-muted-foreground/70 ml-4 mt-1.5">
              You should now see a &ldquo;Receive <strong>URLs</strong>{" "}
              input from <strong>Share Sheet</strong>&rdquo; action at
              the top of your shortcut.
            </p>
          </div>

          {/* Step 3 */}
          <div>
            <p className="text-xs font-medium mb-1.5">
              3. Add the Text action
            </p>
            <ul className="text-xs text-muted-foreground space-y-1.5 ml-4 list-disc">
              <li>
                Tap <strong>Add Action</strong>, search for{" "}
                <strong>Text</strong>, and add the{" "}
                <strong>Text</strong> action
              </li>
              <li>
                Tap inside the text field and paste this URL:
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

            <ul className="text-xs text-muted-foreground space-y-1.5 ml-4 list-disc mt-2">
              <li>
                Place your cursor at the very end (after the{" "}
                <code className="bg-muted px-1 py-0.5 rounded text-[11px]">
                  =
                </code>
                ), then look at the <strong>variables bar</strong>{" "}
                above the keyboard and tap{" "}
                <strong>Shortcut Input</strong>
              </li>
            </ul>
            <p className="text-[11px] text-muted-foreground/70 ml-4 mt-1.5">
              The text field should now show:{" "}
              <code className="bg-muted px-1 py-0.5 rounded">
                {saveUrl}
                <span className="text-primary font-medium">
                  Shortcut Input
                </span>
              </code>
            </p>
          </div>

          {/* Step 4 */}
          <div>
            <p className="text-xs font-medium mb-1.5">
              4. Add the Open URLs action
            </p>
            <ul className="text-xs text-muted-foreground space-y-1.5 ml-4 list-disc">
              <li>
                Tap the search bar at the bottom, search for{" "}
                <strong>Open URLs</strong>, and add it
              </li>
              <li>
                It will automatically use the <strong>Text</strong>{" "}
                output as its input &mdash; if not, tap its URL field
                and select <strong>Text</strong> from the variables bar
              </li>
            </ul>
          </div>

          {/* Step 5 */}
          <div>
            <p className="text-xs font-medium mb-1.5">5. Save it</p>
            <p className="text-xs text-muted-foreground ml-4">
              Tap <strong>Done</strong> in the top-right corner.
            </p>
          </div>

          {/* Summary */}
          <div className="rounded-md bg-muted/50 px-4 py-3 ml-0">
            <p className="text-xs font-medium mb-2">
              Your shortcut should have 3 actions:
            </p>
            <ol className="text-[11px] text-muted-foreground space-y-1 list-decimal list-inside">
              <li>
                Receive <strong>URLs</strong> input from{" "}
                <strong>Share Sheet</strong>
              </li>
              <li>
                <strong>Text</strong>:{" "}
                <code className="bg-muted px-1 py-0.5 rounded">
                  {saveUrl}
                  <span className="text-primary font-medium">
                    Shortcut Input
                  </span>
                </code>
              </li>
              <li>
                <strong>Open URLs</strong>:{" "}
                <span className="text-primary font-medium">Text</span>
              </li>
            </ol>
          </div>

          {/* Usage */}
          <div>
            <p className="text-xs font-medium mb-1.5">
              How to use it
            </p>
            <p className="text-xs text-muted-foreground ml-4">
              Tap <strong>Share</strong> on any post in the X app, then
              tap <strong>Save to xMomentsLater</strong> in the share
              sheet. Safari opens with the post URL pre-filled &mdash;
              pick your tags and tap Save.
            </p>
            <p className="text-[11px] text-muted-foreground/70 ml-4 mt-1.5">
              Don&apos;t see it? Scroll to the bottom of the share sheet
              and tap <strong>Edit Actions</strong> to add it to your
              favorites.
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
