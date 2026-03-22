const mongoose = require("mongoose");
const { retryWithBackoff } = require("../utils/retry");
const { ensureFaceIndexes } = require("../utils/mongo");

const DEFAULT_DB_NAME = "visionattend";

let connectPromise = null;
let listenersAttached = false;

const getMongoUri = () => {
  const directUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (directUri) {
    return directUri;
  }

  const host = process.env.MONGO_HOST || "mongo";
  const port = process.env.MONGO_PORT || "27017";
  const dbName = process.env.MONGO_DB_NAME || DEFAULT_DB_NAME;
  const username = process.env.MONGO_USER || process.env.MONGO_USERNAME;
  const password = process.env.MONGO_PASSWORD;
  const authSource = process.env.MONGO_AUTH_SOURCE;

  if (username && password) {
    const encodedUser = encodeURIComponent(username);
    const encodedPassword = encodeURIComponent(password);
    const query = authSource ? `?authSource=${encodeURIComponent(authSource)}` : "";
    return `mongodb://${encodedUser}:${encodedPassword}@${host}:${port}/${dbName}${query}`;
  }

  return `mongodb://${host}:${port}/${dbName}`;
};

const getMongoState = () => ({
  readyState: mongoose.connection.readyState,
  host: mongoose.connection.host || null,
  name: mongoose.connection.name || null,
});

const attachConnectionListeners = () => {
  if (listenersAttached) {
    return;
  }

  listenersAttached = true;

  mongoose.connection.on("connected", () => {
    const { host, name } = getMongoState();
    console.log(`[db] connected host=${host || "unknown"} db=${name || "unknown"}`);
  });

  mongoose.connection.on("error", (error) => {
    console.error(`[db] runtime error: ${error.message || error}`);
  });

  mongoose.connection.on("disconnected", () => {
    console.warn("[db] disconnected");
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
  const maxRetries = Math.max(1, Number(process.env.MONGO_CONNECT_RETRIES || 8));
  const baseDelayMs = Math.max(1000, Number(process.env.MONGO_CONNECT_DELAY_MS || 2000));
  const maxDelayMs = Math.max(baseDelayMs, Number(process.env.MONGO_CONNECT_MAX_DELAY_MS || 15000));

  connectPromise = retryWithBackoff(
    async (attempt) => {
      // Keep a single shared Mongoose connection and let retryWithBackoff handle startup timing.
      console.log(`[db] connecting attempt=${attempt} uri=${mongoUri.replace(/\/\/([^@/]+)@/, "//***:***@")}`);

      await mongoose.connect(mongoUri, {
        autoIndex: true,
        family: 4,
        maxPoolSize: Math.max(5, Number(process.env.MONGO_MAX_POOL_SIZE || 10)),
        minPoolSize: Math.max(0, Number(process.env.MONGO_MIN_POOL_SIZE || 1)),
        serverSelectionTimeoutMS: Math.max(3000, Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS || 5000)),
        socketTimeoutMS: Math.max(10000, Number(process.env.MONGO_SOCKET_TIMEOUT_MS || 45000)),
      });

      await ensureFaceIndexes();
      return mongoose.connection;
    },
    {
      retries: maxRetries,
      baseDelayMs,
      maxDelayMs,
      onRetry(error, attempt, delayMs) {
        console.error(`[db] connection failed attempt=${attempt} reason=${error.message || error}`);
        console.log(`[db] retrying in ${delayMs}ms`);
      },
    },
  )
    .catch((error) => {
      connectPromise = null;
      throw error;
    });

  return connectPromise;
};

module.exports = {
  connectDB,
  getMongoState,
  getMongoUri,
};
