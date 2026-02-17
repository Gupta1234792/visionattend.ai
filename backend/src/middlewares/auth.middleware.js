const { verifyToken } = require("../utils/jwt");
const User = require("../models/User.model");

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    const headerToken =
      typeof authHeader === "string"
        ? (authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader)
        : "";
    const altToken = req.headers["x-access-token"];
    const token = (headerToken || altToken || "").toString().trim();

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Authorization token missing"
      });
    }

    const decoded = verifyToken(token);

    const user = await User.findById(decoded.userId).select("-password");

    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: "User not authorized"
      });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token"
    });
  }
};

// 🔒 EXPORT FUNCTION DIRECTLY (NOT OBJECT)
module.exports = authMiddleware;
