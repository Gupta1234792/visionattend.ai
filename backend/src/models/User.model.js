const mongoose = require("mongoose");
const { hashPassword } = require("../utils/password");

const BCRYPT_HASH_PATTERN = /^\$2[aby]\$\d{2}\$/;

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },




/* for students  */

rollNo: {
  type: String,
  required: function () {
    return this.role === "student";
  }
},

parentEmail: {
  type: String,
  lowercase: true,
  default: null
},

year: {
  type: String,
  enum: ["FY", "SY", "TY", "FINAL"],
  default: null
},

division: {
  type: String,
  enum: ["A", "B", "C"],
  default: null
}
,
faceRegisteredAt: {
  type: Date,
  default: null
},
/* for students  */


    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },

    password: {
      type: String,
      required: true
    },

    college: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "College",
      default: null
    },

    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      default: null
    },

    role: {
      type: String,
      enum: [
        "admin",
        "hod",
        "coordinator",   // ✅ ADDED
        "teacher",
        "student",
        "parent"
      ],
      required: true
    },

    isActive: {
      type: Boolean,
      default: true
    }
  },
  { timestamps: true }
);

userSchema.pre("save", async function hashPasswordOnSave(next) {
  try {
    if (!this.isModified("password")) {
      next();
      return;
    }

    const currentPassword = String(this.password || "");
    if (!currentPassword || BCRYPT_HASH_PATTERN.test(currentPassword)) {
      next();
      return;
    }

    this.password = await hashPassword(currentPassword);
    next();
  } catch (error) {
    next(error);
  }
});

module.exports = mongoose.model("User", userSchema);
