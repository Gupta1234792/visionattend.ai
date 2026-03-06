const express = require("express");
const router = express.Router();

const authMiddleware = require("../middlewares/auth.middleware");
const roleMiddleware = require("../middlewares/role.middleware");
const { createHoliday, listBatchHolidays } = require("../controllers/holiday.controller");

router.post(
  "/",
  authMiddleware,
  roleMiddleware("teacher", "coordinator"),
  createHoliday
);

router.get(
  "/batch/:batchId",
  authMiddleware,
  roleMiddleware("admin", "hod", "teacher", "coordinator", "student", "parent"),
  listBatchHolidays
);

module.exports = router;
