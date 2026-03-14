const mongoose = require("mongoose");

const announcementSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: true,
            trim: true
        },

        message: {
            type: String,
            required: true
        },

        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },

        createdByRole: {
            type: String,
            enum: ["admin", "hod", "coordinator", "teacher"],
            required: true
        },

        college: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "College",
            required: true
        },

        department: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Department",
            default: null
        },

        batchKey: {
            type: String,
            default: null,
            index: true
        },

        year: {
            type: String,
            enum: ["FY", "SY", "TY", "FINAL", null],
            default: null
        },

        division: {
            type: String,
            enum: ["A", "B", "C", null],
            default: null
        },

        scopeType: {
            type: String,
            enum: ["college", "department", "batch"],
            default: "department"
        },

        targetRoles: {
            type: [{
                type: String,
                enum: ["admin", "hod", "teacher", "coordinator", "student", "parent"]
            }],
            default: []
        },

        isActive: {
            type: Boolean,
            default: true
        },

        expiresAt: {
            type: Date,
            default: null
        }
    },
    { timestamps: true }
);

announcementSchema.index({ college: 1, department: 1, batchKey: 1, scopeType: 1 });
announcementSchema.index({ expiresAt: 1 });

module.exports =
    mongoose.models.Announcement ||
    mongoose.model("Announcement", announcementSchema);
