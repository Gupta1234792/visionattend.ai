from pymongo import MongoClient
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

MONGO_URI = os.getenv("MONGO_URI")

if not MONGO_URI:
    raise RuntimeError("❌ MONGO_URI is missing. Check your .env file")

client = MongoClient(MONGO_URI)
db = client["vision_attendance"]
faces = db["faces"]
