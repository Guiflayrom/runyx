# Examples

These scripts show common ways to use the Runyx bridge and runner.

## 01_run_app.py
- Starts the full RunyxApp (HTTP + WS + browser) with an import JSON.

## 02_bridge_only.py
- Starts only the HTTP + WebSocket bridge.

## 03_http_receive.py
- Registers a `/receive` HTTP endpoint with `@receive`.

## 04_send_ws_trigger.py
- Sends a plain-text WebSocket trigger message.

## 05_run_app_no_import.py
- Runs RunyxApp without requiring an import file and without auto-activation.

## 06_run_app_system_profile.py
- Uses the system browser profile (extension already installed).

## 07_http_receive_image_base64.py
- Receives a base64 image payload and writes `received_image.png`.

## 08_http_receive_image_raw.py
- Receives raw bytes and writes `received_image_raw.bin`.

## 09_send_ws_json.py
- Sends a JSON payload over WebSocket with event/channel/token fields.

## 10_bridge_custom_ports.py
- Starts the bridge on custom host/ports.
