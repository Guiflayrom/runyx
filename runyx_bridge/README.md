# Runyx Bridge (MVP)

Runyx Bridge is an **extremely simple development library** designed to support and test the **Runyx Chromium extension**.

It provides:

- An embedded **HTTP server** to receive data from the extension  
- A **WebSocket server** used only as a trigger source  
- A **WebSocket sender** to emit trigger events  
- A `@receive` decorator that automatically becomes an HTTP route  
- Mandatory **multiprocessing execution**  
- **100% open CORS**  
- A usage style similar to `Flask`

> WARNING: This is a development MVP
> It is not intended for production use.

---

## Installation

```bash
pip install flask websockets colorama
```

(or use it as a local module during development)

---

## Concept

Runyx Bridge acts as a **local communication bridge** between:

- the Runyx browser extension  
- external scripts  
- development/testing tools  

Clear separation of responsibilities:

- **HTTP** -> receiving data (screenshots, cookies, page source, etc.)
- **WebSocket** -> triggers (events that start workflows)

---

## Project structure

```
runyx_bridge/
|-- __init__.py
|-- bridge.py
|-- decorators.py
|-- http_server.py
|-- websocket_server.py
`-- websocket_sender.py
```

---

## Usage

### Runyx App (Runner)

Use the Python runner to launch Edge or Chrome, load the extension, and import a project JSON before the browser opens.

```python
from runyx_bridge import RunyxApp

app = RunyxApp(
    browser="edge",
    extension_path="./extension",
    import_project_path="./my-first-project-project.json",
    require_import=True,
    on_background=False,
)

app.start()
```

Notes:
- `import_project_path` is required when `require_import=True`.
- The JSON is validated and copied to `extension/local/import.json`.
- The extension imports this file on startup and overwrites storage.
- If the file is missing or invalid, the runner raises before starting the browser.


### Minimal import

```python
from runyx_bridge import run, receive
```

---

## Creating HTTP endpoints with `@receive`

Each `@receive` decorator automatically registers an HTTP route.

```python
from runyx_bridge import run, receive


@receive("/receive")
def handle_anything(payload, meta):
    print(payload)
    return "ok"


@receive("/cookies")
def handle_cookies(payload, meta):
    return payload
```

### Handler parameters

- `payload`
  - JSON request -> dict / list
  - JSON request -> dict / list
- `meta`
  - request headers
  - HTTP method
  - request path
  - remote IP address

The handler return value is automatically returned as JSON.

---

## Starting the servers (`run`)

`run()` behaves similarly to `Flask.app.run()`.

```python
run(
    requests=True,
    websocket=True,
    on_background=False
)
```

---

## `run()` parameters

| Parameter | Default | Description |
|----------|---------|-------------|
| `host` | `"0.0.0.0"` | Server bind host |
| `http_port` | `5001` | HTTP server port |
| `ws_port` | `8765` | WebSocket server port |
| `requests` | `True` | Enable HTTP server |
| `websocket` | `True` | Enable WebSocket server |
| `on_background` | `True` | Run servers in background (daemon mode) |

> At least one of `requests` or `websocket` **must be True**.

---

## `on_background` behavior

### `on_background=True` (default)

```python
run(on_background=True)
print("script finished")
```

- Servers are started as **daemon processes**
- `run()` returns immediately
- When the main script exits, all servers are automatically stopped

Best for:
- scripts
- quick tools
- automation pipelines

---

### `on_background=False` (server mode)

```python
run(on_background=False)
```

- The main process blocks
- Behaves like a traditional server
- Stop with `Ctrl+C`

Best for:
- local development
- long-running usage with the extension

---

## CORS

The HTTP server has **fully open CORS** by default:

- Any origin allowed  
- Any method allowed  
- Any header allowed  

This is intentional to simplify integration with:

- Chrome extensions  
- local scripts  
- curl / Postman testing  

---

## WebSocket (Triggers)

The WebSocket server is used **only as a trigger mechanism**.

It:

- accepts connections  
- receives messages  
- logs received events  

It does **not**:

- broadcast messages  
- authenticate clients  
- manage channels or workflows  

---

## Sending WebSocket triggers (`send`)

```python
from runyx_bridge import send

send("ws://localhost:8765", "trigger-test")
```

You can send:

- plain strings  
- serialized JSON (optional)  

Typical usage:

- triggering workflows in the Runyx extension  
- simulating external systems  

---

## Terminal output

When servers start, Runyx Bridge prints helpful connection information.

### HTTP

```
[HTTP] server running
[HTTP] Local:    http://localhost:5001
[HTTP] Network:  http://192.168.0.23:5001
[HTTP] Ngrok:    ngrok http 5001
```

### WebSocket

```
[WS] server running
[WS] Local:    ws://localhost:8765
[WS] Network:  ws://192.168.0.23:8765
[WS] Ngrok:    ngrok http 8765   (use wss://)
```

---

## Using with ngrok

### HTTP server

```bash
ngrok http 5001
```

### WebSocket server

```bash
ngrok http 8765
```

> Use the `wss://` URL provided by ngrok in the Runyx WebSocket trigger settings.

---

## Quick test with curl

```bash
curl -X POST http://localhost:5001/receive \
  -H "Content-Type: application/json" \
  -d '{"hello":"world"}'
```

Response:

```json
{
  "ok": true,
  "result": "ok"
}
```

---

## What this MVP does NOT do

- Authentication  
- Persistence  
- Payload validation  
- Run history  
- UI  
- Production hardening  

All of this is **intentional**.

---

## Project goal

> To be the **smallest possible local bridge** between the Runyx extension and external systems during development.

Nothing more.
