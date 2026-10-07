"""Object storage abstraction. Videos/images never live in the DB.

Backends:
  - LocalBackend: dev — files under STORAGE_DIR, served via signed URLs
    through /api/files/{token}.
  - S3Backend: prod — boto3 presigned URLs (S3-compatible).
"""
import hashlib
import os
from abc import ABC, abstractmethod

from ..config import get_settings
from ..security import hmac_sign

settings = get_settings()
CHUNK = 1024 * 1024


class StorageBackend(ABC):
    @abstractmethod
    def save(self, data: bytes, key: str, content_type: str) -> str:
        """Persist bytes under key. Returns the storage key."""

    @abstractmethod
    def save_file(self, path: str, key: str, content_type: str) -> str:
        """Persist a local file."""

    @abstractmethod
    def get_signed_url(self, key: str, expires_seconds: int | None = None) -> str:
        """Time-limited URL a browser can use directly."""

    @abstractmethod
    def delete(self, key: str) -> None: ...

    @abstractmethod
    def exists(self, key: str) -> bool: ...


class LocalBackend(StorageBackend):
    def __init__(self, base_dir: str | None = None, base_url: str = "/api/files"):
        self.base_dir = base_dir or settings.STORAGE_DIR
        self.base_url = base_url
        os.makedirs(self.base_dir, exist_ok=True)

    def _path(self, key: str) -> str:
        safe = key.replace("..", "").lstrip("/")
        return os.path.join(self.base_dir, safe)

    def save(self, data: bytes, key: str, content_type: str) -> str:
        path = self._path(key)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as f:
            f.write(data)
        return key

    def save_file(self, path: str, key: str, content_type: str) -> str:
        dest = self._path(key)
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        with open(path, "rb") as src, open(dest, "wb") as dst:
            while chunk := src.read(CHUNK):
                dst.write(chunk)
        return key

    def get_signed_url(self, key: str, expires_seconds: int | None = None) -> str:
        from ..db import utcnow
        exp = int(utcnow().timestamp()) + (expires_seconds or settings.FILE_URL_TTL_SECONDS)
        payload = f"{key}:{exp}"
        sig = hmac_sign(payload)
        return f"{self.base_url}/{sig}/{exp}/{key}"

    def delete(self, key: str) -> None:
        try:
            os.remove(self._path(key))
        except FileNotFoundError:
            pass

    def exists(self, key: str) -> bool:
        return os.path.exists(self._path(key))

    def resolve(self, key: str) -> str:
        """Local path for a key (used by the /api/files streamer after verifying)."""
        return self._path(key)


class S3Backend(StorageBackend):
    def __init__(self):
        import boto3

        if not settings.S3_BUCKET:
            raise RuntimeError("S3_BUCKET is not configured")
        self.bucket = settings.S3_BUCKET
        self.client = boto3.client(
            "s3",
            endpoint_url=settings.S3_ENDPOINT_URL,
            region_name=settings.S3_REGION,
            aws_access_key_id=settings.S3_ACCESS_KEY,
            aws_secret_access_key=settings.S3_SECRET_KEY,
        )

    def save(self, data: bytes, key: str, content_type: str) -> str:
        self.client.put_object(Bucket=self.bucket, Key=key, Body=data, ContentType=content_type)
        return key

    def save_file(self, path: str, key: str, content_type: str) -> str:
        self.client.upload_file(path, self.bucket, key, ExtraArgs={"ContentType": content_type})
        return key

    def get_signed_url(self, key: str, expires_seconds: int | None = None) -> str:
        return self.client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self.bucket, "Key": key},
            ExpiresIn=expires_seconds or settings.FILE_URL_TTL_SECONDS,
        )

    def delete(self, key: str) -> None:
        self.client.delete_object(Bucket=self.bucket, Key=key)

    def exists(self, key: str) -> bool:
        try:
            self.client.head_object(Bucket=self.bucket, Key=key)
            return True
        except Exception:
            return False


def get_storage() -> StorageBackend:
    if settings.STORAGE_BACKEND == "s3":
        return S3Backend()
    return LocalBackend()


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()
