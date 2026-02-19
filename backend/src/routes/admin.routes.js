const express = require("express");
const router = express.Router();

const authMiddleware = require("../middlewares/auth.middleware");
const roleMiddleware = require("../middlewares/role.middleware");
const { listUsers } = require("../controllers/admin.controller");

router.get(
  "/users",
  authMiddleware,
  roleMiddleware("admin"),
  listUsers
);

module.exports = router;

