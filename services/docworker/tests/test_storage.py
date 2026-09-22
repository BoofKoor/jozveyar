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
