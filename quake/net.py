"""HTTP with retries and an optional on-disk cache (used by backfills)."""
import os
import sys
import time
import urllib.error
import urllib.request

USER_AGENT = "portugal-quake-catalogue/3.0 (python-urllib)"


def fetch(url, cache_path=None, timeout=300, tries=5):
    """GET url and return the body as bytes; b"" when the service says there is no data.

    With cache_path, a cached copy is returned if present, and a fresh download is saved.
    """
    if cache_path and os.path.exists(cache_path):
        with open(cache_path, "rb") as f:
            return f.read()
    delay = 10
    for attempt in range(1, tries + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                body = b"" if r.status == 204 else r.read()
            break
        except urllib.error.HTTPError as e:
            if e.code in (204, 404):  # FDSN services answer "no events" with either
                body = b""
                break
            if attempt == tries or e.code not in (429, 500, 502, 503, 504):
                raise
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            if attempt == tries:
                raise
        print(f"    retry {attempt} in {delay}s: {url[:90]}", file=sys.stderr)
        time.sleep(delay)
        delay *= 2
    if cache_path:
        os.makedirs(os.path.dirname(cache_path) or ".", exist_ok=True)
        tmp = cache_path + ".part"
        with open(tmp, "wb") as f:
            f.write(body)
        os.replace(tmp, cache_path)
    return body
