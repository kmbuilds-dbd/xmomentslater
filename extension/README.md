# xMomentsLater Chrome extension

This Manifest V3 extension adds a second bookmark button beside X's native bookmark action on individual posts. Clicking it opens the existing xMomentsLater tag picker in a small popup window; saving there uses the app's normal authenticated save flow.

## Install locally

1. In Chrome, open `chrome://extensions` and enable **Developer mode**.
2. Choose **Load unpacked** and select this `extension` folder.
3. Open the extension's **Details** page, then **Extension options**.
4. Set the xMomentsLater URL to your deployed app URL (or leave `http://localhost:3001` for local development).
5. Sign in to xMomentsLater in Chrome, then visit a post on `x.com` or `twitter.com`.

The xMomentsLater bookmark-with-check icon appears immediately after X's bookmark control. It has an accessible name and works with keyboard focus.

## Packaging

For Chrome Web Store submission, zip the contents of this folder (not the folder itself). Do not include local credentials or environment files.
