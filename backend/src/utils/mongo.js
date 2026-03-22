const mongoose = require("mongoose");

const getFacesCollection = () => {
  if (!mongoose.connection.db) {
    throw new Error("MongoDB is not connected");
  }

  // Reuse the active Mongoose connection instead of opening a second Mongo client.
  return mongoose.connection.db.collection("faces");
};

const dropInvalidIndexes = async (collection) => {
  const indexes = await collection.indexes().catch(() => []);

  for (const index of indexes) {
    const key = index?.key || {};
    const invalidUserId = Object.prototype.hasOwnProperty.call(key, "userId") && key.userId == null;
    const invalidSubjectId = Object.prototype.hasOwnProperty.call(key, "subjectId") && key.subjectId == null;

    if (invalidUserId || invalidSubjectId) {
      await collection.dropIndex(index.name).catch((error) => {
        console.warn(`[db] failed to drop invalid index ${index.name}: ${error.message || error}`);
      });
    }
  }
};

const ensureNamedIndex = async (collection, name, key) => {
  try {
    const indexes = await collection.indexes().catch(() => []);
    const existing = indexes.find((item) => item.name === name);

    if (existing) {
      const currentKey = JSON.stringify(existing.key || {});
      const nextKey = JSON.stringify(key);
      if (currentKey !== nextKey) {
        await collection.dropIndex(name).catch(() => null);
      }
    }

    await collection.createIndex(key, { name });
  } catch (error) {
    console.error(`[db] index ${name} failed: ${error.message || error}`);
  }
};

const ensureFaceIndexes = async () => {
  try {
    const faces = getFacesCollection();
    await dropInvalidIndexes(faces);
    await ensureNamedIndex(faces, "idx_faces_user", { userId: 1 });
    await ensureNamedIndex(faces, "idx_faces_subject", { subjectId: 1 });
    await ensureNamedIndex(faces, "idx_faces_user_subject", { userId: 1, subjectId: 1 });
    console.log("[db] face indexes ready");
  } catch (error) {
    console.error(`[db] face index setup skipped: ${error.message || error}`);
  }
};

module.exports = {
  getFacesCollection,
  ensureFaceIndexes,
};
