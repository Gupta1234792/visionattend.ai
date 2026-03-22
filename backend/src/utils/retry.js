const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const retryWithBackoff = async (task, options = {}) => {
  const retries = Math.max(1, Number(options.retries || 5));
  const baseDelayMs = Math.max(250, Number(options.baseDelayMs || 1000));
  const maxDelayMs = Math.max(baseDelayMs, Number(options.maxDelayMs || 10000));
  const onRetry = typeof options.onRetry === "function" ? options.onRetry : null;

  let lastError;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      return await task(attempt);
    } catch (error) {
      lastError = error;

      if (attempt >= retries) {
        break;
      }

      const delayMs = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
      if (onRetry) {
        onRetry(error, attempt, delayMs);
      }
      await sleep(delayMs);
    }
  }

  throw lastError;
};

module.exports = {
  retryWithBackoff,
};
