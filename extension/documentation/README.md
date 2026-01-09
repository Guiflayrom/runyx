# Runyx Extension Documentation

This repository contains the Runyx browser extension and its UI source. The extension lets you design, run, and trigger browser automations with a visual builder, while the background/content scripts execute actions inside web pages and bridge data back to your workflows.

## Documentation index
- [Architecture and runtime flow](architecture.md)
- [Automation workflows, triggers, and runner semantics](automation-workflows.md)
- [Automation Studio UI guide](ui.md)
- [Testing utilities and local servers](testing.md)

## What's inside
- Extension surfaces: Manifest V3 service worker (`background.js`), always-on content script (`contentScript.js`), side panel/devtools UI (`ui.html` + `out/`), devtools page, and an evaluation sandbox (`eval-sandbox.html`).
- Automation Studio UI source: the Next.js app in `automation-popup-design/` (built output lives in `out/`).
- Runtime helpers: message bridge (`ui-bridge.js`), local trigger server (`server.js`), and test servers in `testing/servers/`.

## How to run the extension
1) In Chrome, open `chrome://extensions`, enable *Developer mode*, click *Load unpacked*, and select this folder.
2) Click the Runyx toolbar icon (or press `Ctrl+Shift+F` anywhere in Chrome). The side panel opens `ui.html`, which embeds the Automation Studio.
3) To open inside DevTools, open the browser DevTools and pick the "Runyx" tab (loads the same UI).
4) The content script is injected on all pages; the service worker ensures it is present when workflows send actions.

## Quick start with the Automation Studio
- Use the *Workflows* tab to duplicate or create a workflow and define variables.
- Use *Triggers* to hook runs to WebSocket events, browser navigation, DOM conditions, or schedules.
- Use *Steps* to add click/type/wait/extract/screenshot/HTTP/page-source/cookie steps. The selector picker talks to the content script to capture CSS selectors.
- Use *Runs* to inspect history and artifacts (e.g., screenshots saved by the runner).
- Use *Settings* to configure allowed sites, WebSocket endpoints, storage/cookie permissions, and default timeouts/retries.

## Key behaviors to know
- The UI communicates with the service worker through `ui-bridge.js` using `postMessage` RPC; the worker forwards `SANDBOX_RPC` payloads to Chrome APIs.
- Automations execute inside the target tab via `contentScript.js` (DOM actions, screenshots, extraction, evaluation) and return results to the UI.
- Sensitive actions (cookies, storage, page source) are gated by workflow settings and allowlist checks in `allowed-sites.ts`.

See the other documents in `documentation/` for detailed architecture, workflow semantics, UI flows, and testing utilities.
