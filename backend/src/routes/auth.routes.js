const express = require("express");
const router = express.Router();

const authController = require("../controllers/auth.controller");
const { authRateLimit } = require("../middlewares/rateLimit.middleware");

router.post("/register", authRateLimit, authController.register);
router.post("/login", authRateLimit, authController.login);
router.post("/forgot-password", authRateLimit, authController.forgotPassword);
router.post("/reset-password", authRateLimit, authController.resetPassword);

module.exports = router;
