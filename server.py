#!/usr/bin/env python3
"""A loopback-only, read-only adapter for the Mac's OpenMausBot map."""
import argparse
import datetime
import errno
import functools
import http.server
import json
import re
from pathlib import Path
import threading
import time
import urllib.request
import urllib.error
import urllib.parse
import webbrowser

ROOT = Path(__file__).resolve().parent / "dist"
BOT_FIELDS = ("demo", "id", "name", "title", "section", "chiefOfStaff", "hidden", "color", "mascotBody", "modelSelection", "busy", "activity")
CONFIG_FIELDS = BOT_FIELDS + ("description", "threadId", "computer", "cloudBackend", "autoStartVps", "cwd", "autoApprove", "approvalMode", "alwaysAllow", "toolScope", "speakReplies", "voice", "voiceNotes", "memoryEnabled", "notifications", "approvePeerComms", "connectorTools", "assignedSkills", "avatarCrop", "avatarZoom", "avatarFocusX", "avatarFocusY", "soulHash", "createdAt", "managedSections", "peers", "composio", "connectorScopes", "outbound", "fallback", "browser", "memoryUpkeep", "mcpServers", "browserProfile", "visibility", "installedPackage")
TASK_FIELDS = ("threadId", "title", "modelSelection", "cwd", "surface", "surfaceAuto", "approvalMode", "autoApprove", "alwaysAllow", "busy", "activity")
DEMO = False
NATIVE = urllib.request.build_opener(urllib.request.ProxyHandler({}))
_fleet_cache = None
_fleet_at = 0
_fleet_lock = threading.Lock()


def native_json(path):
    with NATIVE.open("http://127.0.0.1:8799" + path, timeout=3) as response:
        return json.load(response)


def demo_data():
    return json.loads((ROOT / "demo.json").read_text(encoding="utf-8"))


def fleet():
    if DEMO:
        return demo_data()
    global _fleet_cache, _fleet_at
    with _fleet_lock:
        if _fleet_cache is None or time.monotonic() - _fleet_at > 2:
            _fleet_cache = native_json("/api/bots?messages=0")
            _fleet_at = time.monotonic()
        return _fleet_cache


def find_bot(bot_id):
    return next((bot for bot in fleet()["bots"] if bot["id"] == bot_id and not bot.get("hidden")), None)


def bot_details(bot_id):
    if DEMO:
        data = demo_data()["details"].get(bot_id)
        if data is None:
            raise LookupError("Bot not found")
        return data
    bot = find_bot(bot_id)
    if bot is None:
        raise LookupError("Bot not found")
    soul = native_json("/api/bots/" + bot_id + "/soul")
    skills = native_json("/api/bots/" + bot_id + "/skills")
    return {"id": bot_id, "soul": soul.get("soul", ""), "skills": skills.get("skills", []), "assignedSkills": skills.get("assignedSkills", []), "configuration": {key: bot[key] for key in CONFIG_FIELDS if key in bot}, "conversations": [{key: task[key] for key in TASK_FIELDS if key in task} for task in bot.get("tasks", [])]}


def current_map():
    source = fleet()
    return {"bots": [{key: bot[key] for key in BOT_FIELDS if key in bot} for bot in source["bots"] if not bot.get("hidden")], "sections": source.get("sections", []), "live": not DEMO, "demo": DEMO, "capturedAt": datetime.datetime.now().astimezone().isoformat()}


class Handler(http.server.SimpleHTTPRequestHandler):
    def write_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def list_directory(self, path):
        self.send_error(404)
        return None

    def valid_request(self):
        port = self.server.server_port
        hosts = (f"127.0.0.1:{port}", f"localhost:{port}")
        origin = self.headers.get("Origin")
        return (self.headers.get("Host") in hosts
                and (not origin or origin in tuple("http://" + host for host in hosts))
                and self.headers.get("Sec-Fetch-Site") != "cross-site")

    def safe_static_path(self):
        path = urllib.parse.unquote(urllib.parse.urlsplit(self.path).path)
        relative = Path(path.lstrip("/"))
        return (not any(part.startswith(".") for part in relative.parts)
                and (ROOT / relative).resolve().is_relative_to(ROOT.resolve()))

    def do_HEAD(self):
        if not self.valid_request() or not self.safe_static_path():
            self.send_error(403)
            return
        super().do_HEAD()

    def do_GET(self):
        # Reject requests from other origins and DNS-rebinding hosts.
        if not self.valid_request():
            self.send_error(403)
            return
        if self.path == "/api/map":
            try:
                data = current_map()
            except Exception:
                data = demo_data()
                data.pop("details", None)
                data["live"] = False
            self.write_json(data)
        elif re.fullmatch(r"/api/bots/[\w-]+/details", self.path):
            try:
                self.write_json(bot_details(self.path.split("/")[3]))
            except LookupError:
                self.write_json({"error": "This bot is no longer available."}, 404)
            except Exception:
                self.write_json({"error": "OpenMausBot must be running to load this bot's soul, skills, and configuration."}, 503)
        elif re.fullmatch(r"/api/bots/[\w-]+/skills/[a-z0-9-]+", self.path):
            try:
                bot_id, name = self.path.split("/")[3], self.path.split("/")[5]
                if DEMO:
                    data = bot_details(bot_id)
                    skill = next((s for s in data["skills"] if s["name"] == name), None)
                    if skill is None:
                        raise LookupError()
                    self.write_json({"name": name, "text": skill["text"]})
                    return
                if find_bot(bot_id) is None:
                    raise LookupError()
                listing = native_json("/api/bots/" + bot_id + "/skills")
                skill = next((s for s in listing.get("skills", []) if s["name"] == name), None)
                if not skill:
                    raise LookupError()
                path = "/api/skills-library/" + name if skill.get("origin") == "library" else "/api/bots/" + bot_id + "/skills/" + name
                self.write_json({"name": name, "text": native_json(path).get("text", "")})
            except LookupError:
                self.write_json({"error": "Skill not found."}, 404)
            except Exception:
                self.write_json({"error": "Could not read this skill. Check that OpenMausBot is running."}, 503)
        elif self.path.startswith("/api/"):
            self.send_error(404)
        elif not self.safe_static_path():
            self.send_error(403)
        else:
            super().do_GET()

    def end_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("X-Frame-Options", "DENY")
        super().end_headers()

    def log_message(self, *_):
        pass


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--open", action="store_true")
    parser.add_argument("--demo", action="store_true", help="Use fictional bots; never contact OpenMausBot")
    parser.add_argument("--port", type=int, default=8808, help="Local dashboard port (default: 8808)")
    args = parser.parse_args()
    if not 1024 <= args.port <= 65535:
        parser.error("--port must be between 1024 and 65535")
    DEMO = args.demo
    url = f"http://127.0.0.1:{args.port}"
    try:
        server = http.server.ThreadingHTTPServer(("127.0.0.1", args.port), functools.partial(Handler, directory=str(ROOT)))
    except OSError as error:
        if error.errno == errno.EADDRINUSE and args.open:
            with NATIVE.open(url + "/api/map", timeout=3) as response:
                running = json.load(response)
            if isinstance(running.get("bots"), list) and "live" in running and bool(running.get("demo")) == DEMO:
                webbrowser.open(url)
                raise SystemExit(0)
        raise
    print(f"Team map: {url} — keep this window open; Ctrl+C to stop.", flush=True)
    if args.open:
        threading.Timer(0.5, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.server_close()
