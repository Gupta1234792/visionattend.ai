import os
import threading
import time

from dotenv import load_dotenv
from pymongo import MongoClient

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ENV_PATH = os.path.join(BASE_DIR, "..", ".env")
load_dotenv(dotenv_path=ENV_PATH)

MONGO_URI = os.getenv("MONGO_URI") or os.getenv("MONGODB_URI")
MONGO_CONNECT_RETRIES = int(os.getenv("MONGO_CONNECT_RETRIES", "20"))
MONGO_CONNECT_DELAY_MS = int(os.getenv("MONGO_CONNECT_DELAY_MS", "2000"))
DB_NAME = os.getenv("MONGO_DB_NAME") or "visionattend"

_lock = threading.Lock()
_client = None
_db = None
_faces = None
_indexes_ready = False


def _connect_with_retry():
    if not MONGO_URI:
        raise RuntimeError("MONGO_URI is missing")

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
            print(f"[mongo] connected attempt={attempt}")
            return client
        except Exception as exc:
            last_error = exc
            print(f"[mongo] connect failed attempt={attempt} error={exc}")
            if attempt < MONGO_CONNECT_RETRIES:
                time.sleep(MONGO_CONNECT_DELAY_MS / 1000)

    raise RuntimeError(f"MongoDB connection failed: {last_error}")


def ensure_named_index(collection, name, keys, **kwargs):
    try:
        collection.create_index(keys, name=name, **kwargs)
        print(f"[mongo] index ready={name}")
    except Exception as exc:
        print(f"[mongo] index error name={name} error={exc}")


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

        if not _indexes_ready:
            ensure_named_index(_faces, "idx_faces_user", [("userId", 1)], unique=True)
            ensure_named_index(_faces, "idx_faces_embedding_hash", [("embeddingHash", 1)], unique=True)
            ensure_named_index(_faces, "idx_faces_updated_at", [("updatedAt", -1)])
            _indexes_ready = True

    return _faces


def get_faces_collection():
    return _ensure_connected()


def get_database():
    _ensure_connected()
    return _db


def get_mongo_status():
    try:
      _ensure_connected()
      _client.admin.command("ping")
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
