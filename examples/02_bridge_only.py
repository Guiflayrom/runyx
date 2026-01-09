import time
from runyx_bridge import Bridge


def main():
    bridge = Bridge(requests=True, websocket=True, on_background=True)
    bridge.start()
    print("Bridge running. Press Ctrl+C to stop.")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        pass
    bridge.stop()


if __name__ == "__main__":
    main()
