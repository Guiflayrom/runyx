import time
from runyx_bridge import Bridge, receive


@receive("/image-raw", methods=["POST"])
def handle_image_raw(payload, meta):
    if not isinstance(payload, (bytes, bytearray)):
        return "expected raw bytes"
    with open("received_image_raw.bin", "wb") as f:
        f.write(payload)
    print("saved received_image_raw.bin", len(payload), "bytes")
    return "ok"


def main():
    bridge = Bridge(requests=True, websocket=False, on_background=True)
    bridge.start()
    print("POST raw bytes to http://localhost:5001/image-raw")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        pass
    bridge.stop()


if __name__ == "__main__":
    main()
