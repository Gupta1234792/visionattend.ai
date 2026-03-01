const express = require("express");
const router = express.Router();

const authMiddleware = require("../middlewares/auth.middleware");
const roleMiddleware = require("../middlewares/role.middleware");
const { listUsers, getAuditTrail, runArchiveNow } = require("../controllers/admin.controller");
const { attendanceOverview } = require("../controllers/analytics.controller");

router.get(
  "/users",
  authMiddleware,
  roleMiddleware("admin"),
  listUsers
);

router.get(
  "/analytics/attendance",
  authMiddleware,
  roleMiddleware("admin", "hod"),
  attendanceOverview
);

router.get(
  "/audit-trail",
  authMiddleware,
  roleMiddleware("admin", "hod"),
  getAuditTrail
);

router.post(
  "/archive/run",
  authMiddleware,
  roleMiddleware("admin"),
  runArchiveNow
);

module.exports = router;
