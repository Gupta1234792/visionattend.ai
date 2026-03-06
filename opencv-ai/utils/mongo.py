from pymongo import ASCENDING, MongoClient
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

MONGO_URI = os.getenv("MONGO_URI")

if not MONGO_URI:
    raise RuntimeError("❌ MONGO_URI is missing. Check your .env file")

client = MongoClient(
    MONGO_URI,
    serverSelectionTimeoutMS=5000,
    connectTimeoutMS=5000,
    maxPoolSize=50,
)
db = client["vision_attendance"]
faces = db["faces"]

# Faster face lookup for register/verify endpoints.
faces.create_index([("userId", ASCENDING)], name="idx_faces_user")
faces.create_index([("subjectId", ASCENDING)], name="idx_faces_subject")
faces.create_index([("userId", ASCENDING), ("subjectId", ASCENDING)], name="idx_faces_user_subject")
