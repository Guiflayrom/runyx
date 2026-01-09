"""Embedded Flask HTTP server with open CORS for local development."""

import socket
import logging
from flask import Flask, cli
from colorama import Fore, init
from .decorators import register_routes

init(autoreset=True)
cli.show_server_banner = lambda *args, **kwargs: None


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


def start_http_server(host, port):
    """Start the Flask server and register @receive routes."""
    app = Flask(__name__)
    cli.show_server_banner = lambda *args, **kwargs: None
    app.logger.setLevel(logging.ERROR)
    app.logger.disabled = True
    logging.getLogger("werkzeug").setLevel(logging.ERROR)
    logging.getLogger("werkzeug").disabled = True

    @app.after_request
    def cors(response):
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Methods"] = "*"
        response.headers["Access-Control-Allow-Headers"] = "*"
        return response

    register_routes(app)

    real_ip = _get_local_ip()

    print()
    print(Fore.CYAN + "[HTTP] server running")
    print(Fore.GREEN + f"[HTTP] Local:    http://localhost:{port}")
    print(Fore.YELLOW + f"[HTTP] Network:  http://{real_ip}:{port}")
    print(Fore.MAGENTA + f"[HTTP] Ngrok:    ngrok http {port}")
    print()

    app.run(
        host=host,
        port=port,
        debug=False,
        use_reloader=False,
    )
