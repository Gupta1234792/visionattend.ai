const User = require("../models/User.model");

const DEFAULT_PASSWORD = process.env.DEMO_USER_PASSWORD || "Vision@123";

const isEnabled = () => {
  const explicit = String(process.env.AUTO_SEED_LOCAL_USERS || "").toLowerCase();
  if (["1", "true", "yes"].includes(explicit)) {
    return true;
  }
  return false;
};

const buildUsers = () => [
  {
    name: "admin",
    email: "admin@gmail.com",
    role: "admin",
  },
  {
    name: "Deepak",
    email: "surajgupta05086@gmail.com",
    role: "hod",
  },
  {
    name: "Deepa",
    email: "deepa@gmail.com",
    role: "teacher",
  },
  {
    name: "Pradnya",
    email: "pradnya@gmail.com",
    role: "coordinator",
    year: "FY",
    division: "A",
  },
  {
    name: "Suraj",
    email: "suraj@gmail.com",
    role: "student",
    year: "FY",
    division: "A",
    rollNo: "DEMOFYA001",
  },
];

const ensureDemoUsers = async () => {
  if (!isEnabled()) {
    return;
  }

  const demoUsers = buildUsers();
  for (const candidate of demoUsers) {
    const existing = await User.findOne({ email: candidate.email });
    if (!existing) {
      const user = new User({
        ...candidate,
        password: DEFAULT_PASSWORD,
      });
      await user.save();
      console.log(`[demo-users] created ${candidate.role} ${candidate.email}`);
      continue;
    }

    let dirty = false;
    if (existing.name !== candidate.name) {
      existing.name = candidate.name;
      dirty = true;
    }
    if (existing.role !== candidate.role) {
      existing.role = candidate.role;
      dirty = true;
    }
    if (candidate.year && existing.year !== candidate.year) {
      existing.year = candidate.year;
      dirty = true;
    }
    if (candidate.division && existing.division !== candidate.division) {
      existing.division = candidate.division;
      dirty = true;
    }
    if (candidate.rollNo && existing.rollNo !== candidate.rollNo) {
      existing.rollNo = candidate.rollNo;
      dirty = true;
    }

    existing.password = DEFAULT_PASSWORD;
    dirty = true;

    if (dirty) {
      await existing.save();
      console.log(`[demo-users] refreshed ${candidate.role} ${candidate.email}`);
    }
  }

  console.log(`[demo-users] ready password=${DEFAULT_PASSWORD}`);
};

module.exports = {
  ensureDemoUsers,
};
