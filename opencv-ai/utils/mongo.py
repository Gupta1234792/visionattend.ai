from pymongo import MongoClient
import os
from dotenv import load_dotenv

# ================= LOAD ENV =================
load_dotenv()

MONGO_URI = os.getenv("MONGO_URI") or os.getenv("MONGODB_URI")

if not MONGO_URI:
    raise RuntimeError("❌ MONGO_URI is missing. Check your environment configuration")

# ================= CONNECT =================
try:
    client = MongoClient(
        MONGO_URI,
        serverSelectionTimeoutMS=5000,
        connectTimeoutMS=5000,
        maxPoolSize=50,
    )

    # 🔥 Force connection check
    client.admin.command("ping")
    print("✅ MongoDB connected successfully")

except Exception as e:
    raise RuntimeError(f"❌ MongoDB connection failed: {str(e)}")

# ================= DATABASE =================
default_db = client.get_default_database()

# fallback if DB name not in URI
db = default_db if default_db is not None else client["visionattend"]

faces = db["faces"]

# ================= INDEX SETUP =================

def ensure_named_index(name, keys, **kwargs):
    try:
        indexes = list(faces.list_indexes())
        existing = next((item for item in indexes if item.get("name") == name), None)

        expected_key = dict(keys)

        if existing and dict(existing.get("key", {})) != expected_key:
            try:
                faces.drop_index(name)
                print(f"⚠️ Dropped outdated index: {name}")
            except Exception:
                pass

        faces.create_index(keys, name=name, **kwargs)
        print(f"✅ Index ready: {name}")

    except Exception as e:
        print(f"❌ Index error ({name}): {e}")

# ================= CREATE INDEXES =================

try:
    ensure_named_index("idx_faces_user", [("userId", 1)])
    ensure_named_index("idx_faces_subject", [("subjectId", 1)])
    ensure_named_index("idx_faces_user_subject", [("userId", 1), ("subjectId", 1)])

    # 🔥 IMPORTANT for duplicate detection
    ensure_named_index(
        "idx_faces_embedding_hash",
        [("embeddingHash", 1)],
        unique=True,
        sparse=True
    )

    print("🚀 OpenCV Mongo indexes ready")

except Exception as error:
    print(f"❌ OpenCV Mongo index setup failed: {error}")