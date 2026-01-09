# Runyx Browser Automation Extension

Runyx is a Chromium extension that lets you design and execute browser automations through a visual builder. This repository contains both the extension runtime (service worker, content script, bridge) and the Automation Studio UI (Next.js build embedded in the extension).

## Documentation map
- [Project overview and quick start](documentation/README.md)
- [Architecture and runtime flow](documentation/architecture.md)
- [Automation workflows, triggers, and runner semantics](documentation/automation-workflows.md)
- [Automation Studio UI guide](documentation/ui.md)
- [Testing utilities and local servers](documentation/testing.md)

## Loading the extension
1) Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and choose this folder.

For Edge:

1) Open `edge://extensions`, enable **Developer mode**, click **Load unpacked**, and choose this folder.
2) Click the toolbar icon (or `Ctrl+Shift+F`) to open the side panel UI. The DevTools tab "Runyx" loads the same UI.

## Repository layout
- Extension runtime: `manifest.json`, `background.js`, `contentScript.js`, `ui.html`, `ui-bridge.js`, `devtools*.html`, `eval-sandbox.html`.
- Built UI assets: `out/` (served inside the iframe).
- UI source: `automation-popup-design/` (Next.js app + component library).
- Helpers: `server.js` (WS relay), `testing/servers/` (WS + Flask ingestion fixtures).

Refer to the linked documentation pages for deeper details on architecture, workflows, UI flows, and testing.

## Project import
The extension imports a project JSON on startup from `extension/local/import.json` (relative to the repo root). This overwrites the in-extension storage on each startup.

- This file is expected to be written by the Python runner.
- The folder `extension/local/` is git-ignored.
- If the file is missing, the UI starts empty.
