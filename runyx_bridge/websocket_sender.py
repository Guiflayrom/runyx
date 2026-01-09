"""Simple WebSocket sender for triggering workflows."""

import asyncio
import websockets


async def _send(endpoint, message):
    """Send a single message to a WebSocket endpoint."""
    async with websockets.connect(endpoint) as ws:
        await ws.send(message)


def send(endpoint, message):
    """Public helper that runs the async sender."""
    asyncio.run(_send(endpoint, message))
    print(f"[WS-SENDER] sent: {message} -> {endpoint}")
