const crypto = require("crypto");

const DATA_URL_PATTERN = /^data:image\/(png|jpeg|jpg|webp);base64,/i;

const estimateBase64Bytes = (value) => {
  const encoded = String(value || "").split(",", 2)[1] || "";
  return Math.floor((encoded.length * 3) / 4);
};

const isValidImageDataUrl = (value) =>
  typeof value === "string" && DATA_URL_PATTERN.test(value);

const filterValidImageDataUrls = (frames) =>
  Array.isArray(frames) ? frames.filter((frame) => isValidImageDataUrl(frame)) : [];

const hashImageDataUrl = (value) => {
  const encoded = String(value || "").split(",", 2)[1] || "";
  return crypto.createHash("sha256").update(encoded).digest("hex");
};

const assertImagePayloadLimit = (
  primaryImage,
  frames,
  {
    maxFrameBytes = Number(process.env.MAX_IMAGE_FRAME_BYTES || 1024 * 1024),
    maxFrameCount = Number(process.env.MAX_IMAGE_FRAME_COUNT || 8),
    maxTotalBytes = Number(process.env.MAX_IMAGE_TOTAL_BYTES || 4 * 1024 * 1024),
  } = {},
) => {
  const validFrames = filterValidImageDataUrls(frames);
  const candidateFrames = validFrames.length
    ? validFrames
    : isValidImageDataUrl(primaryImage)
      ? [primaryImage]
      : [];

  if (!candidateFrames.length) {
    return {
      ok: false,
      message: "Valid face image is required",
      code: "INVALID_IMAGE_PAYLOAD",
      frames: [],
    };
  }

  if (candidateFrames.length > maxFrameCount) {
    return {
      ok: false,
      message: `Too many frames supplied (max ${maxFrameCount})`,
      code: "TOO_MANY_FRAMES",
      frames: [],
    };
  }

  let totalBytes = 0;
  for (const frame of candidateFrames) {
    const approxBytes = estimateBase64Bytes(frame);
    totalBytes += approxBytes;
    if (approxBytes > maxFrameBytes) {
      return {
        ok: false,
        message: "Image frame too large",
        code: "IMAGE_FRAME_TOO_LARGE",
        frames: [],
      };
    }
  }

  if (totalBytes > maxTotalBytes) {
    return {
      ok: false,
      message: "Combined image payload too large",
      code: "IMAGE_PAYLOAD_TOO_LARGE",
      frames: [],
    };
  }

  return {
    ok: true,
    frames: candidateFrames,
    totalBytes,
  };
};

module.exports = {
  isValidImageDataUrl,
  filterValidImageDataUrls,
  estimateBase64Bytes,
  assertImagePayloadLimit,
  hashImageDataUrl,
};
