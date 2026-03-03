let Queue;
let Worker;
let QueueEvents;
let connection;

try {
  ({ Queue, Worker, QueueEvents } = require("bullmq"));
  const IORedis = require("ioredis");

  // Proper Docker-safe Redis connection
  connection = new IORedis({
    host: process.env.REDIS_HOST || "redis",
    port: process.env.REDIS_PORT ? Number(process.env.REDIS_PORT) : 6379,
    maxRetriesPerRequest: null,
  });

  connection.on("connect", () => {
    console.log("✅ Connected to Redis");
  });

  connection.on("error", (err) => {
    console.error("❌ Redis connection error:", err.message);
  });

} catch (err) {
  console.error("BullMQ or Redis not available:", err.message);
  connection = null;
}

const queues = {};

const createQueue = (name) => {
  if (!connection || !Queue) return null;

  if (!queues[name]) {
    queues[name] = new Queue(name, { connection });
  }

  return queues[name];
};

const addJob = async (queueName, jobName, data, options = {}) => {
  const queue = createQueue(queueName);

  if (!queue) {
    return {
      queued: false,
      reason: "BullMQ unavailable. Ensure Redis is running.",
    };
  }

  const job = await queue.add(jobName, data, options);
  return { queued: true, jobId: job.id };
};

const createWorker = (queueName, processor) => {
  if (!connection || !Worker) return null;

  return new Worker(queueName, processor, { connection });
};

const createQueueEvents = (queueName) => {
  if (!connection || !QueueEvents) return null;

  return new QueueEvents(queueName, { connection });
};

module.exports = {
  addJob,
  createWorker,
  createQueueEvents,
  isEnabled: Boolean(connection && Queue),
};