"""Minimal WebSocket trigger server."""

import asyncio
import socket
import websockets
from colorama import Fore, init

init(autoreset=True)


def _get_local_ip():
    """Return a best-effort LAN IP for display."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


async def ws_handler(websocket):
    """Echo incoming trigger events to the console."""
    print(Fore.BLUE + "[WS] client connected")
    try:
        async for message in websocket:
            print(Fore.WHITE + f"[WS] trigger received: {message}")
    except Exception:
        pass
    finally:
        print(Fore.BLUE + "[WS] client disconnected")


async def _run_ws(host, port):
    """Start the WebSocket server and block forever."""
    real_ip = _get_local_ip()

    print()
    print(Fore.CYAN + "[WS] server running")
    print(Fore.GREEN + f"[WS] Local:    ws://localhost:{port}")
    print(Fore.YELLOW + f"[WS] Network:  ws://{real_ip}:{port}")
    print(Fore.MAGENTA + f"[WS] Ngrok:    ngrok http {port}   (use wss://)")
    print()

    async with websockets.serve(ws_handler, host, port):
        await asyncio.Future()


def start_ws_server(host, port):
    """Entry point for the WS server process."""
    try:
        asyncio.run(_run_ws(host, port))
    except (KeyboardInterrupt, asyncio.CancelledError):
        print(Fore.YELLOW + "[WS] stopping...")
