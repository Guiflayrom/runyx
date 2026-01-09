"""HTTP routing helpers for the lightweight Flask server."""

from flask import request, jsonify

_ROUTES = []


def receive(path, methods=None):
    """Register a handler for a given path and HTTP methods."""
    if methods is None:
        methods = ["POST", "PUT", "OPTIONS"]

    def decorator(func):
        _ROUTES.append({
            "path": path,
            "methods": methods,
            "handler": func,
        })
        return func

    return decorator


def register_routes(app):
    """Attach all registered handlers to the Flask app."""
    for route in _ROUTES:
        path = route["path"]
        methods = route["methods"]
        handler = route["handler"]

        def make_view(fn):
            def view():
                if request.method == "OPTIONS":
                    return ("", 204)

                payload = None
                if request.is_json:
                    payload = request.get_json(silent=True)
                else:
                    payload = request.get_data()

                meta = {
                    "headers": dict(request.headers),
                    "method": request.method,
                    "path": request.path,
                    "remote_addr": request.remote_addr,
                    "content_type": request.headers.get("Content-Type"),
                }

                result = fn(payload, meta)
                return jsonify({"ok": True, "result": result})

            return view

        # endpoint precisa ser único
        safe_path = path.strip("/").replace("/", "_") or "root"
        endpoint_name = f"receive_{handler.__name__}_{safe_path}"

        app.add_url_rule(
            path,
            endpoint=endpoint_name,
            view_func=make_view(handler),
            methods=methods,
        )
