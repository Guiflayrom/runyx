# Automation Studio UI

Related guides: [Project overview](README.md) | [Architecture](architecture.md) | [Workflows and runner](automation-workflows.md) | [Testing utilities](testing.md)

The Automation Studio is a Next.js app compiled into `out/` and embedded by `ui.html`/`devtools-panel.html`. Source files live under `automation-popup-design/`.

## Layout and navigation
- **Project selector** (`ProjectProvider`): persists projects (`runyx:projects`), lets you group workflows. Default project contains sample workflows.
- **Top bar** (`TopBar`): pick the active workflow, start/stop runs, open selector picker, and trigger "Add step" flows.
- **Tabs** (`AutomationStudio`):
  - *Workflows*: list, create, duplicate, delete workflows; edit name/description/status.
  - *Triggers*: add/manage trigger types (WebSocket webhook, browser event, DOM condition, schedule) with inline form controls and status badges.
  - *Steps*: full step editor. Supports selector picking, drag reorder, inline enable/disable, retries/timeouts, on-failure policies, goto/fallback, value sources, server uploads, assertions, and nested if/else blocks.
  - *Runs*: timeline of past runs with status, per-step durations, errors, and artifacts (screenshots when saved to runner artifacts). Includes run counts and last-run timestamps.
  - *Settings*: workflow-level settings (allowed sites list with favicon, WebSocket endpoint/connect status toggles, verbose logging, cookie/storage flags, default timeout/retries, trigger run policy).

## Selector picker workflow
- Clicking "Pick selector" sends `picker:start` to the content script, which overlays the active page. The chosen selector is returned via `automation:pick:done` and prefilled into the step modal. ESC cancels (`automation:pick:cancel`).

## Step editors (highlights)
- **Click/Type/Select**: wait + scroll-into-view, selector required, timeout configurable.
- **Wait**: mutation-observer or polling strategies with stability windows.
- **Scroll**: target selector or coordinates; smooth/instant behavior.
- **Extract**: choose data type, regex, multiple/all vs first, default/fail-on-empty, casting, optional server upload (URL/method/headers/body template).
- **Screenshot**: viewport/full/element, format/quality, filename template, max width resize, save destination (download, varsBase64, runner artifacts), optional server upload.
- **Evaluate**: mode (expression/function), target tab (current/specific/id by regex), args with type parsing, expected result validation, save result, fail-on-falsy.
- **HTTP Request**: templated URL/body/headers/content type, JSON path extraction, save to variable.
- **Cookies/Page source**: configure server URL/method/headers, cookie scope (all/domain/named).
- **Flow control**: per-step `onFailure` (stop/skip/goto/fallback) and goto targets; branch editor for `if-else` blocks with condition builder.

## Triggers UI
- WebSocket: endpoint in Settings (per workflow), trigger name/event/channel/token/dedupe window, connect/disconnect indicator.
- Browser: choose event (navigation completed, tab updated/activated), URL match type/value, debounce, run once per session, active-tab gating.
- DOM condition: selector/text/attribute checks, cooldown, target tab scope (current or regex-matched), fire once/every time.
- Schedule: every minutes/ms, daily at (with timezone), cron-like expression, jitter, run-if-browser-closed flag (UI timer only).

## Runs and artifacts
- The Runs tab shows a list with trigger source (manual/websocket/browser/dom/schedule), durations, and errors.
- Step timeline includes IF/ELSE branch markers. Runner artifacts (screenshots) can be previewed when saved via screenshot steps (`saveTo: runnerArtifacts`).

## Themes and styling
- Dark-first palette defined in `app/globals.css` with oklch variables. Components use the custom UI kit in `components/ui/*` plus icons from `lucide-react`.
