let Queue;
let Worker;
let QueueEvents;
let connection;

try {
  ({ Queue, Worker, QueueEvents } = require("bullmq"));
  const IORedis = require("ioredis");
  connection = new IORedis(process.env.REDIS_URL || "redis://127.0.0.1:6379", {
    maxRetriesPerRequest: null
  });
} catch (err) {
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
    return { queued: false, reason: "BullMQ unavailable. Install bullmq + ioredis and run Redis." };
  }

  const job = await queue.add(jobName, data, options);
  return { queued: true, jobId: job.id };
};

const createWorker = (queueName, processor) => {
  if (!connection || !Worker) {
    return null;
  }

  return new Worker(queueName, processor, { connection });
};

const createQueueEvents = (queueName) => {
  if (!connection || !QueueEvents) {
    return null;
  }

  return new QueueEvents(queueName, { connection });
};

module.exports = {
  addJob,
  createWorker,
  createQueueEvents,
  isEnabled: Boolean(connection && Queue)
};
