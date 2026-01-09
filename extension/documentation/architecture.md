# Architecture and Runtime Flow

Related guides: [Project overview](README.md) | [Workflows and runner](automation-workflows.md) | [UI guide](ui.md) | [Testing utilities](testing.md)

## Surfaces and responsibilities
- **Service worker (`background.js`)**: Owns extension lifecycle, remembers the last host tab (`runyx:lastHostTabId`), wires the toolbar click to open the side panel, and forwards browser events (`tabs.onUpdated/Activated`, `webNavigation.onCompleted`) to the UI. Implements the `SANDBOX_RPC` command set (tabs, storage, downloads, cookies, page-source, screenshot delegation) and enforces content-script availability (`ensureContentScript`).
- **Content script -> sandbox**: Evaluate steps create a hidden iframe of `eval-sandbox.html` and exchange code/results over `postMessage`.
- **UI shell (`ui.html`, `devtools-panel.html`)**: Embeds `out/index.html` (built Next.js app) inside an iframe and loads `ui-bridge.js`.
- **UI -> SW (`SANDBOX_RPC`)**: UI requests are posted from the iframe to `ui-bridge.js`, then to the service worker. Supported payloads include `tabs.query`, `tabs.sendMessage`, storage get/set/remove/clear, cookie export, page-source export, and downloads.
- **Evaluation sandbox (`eval-sandbox.html`)**: Minimal page that receives code via `postMessage`, runs it in an isolated sandbox (no page CSP), echoes console logs, and returns results/errors.
- **Devtools page (`devtools.html`/`devtools.js`)**: Adds a "Runyx" panel inside Chrome DevTools that loads the same UI as the side panel.
- **Local helper servers**: `server.js` (Node/Express + WS relay) and scripts in `testing/servers/` to simulate triggers and ingestion endpoints.

## Messaging and RPC
- **UI -> SW (`SANDBOX_RPC`)**: UI requests are posted from the iframe to `ui-bridge.js`, then to the service worker. Supported payloads include `tabs.query`, `tabs.sendMessage`, storage get/set/remove/clear, cookie export, page-source export, and downloads.
- **SW -> UI push**: Browser event notifications (`automation:browserEvent`) and picker results (`automation:pick:*`) are sent via `chrome.runtime.sendMessage`; `ui-bridge.js` rebroadcasts to the iframe.
- **UI -> content script**: Workflow steps are dispatched with `tabs.sendMessage` to `contentScript.js` (`automation:run:step`, `automation:domCondition:wait`, selector picker commands).
- **Content script -> SW**: Screenshot delegation uses `runyx:capture-visible` which the service worker fulfills with `chrome.tabs.captureVisibleTab`.
- **Content script -> sandbox**: Evaluate steps create a hidden iframe of `eval-sandbox.html` and exchange code/results over `postMessage`.

## Permissions and storage
- Manifest permissions: `cookies`, `storage`, `sidePanel`, `scripting`, `tabs`, `activeTab`, `downloads`, `webNavigation`, `<all_urls>`.
- Storage keys: `runyx:lastHostTabId` (last clicked tab), `runyx:automation-state` (workflows, selections, runner state), `runyx:projects` (projects selection), plus any workflow variables saved during runs.

## Execution flow (high level)
1) User opens the side panel or DevTools panel; the UI loads inside `out/index.html`.
2) The UI requests Chrome APIs through `SANDBOX_RPC`; the worker routes to `chrome.tabs`, `chrome.storage`, `chrome.downloads`, etc.
- **UI -> content script**: Workflow steps are dispatched with `tabs.sendMessage` to `contentScript.js` (`automation:run:step`, `automation:domCondition:wait`, selector picker commands).
4) The content script performs DOM actions, waits, extracts data, captures screenshots, or evaluates code. Some actions call back into the worker (viewport capture, downloads).
5) Results are returned to the UI, which updates run state, variables, and artifacts. Uploads to user endpoints (cookies/page-source/screenshots) happen either in the worker (cookies/page source) or UI (screenshot uploads).

## Notable safeguards
- **Allowed sites check**: `allowed-sites.ts` blocks runs when the active tab URL is not whitelisted per workflow.
- **Screenshot rate limiting**: content script enforces a minimum delay (1.2s) between captures to avoid Chrome quotas.
- **Content-script injection**: `ensureContentScript` injects `contentScript.js` into the target tab if missing.
- **Evaluation isolation**: custom sandbox avoids running arbitrary code directly in the host page, bypassing page CSP/`unsafe-eval` restrictions.
