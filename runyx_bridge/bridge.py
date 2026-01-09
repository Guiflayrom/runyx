"""Bridge process manager for HTTP and WebSocket servers."""

import multiprocessing
from .http_server import start_http_server
from .websocket_server import start_ws_server


def _safe_set_start_method():
    """Prefer spawn to avoid fork-related issues on Windows."""
    try:
        multiprocessing.set_start_method("spawn")
    except Exception:
        pass


class Bridge:
    """Start and stop HTTP and WebSocket servers in child processes."""
    def __init__(
        self,
        host="0.0.0.0",
        http_port=5001,
        ws_port=8765,
        requests=True,
        websocket=True,
        on_background=True,
    ):
        self.host = host
        self.http_port = http_port
        self.ws_port = ws_port
        self.requests = requests
        self.websocket = websocket
        self.on_background = on_background
        self.processes = []

    def start(self):
        """Start the requested servers and optionally block."""
        _safe_set_start_method()

        if not self.requests and not self.websocket:
            raise RuntimeError("At least one of requests or websocket must be True")

        self.processes = []

        if self.requests:
            p_http = multiprocessing.Process(
                target=start_http_server,
                args=(self.host, self.http_port),
                daemon=self.on_background,
            )
            self.processes.append(p_http)
            p_http.start()

        if self.websocket:
            p_ws = multiprocessing.Process(
                target=start_ws_server,
                args=(self.host, self.ws_port),
                daemon=self.on_background,
            )
            self.processes.append(p_ws)
            p_ws.start()

        # background: return immediately
        if self.on_background:
            return self.processes

        # foreground: block like a server
        try:
            for p in self.processes:
                p.join()
        except KeyboardInterrupt:
            self.stop()

        return self.processes

    def stop(self):
        """Terminate running child processes."""
        for p in self.processes:
            try:
                if p.is_alive():
                    p.terminate()
                    p.join(1)
                    if p.is_alive():
                        p.kill()
            except Exception:
                pass


def run(
    host="0.0.0.0",
    http_port=5001,
    ws_port=8765,
    requests=True,
    websocket=True,
    on_background=True,
):
    """Convenience helper to start the Bridge with defaults."""
    b = Bridge(
        host=host,
        http_port=http_port,
        ws_port=ws_port,
        requests=requests,
        websocket=websocket,
        on_background=on_background,
    )
    return b.start()
