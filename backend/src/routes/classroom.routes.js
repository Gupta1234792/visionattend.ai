const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/auth.middleware");
const { getClassroomData } = require("../controllers/classroom.controller");

router.get("/:batchKey", authMiddleware, getClassroomData);

module.exports = router;
