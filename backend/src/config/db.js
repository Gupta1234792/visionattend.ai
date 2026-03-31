const mongoose = require("mongoose");
const { retryWithBackoff } = require("../utils/retry");
const { ensureFaceIndexes } = require("../utils/mongo");

const DEFAULT_DB_NAME = "visionattend";

let connectPromise = null;
let listenersAttached = false;

// ✅ Always prefer ENV first (Render / Atlas)
const getMongoUri = () => {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;

  if (!uri) {
    throw new Error("❌ MONGO_URI not set in environment variables");
  }

  return uri;
};

const getMongoState = () => ({
  readyState: mongoose.connection.readyState,
  host: mongoose.connection.host || null,
  name: mongoose.connection.name || null,
});

const attachConnectionListeners = () => {
  if (listenersAttached) return;

  listenersAttached = true;

  mongoose.connection.on("connected", () => {
    const { host, name } = getMongoState();
    console.log(`✅ [db] connected host=${host} db=${name}`);
  });

  mongoose.connection.on("error", (error) => {
    console.error(`❌ [db] runtime error: ${error.message || error}`);
  });

  mongoose.connection.on("disconnected", () => {
    console.warn("⚠️ [db] disconnected");
  });
};

const connectDB = async () => {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (connectPromise) {
    return connectPromise;
  }

  attachConnectionListeners();

  const mongoUri = getMongoUri();

  const maxRetries = Math.max(1, Number(process.env.MONGO_CONNECT_RETRIES || 5));
  const baseDelayMs = Math.max(1000, Number(process.env.MONGO_CONNECT_DELAY_MS || 2000));
  const maxDelayMs = Math.max(baseDelayMs, Number(process.env.MONGO_CONNECT_MAX_DELAY_MS || 10000));

  connectPromise = retryWithBackoff(
    async (attempt) => {
      console.log(`[db] connecting attempt=${attempt}`);

      await mongoose.connect(mongoUri, {
        dbName: DEFAULT_DB_NAME,
        autoIndex: true,
        family: 4,
        maxPoolSize: 10,
        minPoolSize: 1,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      });

      await ensureFaceIndexes();

      return mongoose.connection;
    },
    {
      retries: maxRetries,
      baseDelayMs,
      maxDelayMs,
      onRetry(error, attempt, delayMs) {
        console.error(`❌ [db] failed attempt=${attempt}: ${error.message}`);
        console.log(`[db] retrying in ${delayMs}ms`);
      },
    }
  ).catch((error) => {
    connectPromise = null;
    throw error;
  });

  return connectPromise;
};

module.exports = {
  connectDB,
  getMongoState,
};