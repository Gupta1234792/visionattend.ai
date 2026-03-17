const { MongoClient, ASCENDING } = require("mongodb");
const dotenv = require("dotenv");

// Load environment variables
dotenv.config();

const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  throw new Error("❌ MONGO_URI is missing. Check your .env file");
}

const client = new MongoClient(MONGO_URI, {
  serverSelectionTimeoutMS: 5000,
  connectTimeoutMS: 5000,
  maxPoolSize: 50,
});

const db = client.db("vision_attendance");
const faces = db.collection("faces");

// Faster face lookup for register/verify endpoints.
async function createIndexes() {
  try {
    await faces.createIndex({ userId: ASCENDING }, { name: "idx_faces_user" });
    await faces.createIndex({ subjectId: ASCENDING }, { name: "idx_faces_subject" });
    await faces.createIndex(
      { userId: ASCENDING, subjectId: ASCENDING },
      { name: "idx_faces_user_subject" }
    );
    console.log("✅ MongoDB indexes created successfully");
  } catch (error) {
    console.error("❌ Failed to create MongoDB indexes:", error);
  }
}

// Initialize indexes when module loads
createIndexes();

module.exports = {
  client,
  db,
  faces,
};