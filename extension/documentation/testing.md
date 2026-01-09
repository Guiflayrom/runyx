# Testing, Fixtures, and Local Servers

Related guides: [Project overview](README.md) | [Architecture](architecture.md) | [Workflows and runner](automation-workflows.md) | [UI guide](ui.md)

This project ships small helper servers to exercise triggers and ingestion endpoints without external services.

## Local trigger server (`server.js`)
- Node/Express + `ws`. Starts HTTP on `http://localhost:8080` with:
  - WebSocket server at `/` (clients identified by `?clientId=`; defaults to `anon`).
  - POST `/trigger` accepts `{ clientId, action, payload }` and forwards JSON to the matching WS client.
- Usage: `npm install express ws` then `node server.js`. Point a WebSocket trigger to `ws://localhost:8080/?clientId=abc` and send actions via `curl -X POST http://localhost:8080/trigger -d '{"clientId":"abc","action":"run_login"}' -H "Content-Type: application/json"` to fire triggers.

## WebSocket test servers (`testing/servers`)
- `ws_test_server.py`: Asyncio broadcast server on `ws://localhost:8765` that logs messages and rebroadcasts to other clients (useful for listening with the extension and sending with a CLI).
- `ws_trigger_test.py`: Simple client that connects to a WS endpoint (default `ws://localhost:8765`) and sends an event string every 5 seconds. Run `python ws_trigger_test.py ws://localhost:8765 my_event`.
- Both require `pip install websockets`.

## Flask ingestion server (`testing/servers/flask_test_server.py`)
- Endpoints:
  - `GET /` returns status/help.
  - `POST/PUT /upload/`: accepts screenshots/data via JSON (base64 or data URL), multipart (`file` or `screenshot`), or raw body; saves to `testing/servers/uploads/`.
  - `POST/PUT /cookies/`: echoes received cookie payload.
  - `POST/PUT /page-source/`: saves posted HTML to disk and echoes metadata.
- Adds permissive CORS headers. Run with `python flask_test_server.py` (depends on `flask`).

## Workflow tips for testing
- Point **Send Cookies** or **Send Page Source** steps to the Flask server to verify payloads.
- Use a **Screenshot** step with `saveTo: downloads` to validate capture and file naming, or `saveTo: runnerArtifacts` to view artifacts in the Runs tab.
- Configure a **Webhook WS** trigger to the WS server and send events via `ws_trigger_test.py` to validate dedupe/filters.
- To test DOM/Browser triggers, open a target page, enable the trigger, and watch the Runs tab for automatic executions.
