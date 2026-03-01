const rateLimit = require("express-rate-limit");

const defaultOptions = {
  standardHeaders: true,
  legacyHeaders: false
};

const authRateLimit = rateLimit({
  ...defaultOptions,
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_AUTH_MAX) || 40,
  message: {
    success: false,
    message: "Too many auth attempts. Please try again shortly."
  }
});

const inviteRateLimit = rateLimit({
  ...defaultOptions,
  windowMs: 10 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_INVITE_MAX) || 80,
  message: {
    success: false,
    message: "Invite request rate limit reached. Retry later."
  }
});

const attendanceRateLimit = rateLimit({
  ...defaultOptions,
  windowMs: 5 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_ATTENDANCE_MAX) || 120,
  message: {
    success: false,
    message: "Attendance request rate limit reached. Retry later."
  }
});

module.exports = {
  authRateLimit,
  inviteRateLimit,
  attendanceRateLimit
};
