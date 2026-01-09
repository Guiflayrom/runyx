import pytest
from flask import Flask

from runyx_bridge.decorators import receive, register_routes
from runyx_bridge.bridge import Bridge
from runyx_bridge.app import RunyxApp


def make_test_app():
    app = Flask(__name__)

    @app.after_request
    def cors(response):
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Methods"] = "*"
        response.headers["Access-Control-Allow-Headers"] = "*"
        return response

    register_routes(app)
    return app


@receive("/receive")
def handle_receive(payload, meta):
    # SÃ³ devolve algo simples pra validar resposta
    return {
        "payloadType": "json" if isinstance(payload, (dict, list)) else "bytes",
        "method": meta.get("method"),
        "path": meta.get("path"),
    }


@receive("/cookies")
def handle_cookies(payload, meta):
    return payload


def test_receive_route_json_ok():
    app = make_test_app()
    client = app.test_client()

    resp = client.post("/receive", json={"hello": "world"})
    assert resp.status_code == 200

    data = resp.get_json()
    assert data["ok"] is True
    assert data["result"]["payloadType"] == "json"
    assert data["result"]["method"] == "POST"
    assert data["result"]["path"] == "/receive"

    # CORS open
    assert resp.headers.get("Access-Control-Allow-Origin") == "*"
    assert resp.headers.get("Access-Control-Allow-Methods") == "*"
    assert resp.headers.get("Access-Control-Allow-Headers") == "*"


def test_receive_route_bytes_ok():
    app = make_test_app()
    client = app.test_client()

    resp = client.post("/receive", data=b"raw-bytes", headers={"Content-Type": "application/octet-stream"})
    assert resp.status_code == 200

    data = resp.get_json()
    assert data["ok"] is True
    assert data["result"]["payloadType"] == "bytes"


def test_receive_options_returns_204():
    app = make_test_app()
    client = app.test_client()

    resp = client.options("/receive")
    assert resp.status_code == 204


def test_cookies_route_echo_json():
    app = make_test_app()
    client = app.test_client()

    payload = [{"name": "a", "value": "1"}]
    resp = client.post("/cookies", json=payload)
    assert resp.status_code == 200

    data = resp.get_json()
    assert data["ok"] is True
    assert data["result"] == payload


def test_bridge_requires_one_server_true():
    b = Bridge(requests=False, websocket=False, on_background=True)
    with pytest.raises(RuntimeError):
        b.start()


def test_runyxapp_start_calls_components(monkeypatch):
    calls = {"bridge_start": 0, "bridge_stop": 0, "browser_start": 0, "browser_stop": 0, "activate": 0}

    # Mock Bridge.start/stop
    def fake_bridge_start(self):
        calls["bridge_start"] += 1
        return []

    def fake_bridge_stop(self):
        calls["bridge_stop"] += 1

    monkeypatch.setattr("runyx_bridge.app.Bridge.start", fake_bridge_start)
    monkeypatch.setattr("runyx_bridge.app.Bridge.stop", fake_bridge_stop)

    # Mock BrowserSession.start/stop
    class DummyDriver:
        current_window_handle = "x"

        class switch_to:
            @staticmethod
            def window(_):
                return None

    def fake_browser_start(self):
        calls["browser_start"] += 1
        return DummyDriver()

    def fake_browser_stop(self):
        calls["browser_stop"] += 1

    monkeypatch.setattr("runyx_bridge.app.BrowserSession.start", fake_browser_start)
    monkeypatch.setattr("runyx_bridge.app.BrowserSession.stop", fake_browser_stop)

    # Mock ExtensionActivator.activate
    def fake_activate(self, driver):
        calls["activate"] += 1
        return True

    monkeypatch.setattr("runyx_bridge.app.ExtensionActivator.activate", fake_activate)

    app = RunyxApp(
        extension_path="./fake-extension",
        requests=True,
        websocket=True,
        on_background=True,   # nÃ£o entra no loop infinito
        auto_activate=True,
        keep_alive=False,
        require_import=False,
    )

    app.start()

    assert calls["bridge_start"] == 1
    assert calls["browser_start"] == 1
    assert calls["activate"] == 1

    app.stop()

    assert calls["browser_stop"] == 1
    assert calls["bridge_stop"] == 1

