import os
import threading
import time

from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv()

MONGO_URI = os.getenv("MONGO_URI") or os.getenv("MONGODB_URI")
MONGO_CONNECT_RETRIES = int(os.getenv("MONGO_CONNECT_RETRIES", "20"))
MONGO_CONNECT_DELAY_MS = int(os.getenv("MONGO_CONNECT_DELAY_MS", "2000"))
DB_NAME = os.getenv("MONGO_DB_NAME", "visionattend")

_lock = threading.Lock()
_client = None
_db = None
_faces = None
_indexes_ready = False


def _connect_with_retry():
    if not MONGO_URI:
        raise RuntimeError("MONGO_URI is missing. Check your environment configuration")

    last_error = None

    for attempt in range(1, MONGO_CONNECT_RETRIES + 1):
        try:
            client = MongoClient(
                MONGO_URI,
                serverSelectionTimeoutMS=5000,
                connectTimeoutMS=5000,
                maxPoolSize=50,
            )
            client.admin.command("ping")
            print(f"[opencv.mongo] connected attempt={attempt}")
            return client
        except Exception as exc:
            last_error = exc
            print(
                f"[opencv.mongo] connect failed attempt={attempt}/{MONGO_CONNECT_RETRIES}: {exc}"
            )
            if attempt < MONGO_CONNECT_RETRIES:
                time.sleep(MONGO_CONNECT_DELAY_MS / 1000)

    raise RuntimeError(f"MongoDB connection failed after retries: {last_error}")


def ensure_named_index(collection, name, keys, **kwargs):
    try:
        indexes = list(collection.list_indexes())
        existing = next((item for item in indexes if item.get("name") == name), None)
        expected_key = dict(keys)

        if existing and dict(existing.get("key", {})) != expected_key:
            try:
                collection.drop_index(name)
                print(f"[opencv.mongo] dropped outdated index={name}")
            except Exception:
                pass

        collection.create_index(keys, name=name, **kwargs)
        print(f"[opencv.mongo] index ready={name}")
    except Exception as exc:
        print(f"[opencv.mongo] index error name={name}: {exc}")


def _ensure_connected():
    global _client, _db, _faces, _indexes_ready

    if _faces is not None:
        return _faces

    with _lock:
        if _faces is not None:
            return _faces

        _client = _connect_with_retry()
        _db = _client[DB_NAME]
        _faces = _db["faces"]

        print("[opencv.mongo] USING DB:", DB_NAME)

        if not _indexes_ready:
            try:
                ensure_named_index(_faces, "idx_faces_user", [("userId", 1)])
                ensure_named_index(_faces, "idx_faces_subject", [("subjectId", 1)])
                ensure_named_index(
                    _faces,
                    "idx_faces_user_subject",
                    [("userId", 1), ("subjectId", 1)],
                )
                ensure_named_index(
                    _faces,
                    "idx_faces_embedding_hash",
                    [("embeddingHash", 1)],
                    unique=True,
                    sparse=True,
                )
                print("[opencv.mongo] indexes ready")
            except Exception as error:
                print(f"[opencv.mongo] index setup failed: {error}")
            _indexes_ready = True

    return _faces


def get_faces_collection():
    return _ensure_connected()


def get_mongo_status():
    try:
        collection = _ensure_connected()
        collection.database.client.admin.command("ping")
        return {
            "connected": True,
            "dbName": DB_NAME,
        }
    except Exception as exc:
        return {
            "connected": False,
            "dbName": DB_NAME,
            "error": str(exc),
        }
