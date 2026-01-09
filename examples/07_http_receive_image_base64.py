import base64
import time
from runyx_bridge import Bridge, receive


@receive("/image")
def handle_image(payload, meta):
    if not isinstance(payload, dict):
        return "expected json payload"
    data = payload.get("data") or ""
    if not data:
        return "missing data field"
    try:
        raw = base64.b64decode(data, validate=True)
    except Exception:
        return "invalid base64"
    with open("received_image.png", "wb") as f:
        f.write(raw)
    print("saved received_image.png", len(raw), "bytes")
    return "ok"


def main():
    bridge = Bridge(requests=True, websocket=False, on_background=True)
    bridge.start()
    print("POST base64 to http://localhost:5001/image")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        pass
    bridge.stop()


if __name__ == "__main__":
    main()
