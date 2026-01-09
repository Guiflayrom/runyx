<h1 align="center">Runyx Project Overview</h1>

<p align="center">
  <img src="https://github.com/Guiflayrom/runyx/blob/main/image/stepsreen.png" alt="Steps Screen" width="300" />
  <br />
  <em>An easy pattern to scrap for beginners and for low-hanging fruit automations.</em>
</p>

This repository contains **Runyx**, a browser automation platform composed of a **Chromium extension** and a **local Python runtime** used for development, testing, and orchestration.

At a high level:

- The **Chromium extension** provides the Automation Studio UI and executes automations in the browser.
- The **Runyx Bridge** is a lightweight local server (HTTP + WebSocket) used during development.
- The **Runyx App (Runner)** is an object-oriented Python entrypoint that:
  - starts the Bridge
  - launches Edge or Chrome via Selenium (non-headless)
  - loads the extension
  - imports a project JSON on startup (from `extension/local/import.json`)
  - activates the extension via hotkey

Each component can be used independently, but together they form the full local Runyx development experience.

---

## Repository structure

```
/
extension/          # Chromium extension (runtime + UI)
runyx_bridge/       # Python bridge + runner (MVP)
README.md           # <- this file
```

Each main folder has its **own README** with deeper details:

- `extension/README.md` - extension usage and UI
- `runyx_bridge/README.md` - Python bridge and runner details
- `examples/README.md`

This root README explains **how everything fits together**.

---

## Core components

### 1) Chromium extension

The extension contains:

- **Runtime**
  - Service Worker
  - Content Script
  - Bridge between UI and page context
- **Automation Studio UI**
  - Built with Next.js
  - Embedded into the extension
  - Also available inside DevTools

The extension is responsible for:

- Managing workflows, triggers, and steps
- Executing DOM actions (click, type, wait, extract, screenshot, etc.)
- Collecting artifacts (cookies, page source, screenshots)
- Communicating with Runyx Bridge (HTTP + WebSocket)

Load it locally via:

```
chrome://extensions -> Developer mode -> Load unpacked -> extension/
```

For Edge:

```
edge://extensions -> Developer mode -> Load unpacked -> extension/
```

The UI can be opened via:
- Extension icon
- `Ctrl + Shift + F`
- DevTools tab ("Runyx")

---

### 2) Runyx Bridge (MVP)

Runyx Bridge is a **development-only** Python library that exposes:

- **HTTP server**
  - Receives data from the extension
  - Endpoints are defined via decorators
  - CORS is fully open (by design)
- **WebSocket server**
  - Used only as a trigger source
  - Emits events that start workflows in the extension

Key characteristics:

- Minimal by design (MVP)
- No authentication
- No persistence
- No production guarantees

It exists solely to support **local development and testing**.

See full details in `runyx_bridge/README.md`.

---

### 3) Runyx App (Python Runner)

The **Runyx App** is the orchestration layer that ties everything together.

It is responsible for:

1. Starting Runyx Bridge (HTTP + WebSocket)
2. Launching Edge or Chrome using Selenium **in non-headless mode**
3. Loading the Runyx extension (unpacked)
4. Importing a project JSON from `extension/local/import.json`
5. Sending the activation hotkey (`Ctrl + Shift + F`)
6. Keeping the environment alive (server mode) or exiting cleanly

This makes it possible to:

- Start the entire Runyx stack with a single Python script
- Test the extension without manual browser setup
- Automate local development flows

---

## Typical local development flow

1) Start Runyx using the Python runner
2) Edge/Chrome opens normally (non-headless)
3) The Runyx extension is loaded automatically
4) The project JSON is imported into storage
5) The extension UI is activated via hotkey
6) Automation Studio is ready to use
7) HTTP + WebSocket endpoints are available locally

---

## Example: minimal runner usage

```python
from runyx_bridge import RunyxApp

app = RunyxApp(
    extension_path="./extension",
    import_project_path="./my-first-project-project.json",
    require_import=True,
    requests=True,
    websocket=True,
    on_background=False,  # server mode
)

app.start()
```

---

## Using Runyx Bridge standalone

The Bridge can also be used **without Selenium** if you prefer to:

- open Edge or Chrome manually
- load the extension yourself
- trigger workflows via WebSocket
- receive data via HTTP

Example:

```python
from runyx_bridge import run, receive

@receive("/receive")
def handle_data(payload, meta):
    print(payload)
    return "ok"

run(requests=True, websocket=True, on_background=False)
```

---

## How communication works (high level)

- **WebSocket**
  - External systems Bridge Extension
  - Used only for triggers
- **HTTP**
  - Extension Bridge
  - Used for screenshots, cookies, page source, extracts, etc.

The extension always remains the execution authority.

---

## Installation (Python side)

This project is intended to be used in **editable / development mode**.

Using Poetry (recommended):

```bash
poetry install
poetry run pytest
```

Or using pip:

```bash
pip install -e .
```

---

## Important notes

- Runyx Bridge is **not production software**
- CORS is fully open intentionally
- Selenium runs Edge or Chrome **non-headless**
- Hotkey activation depends on OS window focus
- The extension can also be used manually without the runner
- Project data is imported on startup from `extension/local/import.json`

---

## Documentation map

- `README.md` (this file) - project overview
- `extension/README.md` - extension usage and UI
- `extension/documentation/README.md` - architecture and internals
- `runyx_bridge/README.md` - Python bridge and runner details
- examples/README.md -> runnable bridge/runner examples

---

## Project goal

> Provide a **clear, minimal, and hackable local environment** for developing and testing browser automations using the Runyx Chromium extension.

Nothing more, nothing less.

