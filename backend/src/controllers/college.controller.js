const College = require("../models/College.model");

// ================= CREATE COLLEGE =================
const createCollege = async (req, res) => {
  try {
    const { name, code, address, latitude, longitude, description, website, logoUrl } = req.body;

    if (!name || !code || !address || latitude == null || longitude == null) {
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
      description: description || "",
      website: website || "",
      logoUrl: logoUrl || "",
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

const listColleges = async (req, res) => {
  try {
    const query = { isActive: true };

    if (req.user.role !== "admin") {
      if (!req.user.college) {
        return res.status(200).json({ success: true, colleges: [] });
      }
      query._id = req.user.college;
    }

    const colleges = await College.find(query)
      .select("name code address description website logoUrl location")
      .sort({ name: 1 });

    return res.status(200).json({
      success: true,
      colleges
    });
  } catch (error) {
    console.error("List colleges error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch colleges"
    });
  }
};

const getCollegeById = async (req, res) => {
  try {
    const { collegeId } = req.params;
    const college = await College.findById(collegeId)
      .select("name code address description website logoUrl location createdAt updatedAt");

    if (!college) {
      return res.status(404).json({
        success: false,
        message: "College not found"
      });
    }

    return res.status(200).json({
      success: true,
      college
    });
  } catch (error) {
    console.error("Get college by id error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch college"
    });
  }
};

const updateCollege = async (req, res) => {
  try {
    const { collegeId } = req.params;
    const payload = {};
    const allowedFields = ["name", "code", "address", "description", "website", "logoUrl"];

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) payload[field] = req.body[field];
    });

    if (req.body.latitude != null || req.body.longitude != null) {
      payload.location = {
        latitude: Number(req.body.latitude),
        longitude: Number(req.body.longitude)
      };
    }

    const updated = await College.findByIdAndUpdate(collegeId, payload, { new: true });
    if (!updated) {
      return res.status(404).json({
        success: false,
        message: "College not found"
      });
    }

    return res.status(200).json({
      success: true,
      message: "College profile updated",
      college: updated
    });
  } catch (error) {
    console.error("Update college error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update college"
    });
  }
};

module.exports = {
  createCollege,
  listColleges,
  getCollegeById,
  updateCollege
};
