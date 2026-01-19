const express = require("express");
const router = express.Router();

const authMiddleware = require("../middlewares/auth.middleware");
const roleMiddleware = require("../middlewares/role.middleware");
const { createHOD } = require("../controllers/hod.controller");

// test route
router.get("/test", (req, res) => {
  res.json({ message: "HOD ROUTE WORKING" });
});

// create HOD (admin only)
router.post(
  "/",
  authMiddleware,
  roleMiddleware("admin"),
  createHOD
);

module.exports = router;
