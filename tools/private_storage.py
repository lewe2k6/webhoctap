"""Upload approved reader copies and verify remote objects before declaring availability."""

import os
from pathlib import Path
import re

from catalog import load_json, sha256


def approved_files(path, index):
    manifest = load_json(path)
    if manifest.get("version") != 1 or not isinstance(manifest.get("approved"), list):
        raise ValueError("Tệp duyệt PDF cần version 1 và danh sách approved")

    approved = {}
    root = Path(index["sourceRoot"]).resolve(strict=True)
    for entry in manifest["approved"]:
        digest = entry.get("sha256")
        basis = entry.get("basis")
        if not isinstance(digest, str) or digest not in index["readerFiles"]:
            raise ValueError(f"SHA-256 không phải bản PDF chuẩn trong danh mục: {digest!r}")
        if not isinstance(basis, str) or not basis.strip():
            raise ValueError(f"Ghi căn cứ được phép lưu kho riêng cho {digest}")
        if digest in approved:
            raise ValueError(f"Duyệt PDF bị lặp: {digest}")

        record = index["readerFiles"][digest]
        source = (root / record["path"]).resolve(strict=True)
        if not source.is_relative_to(root) or sha256(source) != digest:
            raise ValueError(f"PDF đã thay đổi hoặc nằm ngoài thư mục nguồn: {source}")
        approved[digest] = {"path": source, "bytes": record["bytes"], "objectKey": f"pdf/{digest}.pdf"}
    return approved


def r2_client():
    from boto3 import client
    from botocore.config import Config

    required = ("R2_ACCOUNT_ID", "R2_BUCKET", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY")
    missing = [name for name in required if not os.environ.get(name)]
    if missing:
        raise ValueError("Thiếu biến môi trường R2: " + ", ".join(missing))

    account_id = os.environ["R2_ACCOUNT_ID"]
    bucket = os.environ["R2_BUCKET"]
    if not re.fullmatch(r"[0-9a-f]{32}", account_id) or not re.fullmatch(r"[a-z0-9][a-z0-9-]{1,61}[a-z0-9]", bucket):
        raise ValueError("R2_ACCOUNT_ID hoặc R2_BUCKET sai định dạng")

    storage = client(
        "s3", endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com", region_name="auto",
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        config=Config(
            signature_version="s3v4", s3={"addressing_style": "path"},
            request_checksum_calculation="when_required", response_checksum_validation="when_required",
        ),
    )
    return storage, bucket


def ensure_object(storage, bucket, digest, record, upload):
    from botocore.exceptions import ClientError

    key = record["objectKey"]
    try:
        info = storage.head_object(Bucket=bucket, Key=key)
    except ClientError as exc:
        if exc.response["Error"]["Code"] not in ("404", "NoSuchKey", "NotFound"):
            raise
        if not upload:
            raise ValueError(f"Chưa có PDF trên R2: {key}. Chạy r2-upload trước khi tạo seed.") from exc
        storage.upload_file(str(record["path"]), bucket, key, ExtraArgs={
            "ContentType": "application/pdf", "CacheControl": "private, no-store",
            "Metadata": {"sha256": digest},
        })
        info = storage.head_object(Bucket=bucket, Key=key)

    if (info.get("ContentLength") != record["bytes"] or info.get("Metadata", {}).get("sha256") != digest
            or info.get("ContentType") != "application/pdf"):
        raise ValueError(f"Đối tượng R2 có dữ liệu kiểm chứng khác PDF đã duyệt: {key}")


def verify_approved_objects(approved, upload=False):
    if not approved:
        return {}

    storage, bucket = r2_client()
    for digest, record in approved.items():
        ensure_object(storage, bucket, digest, record, upload)
    return {digest: record["objectKey"] for digest, record in approved.items()}
