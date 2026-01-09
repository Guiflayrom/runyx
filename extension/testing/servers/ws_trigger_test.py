import asyncio
import sys

try:
    import websockets  # type: ignore
except ImportError as exc:
    raise SystemExit("Install dependency first: pip install websockets") from exc


DEFAULT_ENDPOINT = "ws://localhost:8765"
DEFAULT_EVENT = "test"


async def run_sender(endpoint: str, event_name: str) -> None:
    print(f"[client] connecting to {endpoint} ...")
    async with websockets.connect(endpoint) as ws:
        print(f"[client] connected. Sending '{event_name}' every 5s (text). Ctrl+C to stop.")
        while True:
            await ws.send(event_name)
            print(f"[client] sent: {event_name}")
            await asyncio.sleep(5)


def main() -> None:
    endpoint = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_ENDPOINT
    event_name = sys.argv[2] if len(sys.argv) > 2 else DEFAULT_EVENT

    print(f"[client] using endpoint={endpoint} event={event_name}")

    try:
        asyncio.run(run_sender(endpoint, event_name))
    except KeyboardInterrupt:
        print("\n[client] stopped by user.")
    except Exception as exc:  # pragma: no cover - helper script
        raise SystemExit(f"Failed to run sender: {exc}") from exc


if __name__ == "__main__":
    main()
