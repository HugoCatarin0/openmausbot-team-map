"""Exercise disclosure boundaries with fictional fixtures only."""
import functools
import http.server
import json
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch
import urllib.error
import urllib.request

import server


class AdapterTests(unittest.TestCase):
    def setUp(self):
        self.http = http.server.ThreadingHTTPServer(
            ("127.0.0.1", 0), functools.partial(server.Handler, directory=str(server.ROOT)))
        self.thread = threading.Thread(target=self.http.serve_forever, daemon=True)
        self.thread.start()
        self.url = "http://127.0.0.1:" + str(self.http.server_port)
        self.client = urllib.request.build_opener(urllib.request.ProxyHandler({}))

    def tearDown(self):
        self.http.shutdown()
        self.http.server_close()
        self.thread.join()

    def request(self, path, headers=None):
        request = urllib.request.Request(self.url + path, headers=headers or {})
        try:
            with self.client.open(request, timeout=5) as response:
                return response.status, response.read(), response.headers
        except urllib.error.HTTPError as error:
            return error.code, error.read(), error.headers

    def test_demo_never_contacts_native_api(self):
        with patch.object(server, "DEMO", True), patch.object(server, "native_json", side_effect=AssertionError("Native API contacted")):
            status, body, headers = self.request("/api/map")
            data = json.loads(body)
            self.assertEqual(status, 200)
            self.assertFalse(data["live"])
            self.assertTrue(data["demo"])
            self.assertEqual(len(data["bots"]), 10)
            self.assertNotIn("details", data)
            self.assertTrue(all(bot["id"].startswith("demo-") for bot in data["bots"]))
            self.assertEqual(headers["Cache-Control"], "no-store")
            bot_id = data["bots"][0]["id"]
            status, body, _ = self.request("/api/bots/" + bot_id + "/details")
            self.assertEqual(status, 200)
            detail = json.loads(body)
            self.assertIn("Fictional", detail["soul"])
            name = detail["skills"][0]["name"]
            status, body, _ = self.request("/api/bots/" + bot_id + "/skills/" + name)
            self.assertEqual(status, 200)
            self.assertIn("fictional", json.loads(body)["text"])

    def test_projection_excludes_messages_and_unlisted_fields(self):
        bot = {"id": "fixture-bot", "name": "Example", "soul": "private fixture", "messages": [{"text": "private fixture"}], "unlistedSensitiveField": "private fixture", "tasks": [{"threadId": "fixture-chat", "title": "Example", "messages": [{"text": "private fixture"}]}]}
        with patch.object(server, "DEMO", False), patch.object(server, "fleet", return_value={"bots": [bot]}), patch.object(server, "native_json", side_effect=lambda path: {"soul": "fictional instructions"} if path.endswith("/soul") else {"skills": []}):
            projected = server.current_map()["bots"][0]
            self.assertEqual(projected, {"id": "fixture-bot", "name": "Example"})
            detail = server.bot_details("fixture-bot")
            self.assertNotIn("soul", detail["configuration"])
            self.assertNotIn("messages", detail["configuration"])
            self.assertNotIn("unlistedSensitiveField", detail["configuration"])
            self.assertEqual(detail["conversations"], [{"threadId": "fixture-chat", "title": "Example"}])

    def test_rejects_cross_origin_and_rebinding_requests(self):
        for headers in ({"Origin": "https://example.invalid"}, {"Host": "example.invalid"}, {"Sec-Fetch-Site": "cross-site"}):
            self.assertEqual(self.request("/api/map", headers)[0], 403)

    def test_unknown_ids_and_unassigned_skills(self):
        with patch.object(server, "DEMO", True):
            self.assertEqual(self.request("/api/bots/unknown/details")[0], 404)
            self.assertEqual(self.request("/api/bots/demo-bot-01/skills/unassigned")[0], 404)

    def test_offline_uses_fictional_map(self):
        with patch.object(server, "DEMO", False), patch.object(server, "fleet", side_effect=ConnectionError()):
            status, body, _ = self.request("/api/map")
            data = json.loads(body)
            self.assertEqual(status, 200)
            self.assertTrue(data["demo"])
            self.assertFalse(data["live"])
            self.assertNotIn("details", data)
            self.assertEqual(self.request("/api/bots/fixture-bot/details")[0], 503)

    def test_no_parent_paths_dotfiles_or_directory_listing(self):
        self.assertEqual(self.request("/../server.py")[0], 403)
        self.assertEqual(self.request("/%2e%2e/server.py")[0], 403)
        self.assertEqual(self.request("/.env")[0], 403)
        self.assertEqual(self.request("/avatars/")[0], 404)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "dist"
            root.mkdir()
            secret = Path(directory) / "fixture.txt"
            secret.write_text("fictional fixture")
            (root / "linked.txt").symlink_to(secret)
            with patch.object(server, "ROOT", root):
                self.assertEqual(self.request("/linked.txt")[0], 403)


if __name__ == "__main__":
    unittest.main()
