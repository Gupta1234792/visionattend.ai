const express = require("express");
const router = express.Router();

const authMiddleware = require("../middlewares/auth.middleware");
const roleMiddleware = require("../middlewares/role.middleware");
const {
  linkParentToStudent,
  myChildren,
  childAnalytics,
  childSummary,
  childDailyReport,
  exportChildDailyCsv
} = require("../controllers/parent.controller");

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

router.get(
  "/analytics",
  authMiddleware,
  roleMiddleware("parent"),
  childAnalytics
);

router.get(
  "/summary",
  authMiddleware,
  roleMiddleware("parent"),
  childSummary
);

router.get(
  "/daily-report",
  authMiddleware,
  roleMiddleware("parent"),
  childDailyReport
);

router.get(
  "/daily-report/csv",
  authMiddleware,
  roleMiddleware("parent"),
  exportChildDailyCsv
);

module.exports = router;
