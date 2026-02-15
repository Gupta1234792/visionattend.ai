const getBatchKey = ({ department, year, division }) => {
  // ✅ Allow partial for teacher context
  if (!department) {
    throw new Error("department required");
  }

  // teacher context (year/division not known)
  if (!year || !division) {
    return `${department.toString()}_ALL_ALL`;
  }

  return `${department.toString()}_${year}_${division}`;
};

module.exports = getBatchKey;
