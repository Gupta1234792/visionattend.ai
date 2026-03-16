const { faces } = require("./mongo");

// In-memory face cache for performance
const faceCache = new Map();
let cacheLastUpdated = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Helper function to compute cosine similarity
const cosineSimilarity = (a, b) => {
  const normA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const normB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  
  if (normA === 0 || normB === 0) return 0;
  
  const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
  return dotProduct / (normA * normB);
};

// Helper function to load embeddings into cache
const loadFaceCache = async () => {
  try {
    const embeddings = await faces.find({}, { userId: 1, embedding: 1 }).toArray();
    
    faceCache.clear();
    embeddings.forEach(face => {
      faceCache.set(face.userId, new Float32Array(face.embedding));
    });
    
    cacheLastUpdated = Date.now();
    console.log(`Face cache loaded: ${faceCache.size} embeddings`);
    
    // Add cache size guard
    if (faceCache.size > 20000) {
      console.warn("Face cache too large. Clearing cache.");
      faceCache.clear();
    }
  } catch (error) {
    console.error("Failed to load face cache:", error);
  }
};

// Update cache with new embedding
const updateFaceCache = (userId, embedding) => {
  try {
    faceCache.set(userId.toString(), new Float32Array(embedding));
    console.log(`Face cache updated for student: ${userId}, cache size: ${faceCache.size}`);
  } catch (error) {
    console.warn("Could not update face cache:", error.message);
  }
};

// Get face embedding from cache
const getFaceEmbedding = (userId) => {
  return faceCache.get(userId.toString());
};

// Check if cache is stale
const isCacheStale = () => {
  return Date.now() - cacheLastUpdated > CACHE_TTL;
};

// Refresh cache if stale
const refreshCacheIfNeeded = async () => {
  if (isCacheStale()) {
    await loadFaceCache();
  }
};

module.exports = {
  faceCache,
  loadFaceCache,
  updateFaceCache,
  getFaceEmbedding,
  refreshCacheIfNeeded,
  cosineSimilarity
};