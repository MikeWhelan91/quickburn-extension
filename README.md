# Quickburn — Browser Extension (MVP)

Right‑click selected text → **Send with Quickburn** → choose expiry & reads → get a **burn‑after‑reading** link copied to clipboard.

This repo includes Chrome/Edge (MV3) and a Firefox variant.

## Contents
- `manifest.json` — Chrome/Edge (MV3, service worker)
- `manifest-firefox.json` — Firefox (MV3, `background.scripts` + Gecko ID)
- `background.js` — creates the context‑menu and opens the popup
- `popup.html` / `popup.js` — popup UI + client‑side encryption
- `icons/` — placeholder icons

## Load unpacked (Chrome / Edge)
1. Open `chrome://extensions` (or `edge://extensions`) → enable **Developer mode**.
2. **Load unpacked** → select this folder.
3. On any page, select text → right‑click **Send with Quickburn** → click **Create Quickburn Link**.
4. The link looks like `https://quickburn.me/s/<id>#k=<base64url>`. It’s already copied to clipboard.

## Firefox
1. Zip the extension using the Firefox manifest:
   - Rename `manifest-firefox.json` → `manifest.json` (or use the zip script below).
2. Go to `about:debugging` → **This Firefox** → **Load Temporary Add‑on…** → pick the folder or the zip.

> Firefox MV3 support changes frequently. If AMO complains about `background.service_worker`, use the `manifest-firefox.json` which uses `background.scripts`.

## Safari (later)
Safari requires converting the web extension via Xcode:
```bash
xcrun safari-web-extension-converter ./ --bundle-identifier me.quickburn.extension --project-location ./safari
```
Open the generated Xcode project in `./safari`, enable the proper signing team, and build the macOS/iOS targets. No code changes needed; MV3 APIs are bridged by Safari.

## Build zips
Install deps then run:
```bash
npm install
npm run zip       # makes both Chrome and Firefox zips in /dist
```
The zips are ready for Chrome Web Store / Edge Add‑ons / AMO upload.

## Privacy
The extension encrypts notes **in the popup** and POSTs the ciphertext to `https://quickburn.me/api/secret`. No note contents are sent unencrypted. See the site’s `/privacy` and `/terms`.
