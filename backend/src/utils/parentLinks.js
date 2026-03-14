const Parent = require("../models/Parent.model");
const User = require("../models/User.model");

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

const getEligibleStudentsForParentEmail = async (email) => {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return [];

  return User.find({
    role: "student",
    isActive: true,
    parentEmail: normalizedEmail
  })
    .select("_id college parentEmail")
    .lean();
};

const syncParentLinksForUser = async (parentUser) => {
  if (!parentUser || parentUser.role !== "parent") {
    return { linkedCount: 0, students: [] };
  }

  const students = await getEligibleStudentsForParentEmail(parentUser.email);
  if (!students.length) {
    return { linkedCount: 0, students: [] };
  }

  const collegeIds = [
    ...new Set(
      students
        .map((student) => (student.college ? String(student.college) : ""))
        .filter(Boolean)
    )
  ];

  if (parentUser.college) {
    const parentCollegeId = String(parentUser.college);
    const sameCollegeStudents = students.filter(
      (student) => student.college && String(student.college) === parentCollegeId
    );

    if (!sameCollegeStudents.length) {
      return {
        linkedCount: 0,
        students: [],
        error: "No linked students found in the parent's assigned college"
      };
    }

    const operations = sameCollegeStudents.map((student) => ({
      updateOne: {
        filter: {
          userId: parentUser._id,
          studentId: student._id
        },
        update: {
          $set: {
            userId: parentUser._id,
            studentId: student._id,
            collegeId: parentUser.college,
            relation: "GUARDIAN",
            isActive: true
          }
        },
        upsert: true
      }
    }));

    if (operations.length) {
      await Parent.bulkWrite(operations, { ordered: false });
    }

    return { linkedCount: sameCollegeStudents.length, students: sameCollegeStudents };
  }

  if (collegeIds.length > 1) {
    return {
      linkedCount: 0,
      students: [],
      error: "Parent email is linked to students in multiple colleges. Ask admin to configure the parent account."
    };
  }

  if (collegeIds[0]) {
    parentUser.college = collegeIds[0];
    await parentUser.save();
  }

  const operations = students.map((student) => ({
    updateOne: {
      filter: {
        userId: parentUser._id,
        studentId: student._id
      },
      update: {
        $set: {
          userId: parentUser._id,
          studentId: student._id,
          collegeId: student.college,
          relation: "GUARDIAN",
          isActive: true
        }
      },
      upsert: true
    }
  }));

  if (operations.length) {
    await Parent.bulkWrite(operations, { ordered: false });
  }

  return { linkedCount: students.length, students };
};

module.exports = {
  normalizeEmail,
  getEligibleStudentsForParentEmail,
  syncParentLinksForUser
};
