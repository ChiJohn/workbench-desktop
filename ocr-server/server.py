#!/usr/bin/env python3
"""本机 OCR 服务：只听 127.0.0.1，供工作台 HTTP 调用。"""

from __future__ import annotations

import json
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

# Paddle 3.3 on Windows CPU hits an oneDNN bug. Plain inference still works.
os.environ["PADDLE_PDX_ENABLE_MKLDNN_BYDEFAULT"] = "0"
os.environ["PADDLE_PDX_MODEL_SOURCE"] = "modelscope"
os.environ["PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK"] = "True"

HOST = "127.0.0.1"
PORT = int(os.environ.get("WORKBENCH_OCR_PORT", "17890"))

_ocr = None
_vl = None
_ocr_error = None
_vl_error = None


def texts_from(result):
    lines = []
    for item in result or []:
        data = item
        if hasattr(item, "json"):
            try:
                data = item.json
            except Exception:
                data = item
        if isinstance(data, dict):
            res = data.get("res") or data
            if isinstance(res, dict) and res.get("rec_texts"):
                lines.extend(str(x) for x in res.get("rec_texts") or [])
        elif isinstance(item, list):
            for line in item:
                if isinstance(line, list) and len(line) > 1 and isinstance(line[1], (list, tuple)) and line[1]:
                    lines.append(str(line[1][0]))
    return "\n".join(x for x in lines if x).strip()


def ensure_ocr():
    global _ocr, _ocr_error
    if _ocr is not None or _ocr_error:
        return
    try:
        from paddleocr import PaddleOCR

        _ocr = PaddleOCR(lang="ch")
    except Exception as exc:
        _ocr_error = str(exc)


def ensure_vl():
    global _vl, _vl_error
    if _vl is not None or _vl_error:
        return
    try:
        from paddleocr import PaddleOCRVL

        _vl = PaddleOCRVL()
    except Exception as exc:
        _vl_error = str(exc)


def run_text(path: str) -> tuple[str, str | None]:
    ensure_ocr()
    if _ocr_error:
        return "", "文字识别失败：" + _ocr_error
    if _ocr is None:
        return "", "文字识别失败：模型没有加载"
    try:
        if hasattr(_ocr, "predict"):
            text = texts_from(_ocr.predict(path))
        else:
            text = texts_from(_ocr.ocr(path, cls=False))
        return text, None
    except Exception as exc:
        return "", "文字识别失败：" + str(exc)


def run_meaning(path: str) -> tuple[str, str | None]:
    ensure_vl()
    if _vl_error:
        return "", "图意识别失败：" + _vl_error
    if _vl is None:
        return "", "图意识别失败：模型没有加载"
    try:
        parts = []
        for item in _vl.predict(path) or []:
            md = getattr(item, "markdown", None)
            if md is None and isinstance(item, dict):
                md = item.get("markdown")
            if isinstance(md, dict):
                parts.append(str(md.get("markdown_texts") or md.get("text") or ""))
            elif isinstance(md, str):
                parts.append(md)
        return "\n".join(x for x in parts if x).strip(), None
    except Exception as exc:
        return "", "图意识别失败：" + str(exc)


def recognize(path: str, mode: str) -> dict:
    text, meaning, errors = "", "", []
    if mode in ("text", "all"):
        text, err = run_text(path)
        if err:
            errors.append(err)
    if mode in ("meaning", "all"):
        meaning, err = run_meaning(path)
        if err:
            errors.append(err)
    return {"text": text, "meaning": meaning, "error": "；".join(errors)}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write("[ocr] " + (fmt % args) + "\n")

    def _json(self, code: int, body: dict) -> None:
        raw = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self) -> None:
        if urlparse(self.path).path != "/health":
            self._json(404, {"ok": False, "error": "not found"})
            return
        paddle = True
        try:
            import paddleocr  # noqa: F401
        except Exception:
            paddle = False
        self._json(200, {"ok": True, "paddle": paddle})

    def do_POST(self) -> None:
        if urlparse(self.path).path != "/ocr":
            self._json(404, {"ok": False, "error": "not found"})
            return
        length = int(self.headers.get("Content-Length") or "0")
        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8") if length else "{}")
        except Exception:
            self._json(400, {"text": "", "meaning": "", "error": "请求不是 JSON"})
            return
        path = str(payload.get("path") or "").strip()
        mode = str(payload.get("mode") or "text").strip() or "text"
        if mode not in ("text", "meaning", "all"):
            self._json(400, {"text": "", "meaning": "", "error": "mode 只能是 text、meaning 或 all"})
            return
        if not path or not os.path.isfile(path):
            self._json(400, {"text": "", "meaning": "", "error": "图片不存在"})
            return
        self._json(200, recognize(path, mode))


def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    sys.stderr.write(f"[ocr] listening on http://{HOST}:{PORT}\n")
    sys.stderr.flush()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
