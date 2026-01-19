const mongoose = require("mongoose");

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
/* for students  */


    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true
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

module.exports = mongoose.model("User", userSchema);
