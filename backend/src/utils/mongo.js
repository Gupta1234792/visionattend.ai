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
    const users = mongoose.connection.db.collection("users");

    const faceDocs = await faces.find({}, { projection: { _id: 1, userId: 1, embedding: 1, debug: 1 } }).toArray();
    const orphanIds = [];

    for (const doc of faceDocs) {
      const rawUserId = String(doc?.userId || "").trim();
      if (doc?.debug || !rawUserId || !Array.isArray(doc.embedding) || !doc.embedding.length) {
        orphanIds.push(doc._id);
        continue;
      }

      if (!mongoose.Types.ObjectId.isValid(rawUserId)) {
        orphanIds.push(doc._id);
        continue;
      }

      const exists = await users.findOne(
        { _id: new mongoose.Types.ObjectId(rawUserId), role: "student", isActive: true },
        { projection: { _id: 1 } },
      );

      if (!exists) {
        orphanIds.push(doc._id);
      }
    }

    if (orphanIds.length) {
      await faces.deleteMany({ _id: { $in: orphanIds } });
      console.warn(`[db] removed ${orphanIds.length} orphan/debug face documents`);
    }

    await dropInvalidIndexes(faces);
    await ensureNamedIndex(faces, "idx_faces_user", { userId: 1 });
    await ensureNamedIndex(faces, "idx_faces_subject", { subjectId: 1 });
    await ensureNamedIndex(faces, "idx_faces_user_subject", { userId: 1, subjectId: 1 });
    await faces.createIndex({ embeddingHash: 1 }, { name: "idx_faces_embedding_hash", unique: true, sparse: true }).catch((error) => {
      console.error(`[db] index idx_faces_embedding_hash failed: ${error.message || error}`);
    });
    console.log("[db] face indexes ready");
  } catch (error) {
    console.error(`[db] face index setup skipped: ${error.message || error}`);
  }
};

module.exports = {
  getFacesCollection,
  ensureFaceIndexes,
};
