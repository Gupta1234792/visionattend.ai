from pymongo import MongoClient
import os
import time
from dotenv import load_dotenv

load_dotenv()

MONGO_URI = os.getenv("MONGO_URI") or os.getenv("MONGODB_URI")
MONGO_CONNECT_RETRIES = int(os.getenv("MONGO_CONNECT_RETRIES", "20"))
MONGO_CONNECT_DELAY_MS = int(os.getenv("MONGO_CONNECT_DELAY_MS", "2000"))

if not MONGO_URI:
    raise RuntimeError("MONGO_URI is missing. Check your environment configuration")


def connect_with_retry():
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


client = connect_with_retry()

# 🔥 FIX: force DB name (Atlas ke liye mandatory)
DB_NAME = os.getenv("MONGO_DB_NAME", "visionattend")

print("[opencv.mongo] USING DB:", DB_NAME)

db = client[DB_NAME]
faces = db["faces"]


def ensure_named_index(name, keys, **kwargs):
    try:
        indexes = list(faces.list_indexes())
        existing = next((item for item in indexes if item.get("name") == name), None)
        expected_key = dict(keys)

        if existing and dict(existing.get("key", {})) != expected_key:
            try:
                faces.drop_index(name)
                print(f"[opencv.mongo] dropped outdated index={name}")
            except Exception:
                pass

        faces.create_index(keys, name=name, **kwargs)
        print(f"[opencv.mongo] index ready={name}")
    except Exception as exc:
        print(f"[opencv.mongo] index error name={name}: {exc}")


try:
    ensure_named_index("idx_faces_user", [("userId", 1)])
    ensure_named_index("idx_faces_subject", [("subjectId", 1)])
    ensure_named_index("idx_faces_user_subject", [("userId", 1), ("subjectId", 1)])
    ensure_named_index(
        "idx_faces_embedding_hash",
        [("embeddingHash", 1)],
        unique=True,
        sparse=True,
    )
    print("[opencv.mongo] indexes ready")
except Exception as error:
    print(f"[opencv.mongo] index setup failed: {error}")
