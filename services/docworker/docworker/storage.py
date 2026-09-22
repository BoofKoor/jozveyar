"""
آداپتور استوریج کارگر (ADR-008) — فقط همان که کارگر لازم دارد: دانلود.

مثل `packages/storage` بدون SDK: امضای SigV4 دست‌نویس با کتابخانهٔ استاندارد،
که با همان نمونه‌های مرجع مستندات AWS تست می‌شود (`tests/test_storage.py`).
boto3 از ۲۰۲۵ هم مثل SDK جاوااسکریپت checksum پیش‌فرض اضافه می‌کند و ده‌ها
مگابایت وابستگی می‌آورد، برای یک GET.

آدرس از `S3_ENDPOINT` می‌آید. کارگری که روزی روی نود دیگری اجرا شود فقط
همین متغیر را متفاوت دارد؛ کد عوض نمی‌شود.
"""

from __future__ import annotations

import hashlib
import hmac
import os
import shutil
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone

EMPTY_SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"


def _uri_encode(value: str) -> str:
    # RFC 3986، همان که SigV4 می‌خواهد: فقط A-Z a-z 0-9 - _ . ~ کد نمی‌شوند.
    return urllib.parse.quote(value, safe="-_.~")


def canonical_path(path: str) -> str:
    return "/".join(_uri_encode(part) for part in path.split("/"))


def canonical_query(params: list[tuple[str, str]]) -> str:
    encoded = sorted((_uri_encode(k), _uri_encode(v)) for k, v in params)
    return "&".join(f"{k}={v}" for k, v in encoded)


def _hmac(key: bytes, msg: str) -> bytes:
    return hmac.new(key, msg.encode("utf-8"), hashlib.sha256).digest()


@dataclass(frozen=True)
class Credentials:
    access_key_id: str
    secret_access_key: str
    region: str


def sign_headers(
    method: str,
    url: str,
    headers: dict[str, str],
    payload_hash: str,
    credentials: Credentials,
    now: datetime,
) -> dict[str, str]:
    """هدرهای امضاشده. `headers` با حروف کوچک؛ host و x-amz-* خودکار."""
    parsed = urllib.parse.urlsplit(url)
    stamp = now.strftime("%Y%m%dT%H%M%SZ")
    date_stamp = stamp[:8]
    all_headers = {
        **headers,
        "host": parsed.netloc,
        "x-amz-date": stamp,
        "x-amz-content-sha256": payload_hash,
    }
    names = sorted(all_headers)
    canonical_headers = "".join(f"{n}:{' '.join(all_headers[n].strip().split())}\n" for n in names)
    signed_headers = ";".join(names)
    query = urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)
    canonical_request = "\n".join(
        [
            method,
            canonical_path(urllib.parse.unquote(parsed.path)),
            canonical_query(query),
            canonical_headers,
            signed_headers,
            payload_hash,
        ]
    )
    scope = f"{date_stamp}/{credentials.region}/s3/aws4_request"
    string_to_sign = "\n".join(
        [
            "AWS4-HMAC-SHA256",
            stamp,
            scope,
            hashlib.sha256(canonical_request.encode("utf-8")).hexdigest(),
        ]
    )
    key = _hmac(("AWS4" + credentials.secret_access_key).encode("utf-8"), date_stamp)
    key = _hmac(key, credentials.region)
    key = _hmac(key, "s3")
    key = _hmac(key, "aws4_request")
    signature = hmac.new(key, string_to_sign.encode("utf-8"), hashlib.sha256).hexdigest()

    sent = {k: v for k, v in all_headers.items() if k != "host"}
    sent["authorization"] = (
        f"AWS4-HMAC-SHA256 Credential={credentials.access_key_id}/{scope}, "
        f"SignedHeaders={signed_headers}, Signature={signature}"
    )
    return sent


class StorageError(Exception):
    """خطای استوریج. `missing` یعنی فایل نیست — تلاش دوباره فایده ندارد."""

    def __init__(self, message: str, *, missing: bool = False):
        super().__init__(message)
        self.missing = missing


class S3Storage:
    def __init__(self, endpoint: str, bucket: str, credentials: Credentials, timeout: float = 60):
        self.endpoint = endpoint.rstrip("/")
        self.bucket = bucket
        self.credentials = credentials
        self.timeout = timeout

    @classmethod
    def from_env(cls, env: dict[str, str] | None = None) -> "S3Storage":
        env = dict(os.environ) if env is None else env
        return cls(
            endpoint=env["S3_ENDPOINT"],
            bucket=env["S3_BUCKET"],
            credentials=Credentials(
                access_key_id=env["S3_ACCESS_KEY"],
                secret_access_key=env["S3_SECRET_KEY"],
                region=env.get("S3_REGION") or "us-east-1",
            ),
        )

    def _url(self, key: str) -> str:
        return f"{self.endpoint}{canonical_path(f'/{self.bucket}/{key}')}"

    def download(self, key: str, destination: str) -> int:
        """فایل را جریانی روی دیسک می‌نویسد — کل فایل هیچ‌وقت در حافظه نیست."""
        url = self._url(key)
        headers = sign_headers(
            "GET", url, {}, EMPTY_SHA256, self.credentials, datetime.now(timezone.utc)
        )
        request = urllib.request.Request(url, headers=headers, method="GET")
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response, open(
                destination, "wb"
            ) as out:
                shutil.copyfileobj(response, out, length=1024 * 1024)
        except urllib.error.HTTPError as error:
            raise StorageError(f"GET {key} → {error.code}", missing=error.code == 404) from error
        except OSError as error:
            raise StorageError(f"GET {key}: {error}") from error
        return os.path.getsize(destination)
