const User = require("../models/User.model");

/**
 * Middleware to require face registration for protected routes
 * Blocks access if user.faceRegisteredAt is null
 */
const requireFaceRegistration = async (req, res, next) => {
  try {
    // Skip for non-student roles
    if (req.user?.role !== "student") {
      return next();
    }

    // Check if user has face registered
    const user = await User.findById(req.user._id).select("faceRegisteredAt");
    
    if (!user || !user.faceRegisteredAt) {
      return res.status(403).json({
        success: false,
        message: "Face registration required"
      });
    }

    // User has face registered, proceed
    next();
  } catch (error) {
    console.error("Face registration middleware error:", error);
    return res.status(500).json({
      success: false,
      message: "Authentication check failed"
    });
  }
};

module.exports = requireFaceRegistration;