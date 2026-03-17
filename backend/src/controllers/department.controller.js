const Department = require("../models/Department.model");
const College = require("../models/College.model");

const createDepartment = async (req, res) => {
  try {
    const { name, code, collegeId } = req.body;
    const resolvedCollegeId = req.user.role === "hod" ? req.user.college : collegeId;

    if (!name || !code || !resolvedCollegeId) {
      return res.status(400).json({
        success: false,
        message: "All fields are required"
      });
    }

    const collegeExists = await College.findById(resolvedCollegeId);
    if (!collegeExists) {
      return res.status(404).json({
        success: false,
        message: "College not found"
      });
    }

    const existingDept = await Department.findOne({ code, college: resolvedCollegeId });
    if (existingDept) {
      return res.status(409).json({
        success: false,
        message: "Department already exists"
      });
    }

    const department = await Department.create({
      name,
      code,
      college: resolvedCollegeId,
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

const listDepartments = async (req, res) => {
  try {
    const { collegeId } = req.query;
    const query = { isActive: true };

    if (req.user.role === "admin") {
      if (collegeId) {
        query.college = collegeId;
      }
    } else if (req.user.role === "hod") {
      query._id = req.user.department;
    } else {
      if (!req.user.college) {
        return res.status(200).json({ success: true, departments: [] });
      }
      query.college = req.user.college;
    }

    const departments = await Department.find(query)
      .select("name code college hod")
      .populate("hod", "name email")
      .sort({ name: 1 });

    return res.status(200).json({
      success: true,
      departments
    });
  } catch (error) {
    console.error("List department error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch departments"
    });
  }
};

const getDepartment = async (req, res) => {
  try {
    const { id } = req.params;
    const department = await Department.findById(id)
      .populate("college", "name")
      .populate("hod", "name email");

    if (!department) {
      return res.status(404).json({
        success: false,
        message: "Department not found"
      });
    }

    return res.status(200).json({
      success: true,
      department
    });
  } catch (error) {
    console.error("Get department error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch department"
    });
  }
};

const updateDepartment = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, code, hodId } = req.body;

    const department = await Department.findById(id);
    if (!department) {
      return res.status(404).json({
        success: false,
        message: "Department not found"
      });
    }

    if (name) department.name = name;
    if (code) department.code = code;
    if (hodId) department.hod = hodId;

    await department.save();

    return res.status(200).json({
      success: true,
      message: "Department updated successfully",
      department
    });
  } catch (error) {
    console.error("Update department error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update department"
    });
  }
};

const deleteDepartment = async (req, res) => {
  try {
    const { id } = req.params;

    const department = await Department.findById(id);
    if (!department) {
      return res.status(404).json({
        success: false,
        message: "Department not found"
      });
    }

    department.isActive = false;
    await department.save();

    return res.status(200).json({
      success: true,
      message: "Department deactivated successfully"
    });
  } catch (error) {
    console.error("Delete department error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete department"
    });
  }
};

module.exports = {
  createDepartment,
  listDepartments,
  getDepartment,
  updateDepartment,
  deleteDepartment
};
