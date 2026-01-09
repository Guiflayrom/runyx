import base64
import uuid
from pathlib import Path
from datetime import datetime, timezone

from flask import Flask, request, jsonify

UPLOAD_DIR = Path(__file__).parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

app = Flask(__name__)


@app.after_request
def add_cors_headers(response):
  response.headers["Access-Control-Allow-Origin"] = "*"
  response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, OPTIONS"
  response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Requested-With"
  return response


@app.route("/", methods=["GET"])
def index():
  print('ok get')
  return jsonify(
    ok=True,
    message="Flask test server is running. Send POST/PUT to /upload.",
    instructions="curl -X POST http://localhost:5001/upload -H 'Content-Type: application/json' -d '{\"hello\":\"world\"}'",
  )


@app.route("/upload/", methods=["OPTIONS"])
def upload_options():
  return ("", 204)


@app.route("/upload/", methods=["POST", "PUT"])
def upload():
  """
  Accepts:
  - JSON with base64 string in fields: screenshot (default), data, image, file, dataUrl
  - data URLs starting with data:image/...;base64,
  - multipart form-data with a file part named 'file' or 'screenshot'
  Saves the decoded image to uploads/ and echoes metadata.
  """
  json_body = request.get_json(silent=True) or {}
  raw_body = request.get_data()
  headers = {k: v for k, v in request.headers.items()}

  def extract_base64(payload: bytes | str | None) -> tuple[str | None, str]:
    if not payload:
      return None, "empty payload"
    if isinstance(payload, bytes):
      payload = payload.decode("utf-8", errors="ignore")
    # data URL?
    if payload.startswith("data:image"):
      try:
        meta, b64data = payload.split(",", 1)
      except ValueError:
        return None, "invalid data URL"
      return b64data, meta.split(";")[0].split("/")[-1] or "png"
    # plain base64
    return payload, "png"

  def sanitize_filename(name: str, ext_hint: str):
    stem = name.rsplit(".", 1)[0] if "." in name else name
    ext = name.rsplit(".", 1)[1] if "." in name else ext_hint or "png"
    safe_stem = stem.replace("/", "_").replace("\\", "_").replace("..", "_")
    safe_ext = ext.replace("/", "_").replace("\\", "_").replace(".", "")
    base = f"{safe_stem}.{safe_ext}".strip(".")
    return base or f"upload.{safe_ext}"

  def decode_and_save(b64data: str, ext_hint: str, desired_name: str | None = None):
    try:
      binary = base64.b64decode(b64data, validate=True)
    except Exception as err:  # noqa: BLE001
      raise ValueError(f"failed to decode base64: {err}") from err

    ext = ext_hint or "png"
    if desired_name:
      fname = sanitize_filename(desired_name, ext)
    else:
      fname = f"screenshot_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}.{ext}"
    out_path = UPLOAD_DIR / fname
    out_path.write_bytes(binary)
    return out_path, len(binary)

  saved_path = None
  size_bytes = None
  error = None

  # 1) multipart file
  if "file" in request.files or "screenshot" in request.files:
    file = request.files.get("file") or request.files.get("screenshot")
    if file and file.filename:
      data = file.read()
      fname = file.filename or "upload.bin"
      out_path = UPLOAD_DIR / fname
      out_path.write_bytes(data)
      saved_path = out_path
      size_bytes = len(data)

  # 2) JSON base64 fields
  if saved_path is None:
    for key in ["screenshot", "data", "image", "file", "dataUrl"]:
      b64data = json_body.get(key)
      if not b64data:
        continue
      try:
        saved_path, size_bytes = decode_and_save(*extract_base64(b64data), desired_name=json_body.get("fileName"))
      except Exception as err:  # noqa: BLE001
        error = str(err)
      break

  # 3) raw body base64 / data URL
  if saved_path is None and raw_body:
    try:
      saved_path, size_bytes = decode_and_save(*extract_base64(raw_body))
    except Exception as err:  # noqa: BLE001
      error = error or str(err)

  # 4) fallback: save raw body as text/binary if still not saved
  if saved_path is None:
    fallback_bytes = raw_body if raw_body else (str(json_body).encode("utf-8") if json_body else b"")
    if fallback_bytes:
      fname = f"raw_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}.txt"
      out_path = UPLOAD_DIR / fname
      out_path.write_bytes(fallback_bytes)
      saved_path = out_path
      size_bytes = len(fallback_bytes)
      error = None

  ok = saved_path is not None and size_bytes is not None
  response = {
    "ok": ok,
    "route": "/upload",
    "method": request.method,
    "saved": str(saved_path) if saved_path else None,
    "sizeBytes": size_bytes,
    "error": error,
    "contentType": headers.get("Content-Type"),
    "json": json_body if json_body else None,
    "rawPreview": raw_body.decode("utf-8", errors="ignore")[:200] if raw_body else None,
  }
  print(f"[upload] {request.method} ct={headers.get('Content-Type')} json_keys={list(json_body.keys())} saved={response['saved']}")
  status = 200 if ok else 400
  return jsonify(response), status


@app.route("/cookies/", methods=["OPTIONS"])
def cookies_options():
  return ("", 204)


@app.route("/cookies/", methods=["POST", "PUT"])
def cookies():
  json_body = request.get_json(silent=True) or {}
  raw_body = request.get_data(as_text=True)
  cookie_payload = json_body.get("cookies") or json_body.get("cookie") or []
  cookie_all = json_body.get("cookieAll")
  cookie_domain = json_body.get("cookieDomain")
  cookie_names = json_body.get("cookieNames")

  print("[cookies] json:", json_body)
  print("[cookies] raw:", raw_body)

  return jsonify(
    ok=True,
    route="/cookies",
    method=request.method,
    received={
      "cookieAll": cookie_all,
      "cookieDomain": cookie_domain,
      "cookieNames": cookie_names,
      "cookieCount": len(cookie_payload) if hasattr(cookie_payload, "__len__") else None,
    },
    cookies=cookie_payload,
    raw=raw_body,
  )


@app.route("/page-source/", methods=["OPTIONS"])
def page_source_options():
  return ("", 204)


@app.route("/page-source/", methods=["POST", "PUT"])
def page_source():
  json_body = request.get_json(silent=True) or {}
  raw_body = request.get_data(as_text=True) if request.data else ""
  html = json_body.get("html") or ""
  tab_url = json_body.get("tabUrl")
  timestamp = json_body.get("timestamp")
  length = json_body.get("length") or len(html)

  file_name = f"page_source_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}.html"
  out_path = UPLOAD_DIR / file_name
  try:
    out_path.write_text(html if isinstance(html, str) else str(html), encoding="utf-8")
  except Exception as err:  # noqa: BLE001
    print("[page-source] failed to save html:", err)

  print(f"[page-source] len={length} url={tab_url} saved={out_path}")

  return jsonify(
    ok=True,
    route="/page-source",
    method=request.method,
    length=len(html),
    tabUrl=tab_url,
    timestamp=timestamp,
    saved=str(out_path),
    rawPreview=(raw_body or "")[:200],
  )


if __name__ == "__main__":
  app.run(host="0.0.0.0", port=5001, debug=True)
