const Department = require("../models/Department.model");
const College = require("../models/College.model");

const createDepartment = async (req, res) => {
  try {
    const { name, code, collegeId } = req.body;

    if (!name || !code || !collegeId) {
      return res.status(400).json({
        success: false,
        message: "All fields are required"
      });
    }

    const collegeExists = await College.findById(collegeId);
    if (!collegeExists) {
      return res.status(404).json({
        success: false,
        message: "College not found"
      });
    }

    const existingDept = await Department.findOne({ code, college: collegeId });
    if (existingDept) {
      return res.status(409).json({
        success: false,
        message: "Department already exists"
      });
    }

    const department = await Department.create({
      name,
      code,
      college: collegeId,
      createdBy: req.user._id
    });

    return res.status(201).json({
      success: true,
      message: "Department created successfully",
      department
    });
  } catch (error) {
    console.error("Create department error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create department"
    });
  }
};

module.exports = {
  createDepartment
};
