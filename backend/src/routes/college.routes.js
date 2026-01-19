const express = require("express");
const router = express.Router();

const authMiddleware = require("../middlewares/auth.middleware");
const roleMiddleware = require("../middlewares/role.middleware");
const { createCollege } = require("../controllers/college.controller");

router.post(
  "/",
  authMiddleware,
  roleMiddleware("admin"),
  createCollege
);

module.exports = router;
