import asyncio
import websockets

HOST = "localhost"
PORT = 8765

# Keep track of connected clients so we can broadcast incoming events.
clients: set[websockets.WebSocketServerProtocol] = set()


async def broadcast(message: str, origin: websockets.WebSocketServerProtocol) -> None:
    """Send the message to every other connected client."""
    if not clients:
        return
    alive: list[websockets.WebSocketServerProtocol] = []
    for client in clients:
        # Some websockets versions expose .closed, others don't; guard with getattr.
        if getattr(client, "closed", False):
            continue
        # Avoid echoing back to the sender to keep logs tidy.
        if client is origin:
            alive.append(client)
            continue
        try:
            await client.send(message)
            alive.append(client)
        except Exception:
            # Drop dead connections silently for this simple test server.
            pass
    clients.clear()
    clients.update(alive)


async def handle_client(websocket):
    clients.add(websocket)
    print(f"[server] client connected: {websocket.remote_address} | subprotocol={websocket.subprotocol}")
    try:
        while True:
            msg = await websocket.recv()  # keep the connection alive
            channel = None
            try:
                import json

                data = json.loads(msg)
                if isinstance(data, dict):
                    channel = data.get("channel")
            except Exception:
                pass

            if channel:
                print(f"[server] received: {msg} | channel={channel}")
            else:
                print(f"[server] received: {msg}")

            # Forward the raw message to all other listeners (e.g. the extension).
            await broadcast(msg, websocket)
    except websockets.ConnectionClosed:
        print("[server] client disconnected")
    finally:
        clients.discard(websocket)


async def main():
    async with websockets.serve(handle_client, HOST, PORT):
        print(f"[server] listening on ws://{HOST}:{PORT}")
        print("Press Ctrl+C to stop. Messages are logged and broadcast.")
        await asyncio.Future()  # run forever


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[server] stopped by user")
