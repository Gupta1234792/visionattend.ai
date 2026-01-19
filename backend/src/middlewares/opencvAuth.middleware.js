/* middlewares/opencvAuth.middleware.js */

module.exports = (req, res, next) => {
  const key = req.headers["x-opencv-key"];

  if (!key || key !== process.env.OPENCV_API_KEY) {
    return res.status(403).json({
      success: false,
      message: "Invalid OpenCV key"
    });
  }

  next();
};
