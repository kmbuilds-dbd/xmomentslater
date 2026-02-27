"use client";

import { useState } from "react";
import { Copy, Check, Smartphone, ChevronDown, ChevronUp } from "lucide-react";

export function IOSShortcutCard({
  apiUrl,
  token,
}: {
  apiUrl: string;
  token: string;
}) {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const handleCopy = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const CopyButton = ({ text, field }: { text: string; field: string }) => (
    <button
      onClick={() => handleCopy(text, field)}
      className="shrink-0 text-muted-foreground hover:text-foreground p-2"
    >
      {copiedField === field ? (
        <Check className="h-4 w-4 text-primary" />
      ) : (
        <Copy className="h-4 w-4" />
      )}
    </button>
  );

  return (
    <div className="rounded-lg border px-5 py-4">
      <div className="flex items-center gap-2 mb-1">
        <Smartphone className="h-4 w-4 text-muted-foreground" />
        <p className="text-sm font-medium">iOS Shortcut</p>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Save posts from the X app&apos;s share sheet on iPhone or iPad &mdash;
        no browser needed.
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
                Tap the <strong>+</strong> button in the top-right corner to
                create a new shortcut
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
                Tap the <strong>dropdown arrow</strong> (&#9662;) next to
                &ldquo;New Shortcut&rdquo; at the top, then tap{" "}
                <strong>Rename</strong> and type{" "}
                <strong>Save to xMomentsLater</strong>
              </li>
              <li>
                Tap the <strong>&#9432; info button</strong> in the bottom
                toolbar of the editor
              </li>
              <li>
                Turn on <strong>Show in Share Sheet</strong>
              </li>
              <li>
                Under <strong>Share Sheet Types</strong>, deselect everything
                except <strong>URLs</strong> (found under the Web category)
              </li>
              <li>
                Tap <strong>Done</strong> to close the details pane
              </li>
            </ul>
            <p className="text-[11px] text-muted-foreground/70 ml-4 mt-1.5">
              You should now see a &ldquo;Receive <strong>URLs</strong> input
              from <strong>Share Sheet</strong>&rdquo; action at the top of
              your shortcut.
            </p>
          </div>

          {/* Step 3 */}
          <div>
            <p className="text-xs font-medium mb-1.5">
              3. Add the &ldquo;Get Contents of URL&rdquo; action
            </p>
            <ul className="text-xs text-muted-foreground space-y-1.5 ml-4 list-disc">
              <li>
                Tap <strong>Add Action</strong>, search for{" "}
                <strong>Get Contents of URL</strong>, and add it
              </li>
              <li>
                Tap the URL field and paste this API URL:
              </li>
            </ul>

            {/* Copyable API URL */}
            <div className="flex items-center gap-2 mt-2 ml-4">
              <code className="flex-1 text-xs bg-muted px-3 py-2 rounded-md truncate">
                {apiUrl}
              </code>
              <CopyButton text={apiUrl} field="apiUrl" />
            </div>

            <ul className="text-xs text-muted-foreground space-y-1.5 ml-4 list-disc mt-2">
              <li>
                Tap <strong>Advanced</strong> to expand the request options
              </li>
              <li>
                Change <strong>Method</strong> to <strong>POST</strong>
              </li>
              <li>
                Under <strong>Headers</strong>, add a new header:
                <ul className="mt-1.5 space-y-1 ml-4 list-disc">
                  <li>
                    Key: <code className="bg-muted px-1 py-0.5 rounded text-[11px]">Authorization</code>
                  </li>
                  <li>
                    Value &mdash; copy and paste this:
                  </li>
                </ul>
              </li>
            </ul>

            {/* Copyable Bearer token */}
            <div className="flex items-center gap-2 mt-2 ml-4">
              <code className="flex-1 text-xs bg-muted px-3 py-2 rounded-md truncate">
                Bearer {token}
              </code>
              <CopyButton text={`Bearer ${token}`} field="token" />
            </div>

            <ul className="text-xs text-muted-foreground space-y-1.5 ml-4 list-disc mt-2">
              <li>
                Add another header:
                <ul className="mt-1.5 space-y-1 ml-4 list-disc">
                  <li>
                    Key: <code className="bg-muted px-1 py-0.5 rounded text-[11px]">Content-Type</code>
                  </li>
                  <li>
                    Value: <code className="bg-muted px-1 py-0.5 rounded text-[11px]">application/json</code>
                  </li>
                </ul>
              </li>
              <li>
                Under <strong>Request Body</strong>, select <strong>JSON</strong>
              </li>
              <li>
                Add a key called{" "}
                <code className="bg-muted px-1 py-0.5 rounded text-[11px]">url</code>{" "}
                &mdash; for the value, tap the field and select{" "}
                <strong>Shortcut Input</strong> from the variables bar above
                the keyboard
              </li>
            </ul>
          </div>

          {/* Step 4 */}
          <div>
            <p className="text-xs font-medium mb-1.5">
              4. Add a notification (optional)
            </p>
            <ul className="text-xs text-muted-foreground space-y-1.5 ml-4 list-disc">
              <li>
                Tap the search bar at the bottom, search for{" "}
                <strong>Show Notification</strong>, and add it
              </li>
              <li>
                Set the body to{" "}
                <strong>Saved to xMomentsLater</strong>
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
                <strong>Get Contents of URL</strong>: POST to{" "}
                <code className="bg-muted px-1 py-0.5 rounded">
                  {apiUrl}
                </code>{" "}
                with Bearer token and JSON body
              </li>
              <li>
                <strong>Show Notification</strong>: Saved to xMomentsLater
              </li>
            </ol>
          </div>

          {/* Usage */}
          <div>
            <p className="text-xs font-medium mb-1.5">How to use it</p>
            <p className="text-xs text-muted-foreground ml-4">
              Tap <strong>Share</strong> on any post in the X app, then tap{" "}
              <strong>Save to xMomentsLater</strong> in the share sheet. The
              post saves instantly in the background &mdash; you&apos;ll see a
              notification when it&apos;s done. No browser needed.
            </p>
            <p className="text-[11px] text-muted-foreground/70 ml-4 mt-1.5">
              Don&apos;t see it? Scroll to the bottom of the share sheet and
              tap <strong>Edit Actions</strong> to add it to your favorites.
            </p>
          </div>

          {/* Token warning */}
          <div className="rounded-md bg-muted/50 px-4 py-3 ml-0">
            <p className="text-[11px] text-muted-foreground">
              <strong>Note:</strong> The token above is private to your
              account. Don&apos;t share it with anyone.
            </p>
          </div>
        </div>
      )}

      {!expanded && (
        <p className="text-xs text-muted-foreground">
          Saves posts directly via API &mdash; no login required on your phone.
        </p>
      )}
    </div>
  );
}
