"""Organic memory write-back — fail-safe client for the F3IL memory bridge.

When an SR run discovers a held-out-verified law that beats the prior best for
its dataset, the engine calls remember() here to feed it into F3!L's memory.
Same hard rule as metrics: this must NEVER take a run down. The POST happens on
a background daemon thread with a short timeout, and every failure (bridge
down, DNS, timeout, unset URL) is swallowed. A skipped write costs nothing but
a debug log line.

Config (env):
  MEMORY_API_URL   default http://memory-api:4300 (empty string disables)
  MEMORY_TIMEOUT_S request timeout, seconds (default 3)
"""

import json
import logging
import os
import threading
import urllib.parse
import urllib.request

log = logging.getLogger("sr_lab.memory")

_URL = os.getenv("MEMORY_API_URL", "http://memory-api:4300").strip().rstrip("/")
try:
    _TIMEOUT = max(1.0, float(os.getenv("MEMORY_TIMEOUT_S", "3")))
except ValueError:
    _TIMEOUT = 3.0

ENABLED = bool(_URL)


def _post(payload):
    """Best-effort POST /remember. Never raises."""
    try:
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            f"{_URL}/remember", data=data,
            headers={"Content-Type": "application/json"}, method="POST",
        )
        with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:
            resp.read()
    except Exception as exc:  # bridge down, timeout, DNS, anything
        log.debug("memory write skipped: %s", exc)


def remember(content, context="general", type="episodic",
             emotional_weight=0.0, tags=None):
    """Fire-and-forget memory write. Returns immediately; no-op when disabled."""
    if not ENABLED or not content:
        return
    payload = {
        "content": content,
        "context": context,
        "type": type,
        "emotional_weight": emotional_weight,
    }
    if tags:
        payload["tags"] = tags
    threading.Thread(target=_post, args=(payload,), name="memory-remember", daemon=True).start()


def recall(query, context=None, limit=3):
    """Blocking, best-effort memory read. Returns a list of hits (or []).

    Meant to be called off the request path (e.g. on a run's background
    thread). Never raises; a down bridge just yields no prior knowledge.
    """
    if not ENABLED or not query:
        return []
    try:
        params = {"query": query, "limit": limit}
        if context:
            params["context"] = context
        url = f"{_URL}/recall?" + urllib.parse.urlencode(params)
        with urllib.request.urlopen(url, timeout=_TIMEOUT) as resp:
            data = json.loads(resp.read())
        return data.get("results", []) or []
    except Exception as exc:
        log.debug("memory recall skipped: %s", exc)
        return []
