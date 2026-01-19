const College = require("../models/College.model");

// ================= CREATE COLLEGE =================
const createCollege = async (req, res) => {
  try {
    const { name, code, address, latitude, longitude } = req.body;

    if (!name || !code || !address || !latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: "All fields are required"
      });
    }

    const existingCollege = await College.findOne({ code });
    if (existingCollege) {
      return res.status(409).json({
        success: false,
        message: "College already exists with this code"
      });
    }

    const college = await College.create({
      name,
      code,
      address,
      location: {
        latitude,
        longitude
      },
      createdBy: req.user._id
    });

    return res.status(201).json({
      success: true,
      message: "College created successfully",
      college
    });
  } catch (error) {
    console.error("Create college error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create college"
    });
  }
};

module.exports = {
  createCollege
};
