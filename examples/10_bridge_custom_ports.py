import time
from runyx_bridge import Bridge


def main():
    bridge = Bridge(host="127.0.0.1", http_port=5055, ws_port=8787, requests=True, websocket=True)
    bridge.start()
    print("HTTP: http://127.0.0.1:5055 | WS: ws://127.0.0.1:8787")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        pass
    bridge.stop()


if __name__ == "__main__":
    main()
