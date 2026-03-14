const express = require("express");
const router = express.Router();

const authMiddleware = require("../middlewares/auth.middleware");
const roleMiddleware = require("../middlewares/role.middleware");

const {
    createAnnouncement,
    getAnnouncements
} = require("../controllers/announcement.controller");

/* ================= COORDINATOR ================= */

router.post(
    "/create",
    authMiddleware,
    roleMiddleware("admin", "hod", "coordinator", "teacher"),
    createAnnouncement
);

/* ================= ALL ROLES ================= */

router.get(
    "/list",
    authMiddleware,
    getAnnouncements
);

module.exports = router;
