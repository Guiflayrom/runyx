import json
from runyx_bridge import send


def main():
    payload = {
        "event": "trigger-test",
        "channel": "default",
        "token": "",
    }
    send("ws://localhost:8765", json.dumps(payload))


if __name__ == "__main__":
    main()
