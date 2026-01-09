import time
from runyx_bridge import Bridge, receive


@receive("/receive")
def handle_payload(payload, meta):
    print("[receive] payload:", payload)
    print("[receive] meta:", meta)
    return "ok"


def main():
    bridge = Bridge(requests=True, websocket=False, on_background=True)
    bridge.start()
    print("POST to http://localhost:5001/receive")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        pass
    bridge.stop()


if __name__ == "__main__":
    main()
