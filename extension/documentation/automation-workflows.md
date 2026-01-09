# Automation Workflows and Runner Semantics

Related guides: [Project overview](README.md) | [Architecture](architecture.md) | [UI guide](ui.md) | [Testing utilities](testing.md)

This document describes how workflows, triggers, steps, variables, and the runner behave. Types come from `automation-popup-design/lib/automation-types.ts` and runtime logic from `components/automation-provider.tsx` plus `contentScript.js`.

## Data model
- **Workflow**: `id`, `name`, `description`, `status` (idle/running/error/paused), `steps`, `triggers`, `variables`, `runs`, `settings`, counters (`runCount`, `lastRun`).
- **Triggers** (`TriggerType`): `webhookWs`, `browserEvent`, `domCondition`, `schedule`; each has `enabled`, `config`, `createdAt`, optional `lastEvent`.
- **Steps**: linear list of atomic steps or `if-else` blocks (`ConditionalBlock` with `condition`, `ifSteps`, `elseSteps`).
- **Runs**: execution instances with step timeline, status, duration, trigger source, context (tab/url/variables), and optional artifacts (e.g., screenshots).
- Trigger -> run policy: `triggerPolicy.mode` (single/restart/parallel) with `parallelLimit`; runner also tracks active runs per workflow.

## Templating and variables
- Template resolution uses `applyRequestTemplate`: `{{vars.*}}`, `{{workflow}}`, `{{step}}`, `{{url}}`, `{{timestamp}}`, etc.
- Runtime variables start from the workflow `variables` map and are updated by steps (`saveAs`/`saveTo` or variable setter).
- `normalizeVarName` strips `vars.` prefixes; saved values become available as `{{vars.key}}` in later steps.

## Triggers
- **WebSocket** (`webhookWs`): connects to `wf.settings.wsEndpoint`; fires when a message matches `eventName` (plus optional channel/auth token). Dedupes with `dedupeWindowMs`. Connection lifecycle is managed with reconnects and per-workflow sockets.
- **Browser event**: responds to `navigation:completed`, `tabs:updated`, or `tabs:activated` broadcast by the service worker. Supports URL match modes (host equals, contains, regex), debounce, run-once-per-session, and "only if tab active".
- **DOM condition**: polls a tab (active tab or any tab matching regex) by sending `automation:domCondition:wait` to the content script. Conditions: selector appears/disappears, text contains, attribute equals, element enabled. Supports cooldowns and fire-every-time.
- **Schedule**: timers inside the UI (not OS-level). Modes: every N minutes, every N ms, daily at HH:MM (local/UTC), cron-like expression (minute precision) with optional jitter.
- Trigger -> run policy: `triggerPolicy.mode` (single/restart/parallel) with `parallelLimit`; runner also tracks active runs per workflow.

## Step types (contentScript execution)
All step payloads are sent as `{ type: "automation:run:step", step }` to `contentScript.js` via `tabs.sendMessage`.

- **click**: waits for selector, scrolls into view, dispatches single or double click.
- **type**: waits for selector, focuses, sets value (inputs, textareas, selects, contentEditable), fires input/change events. Accepts `value` or `valueSource` (fixed/request).
- **select**: waits for `<select>`, chooses by value or text, dispatches change.
- **wait**: `waitConfig` with modes `selectorAppears/Visible/Hidden/Disappears`, `textContains`, `attributeEquals`, `elementEnabled`, `urlMatches`, `time`. Strategies: mutation observer or polling; supports stability window.
- **scroll**: `scrollType` `toSelector`, `intoView`, `toPosition`, `byAmount`; configurable behavior/block/inline.
- **extract**: pulls `text`, `textContent`, `html`, `value`, or attribute; multiple modes (first/all with join), regex extraction, trimming, default values, optional type casting (`auto/string/number/boolean/json`), optional failure on empty. Saves to variable when configured.
- **screenshot**: modes `viewport`, `fullPage`, `element`; formats png/jpeg, quality, max width resize, filename template, save destinations (`downloads`, `varsBase64`, `runnerArtifacts`), optional server upload with templated headers/body. Respect rate limit in the content script.
- **evaluate**: runs JS in sandbox (`eval-sandbox.html`) to bypass site CSP/`unsafe-eval`. Modes: `expression` or `function`, arguments with typed parsing, expects type validation, optional `failOnFalsy`, optional save result to variable (with `saveOnlyIfOk`). Target tab can be current, specific id, or first tab matching regex.
- **request**: UI-side HTTP request with templated URL/body/headers/content-type/JSON-path extraction and optional save to variable. Supports retry config when using value sources.
- **sendCookies**: service-worker RPC reads cookies (all or named/domain filtered) from target tab and POST/PUTs JSON to `serverUrl` with custom headers.
- **sendPageSource**: service-worker RPC gathers doctype + `documentElement.outerHTML` from the tab via content script and POST/PUTs to `serverUrl`.
- **fallback**: executes arbitrary async code in the page context as a last-resort handler.
- **condition:check** (block): evaluates `if-else` conditions in the content script (selectors, visibility, text/attribute checks, URL matches, regex, variable comparisons).

## Failure handling and control flow
- Per-step `onFailure`: `stop` (default), `skip`, `goto` (jump to another step id), `fallback` (run provided code). Goto guards against loops (max iterations based on step count).
- Each step has `timeout` and `retries` (retry logic handled by the runner per workflow `maxRetries` for full-run retries).
- If-else blocks run a selected branch; branch steps carry their own failure policies. Branch statuses are appended to the run timeline with `IF`/`ELSE` labels.
- Cancelling: `requestStopRunner` flips a stop flag; pending/running steps are marked skipped with "Cancelled".

## Runner lifecycle
1) Resolve target tab (active tab or provided context). Store `lastKnownTab`.
2) Enforce allowed-site check (`allowed-sites.ts`). If blocked, run fails early.
3) Create a Run with pending step timeline; mark runner active.
4) Execute steps sequentially with `performAtomicStep`; update run state after each step.
5) Save variables/artifacts as steps complete. Uploads (cookies/page source/screenshots) occur during steps.
6) On completion/failure/cancel, mark run status, duration, and error; clear runner active flag and remove run from `activeRuns` tracker.
7) Global retries: rerun the entire workflow up to `settings.maxRetries` when the final status is failed and stop flag is not set.

## Selector picker
- Triggered from the UI via `tabs.sendMessage {type:"picker:start"}`; the content script draws an overlay, tracks mouse, and returns a generated CSS-like selector (`automation:pick:done`). ESC cancels. Bridge forwards results to the UI to prefill step selectors.
