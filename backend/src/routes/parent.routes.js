const express = require("express");
const router = express.Router();

const authMiddleware = require("../middlewares/auth.middleware");
const roleMiddleware = require("../middlewares/role.middleware");
const { linkParentToStudent, myChildren } = require("../controllers/parent.controller");

router.post(
  "/link",
  authMiddleware,
  roleMiddleware("admin", "hod", "coordinator"),
  linkParentToStudent
);

router.get(
  "/my-children",
  authMiddleware,
  roleMiddleware("parent"),
  myChildren
);

module.exports = router;
