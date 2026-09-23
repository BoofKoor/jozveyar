"""امضا در برابر نمونه‌های مرجع AWS — همان اعداد `packages/storage/src/sigv4.test.ts`."""

from datetime import datetime, timezone

from docworker.storage import EMPTY_SHA256, Credentials, canonical_query, sign_headers

CREDS = Credentials(
    access_key_id="AKIAIOSFODNN7EXAMPLE",
    secret_access_key="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    region="us-east-1",
)
DATE = datetime(2013, 5, 24, tzinfo=timezone.utc)
HOST = "https://examplebucket.s3.amazonaws.com"


def signature(headers):
    return headers["authorization"].rsplit("Signature=", 1)[1]


def test_get_with_range():
    headers = sign_headers(
        "GET", f"{HOST}/test.txt", {"range": "bytes=0-9"}, EMPTY_SHA256, CREDS, DATE
    )
    assert signature(headers) == "f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41"


def test_put_with_special_character_in_key():
    import hashlib

    headers = sign_headers(
        "PUT",
        f"{HOST}/test$file.text",
        {"date": "Fri, 24 May 2013 00:00:00 GMT", "x-amz-storage-class": "REDUCED_REDUNDANCY"},
        hashlib.sha256(b"Welcome to Amazon S3.").hexdigest(),
        CREDS,
        DATE,
    )
    assert signature(headers) == "98ad721746da40c64f1a55b78f14c238d841ea1380cd77a1b5971af0ece108bd"


def test_subresource_without_value():
    headers = sign_headers("GET", f"{HOST}/?lifecycle", {}, EMPTY_SHA256, CREDS, DATE)
    assert signature(headers) == "fea454ca298b7da1c68078a5d1bdbfbbe0d65c699e0f91ac7a200a0136783543"


def test_unsorted_query():
    headers = sign_headers("GET", f"{HOST}/?max-keys=2&prefix=J", {}, EMPTY_SHA256, CREDS, DATE)
    assert signature(headers) == "34b48302e7b5fa45bde8084f4b7868a86f0a534bc59db6670ed5711ef69dc6f7"


def test_canonical_query_keeps_empty_values():
    assert canonical_query([("uploads", ""), ("a", "x y")]) == "a=x%20y&uploads="


# ── فهرست، آپلود، حذف — روی یک S3 حافظه‌ای کوچک، از راه HTTP واقعی ──────────

import hashlib  # noqa: E402
import threading  # noqa: E402
import urllib.parse  # noqa: E402
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer  # noqa: E402

import pytest  # noqa: E402

from docworker.storage import S3Storage, StorageError, parse_list  # noqa: E402

LIST_PAGE = """<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <Name>jozveyar</Name><Prefix>fonts/</Prefix><KeyCount>2</KeyCount>
  <IsTruncated>true</IsTruncated><NextContinuationToken>tok/en+1=</NextContinuationToken>
  <Contents><Key>fonts/B Nazanin.ttf</Key><Size>61080</Size><ETag>"abc"</ETag></Contents>
  <Contents><Key>fonts/بی‌نازنین.ttf</Key><Size>7</Size><ETag>"def"</ETag></Contents>
</ListBucketResult>""".encode()


def test_parse_list_reads_objects_and_continuation():
    objects, token = parse_list(LIST_PAGE)
    assert [(o.key, o.size, o.etag) for o in objects] == [
        ("fonts/B Nazanin.ttf", 61080, "abc"),
        ("fonts/بی‌نازنین.ttf", 7, "def"),
    ]
    assert token == "tok/en+1="


def test_parse_list_last_page_has_no_token():
    objects, token = parse_list(b"<ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>")
    assert objects == [] and token is None


class FakeS3(BaseHTTPRequestHandler):
    """فقط همان که آداپتور لازم دارد؛ دو صفحه برای ListObjectsV2."""

    objects: dict[str, bytes] = {}
    seen: list[tuple[str, dict[str, str]]] = []

    def log_message(self, *args):
        pass

    def _key(self) -> str:
        path = urllib.parse.unquote(urllib.parse.urlsplit(self.path).path)
        return path.removeprefix("/jozveyar/")

    def do_PUT(self):
        body = self.rfile.read(int(self.headers["content-length"]))
        self.seen.append(("PUT", dict(self.headers)))
        if hashlib.sha256(body).hexdigest() != self.headers["x-amz-content-sha256"]:
            self.send_response(400)
            self.end_headers()
            return
        self.objects[self._key()] = body
        self.send_response(200)
        self.send_header("content-length", "0")
        self.end_headers()

    def do_GET(self):
        url = urllib.parse.urlsplit(self.path)
        query = dict(urllib.parse.parse_qsl(url.query))
        if query.get("list-type") == "2":
            keys = sorted(k for k in self.objects if k.startswith(query.get("prefix", "")))
            start = int(query.get("continuation-token", "0"))
            page = keys[start : start + 1]  # یک شیء در هر صفحه: صفحه‌بندی حتماً سنجیده می‌شود
            more = start + 1 < len(keys)
            items = "".join(
                f"<Contents><Key>{k}</Key><Size>{len(self.objects[k])}</Size>"
                f'<ETag>"{hashlib.md5(self.objects[k]).hexdigest()}"</ETag></Contents>'
                for k in page
            )
            token = f"<NextContinuationToken>{start + 1}</NextContinuationToken>" if more else ""
            body = (
                '<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">'
                f"<IsTruncated>{str(more).lower()}</IsTruncated>{token}{items}</ListBucketResult>"
            ).encode()
        elif self._key() in self.objects:
            body = self.objects[self._key()]
        else:
            self.send_response(404)
            self.end_headers()
            return
        self.send_response(200)
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_DELETE(self):
        if self.objects.pop(self._key(), None) is None:
            self.send_response(404)
        else:
            self.send_response(204)
        self.end_headers()


@pytest.fixture
def fake_s3():
    FakeS3.objects = {}
    FakeS3.seen = []
    server = ThreadingHTTPServer(("127.0.0.1", 0), FakeS3)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    storage = S3Storage(f"http://127.0.0.1:{server.server_port}", "jozveyar", CREDS, timeout=5)
    yield storage
    server.shutdown()


def test_upload_streams_file_with_its_hash_and_type(fake_s3, tmp_path):
    source = tmp_path / "font.ttf"
    source.write_bytes(b"\x00\x01\x00\x00" + b"x" * 5000)
    assert fake_s3.upload("fonts/B Nazanin.ttf", str(source), "font/ttf") == 5004
    assert FakeS3.objects["fonts/B Nazanin.ttf"] == source.read_bytes()
    _, headers = FakeS3.seen[-1]
    assert {k.lower(): v for k, v in headers.items()}["content-type"] == "font/ttf"


def test_list_follows_every_page(fake_s3, tmp_path):
    for name in ["a.ttf", "b.otf", "c.ttf"]:
        FakeS3.objects[f"fonts/{name}"] = name.encode()
    FakeS3.objects["uploads/x.pdf"] = b"%PDF"
    keys = [o.key for o in fake_s3.list_objects("fonts/")]
    assert keys == ["fonts/a.ttf", "fonts/b.otf", "fonts/c.ttf"]


def test_delete_is_idempotent_and_download_reports_missing(fake_s3, tmp_path):
    FakeS3.objects["fonts/a.ttf"] = b"x"
    fake_s3.delete("fonts/a.ttf")
    fake_s3.delete("fonts/a.ttf")  # دوباره: نبودن خطا نیست
    with pytest.raises(StorageError) as caught:
        fake_s3.download("fonts/a.ttf", str(tmp_path / "out"))
    assert caught.value.missing
