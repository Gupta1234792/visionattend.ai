"use client";

import {
  ShieldCheckIcon,
  BuildingOffice2Icon,
  AcademicCapIcon,
  UserGroupIcon,
  UserIcon,
  HeartIcon,
} from "@heroicons/react/24/outline";

const roles = [
  {
    title: "Admin",
    description:
      "Manage institute structure, departments, and strategic assignments.",
    icon: ShieldCheckIcon,
  },
  {
    title: "HOD",
    description:
      "Oversee academics, faculty distribution, and curriculum flow.",
    icon: BuildingOffice2Icon,
  },
  {
    title: "Teacher",
    description:
      "Conduct classes, launch attendance sessions, and review insights.",
    icon: AcademicCapIcon,
  },
  {
    title: "Coordinator",
    description:
      "Assist operations, onboarding, and cross-class coordination.",
    icon: UserGroupIcon,
  },
  {
    title: "Student",
    description:
      "Enroll once, attend securely, and stay connected to classes.",
    icon: UserIcon,
  },
  {
    title: "Parent",
    description:
      "View attendance records and academic visibility of children.",
    icon: HeartIcon,
  },
];

export default function RoleModulesPage() {
  return (
    <section className="relative bg-white py-32 px-6 overflow-hidden">
      {/* Background accent */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(55,65,81,0.06),transparent_60%)]" />

      <div className="relative max-w-7xl mx-auto">
        {/* Heading */}
        <div className="mb-24 max-w-3xl">
          <span className="inline-block mb-4 text-xs font-semibold tracking-widest text-gray-500 uppercase">
            System Architecture
          </span>
          <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight text-gray-900">
            Role Modules
          </h2>
          <p className="mt-6 text-lg text-gray-500 leading-relaxed">
            A clearly segmented role system designed for clarity, control, and
            institutional scale.
          </p>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-14">
          {roles.map((role, index) => (
            <div
              key={index}
              className="
                group relative rounded-3xl p-8
                bg-white
                shadow-[0_25px_60px_rgba(0,0,0,0.06)]
                transition-all duration-500
                hover:-translate-y-3 hover:shadow-[0_40px_90px_rgba(0,0,0,0.1)]
              "
            >
              {/* Glow */}
              <div className="absolute inset-0 rounded-3xl opacity-0 group-hover:opacity-100 transition duration-500 bg-gradient-to-br from-gray-700/10 via-transparent to-transparent pointer-events-none" />

              {/* Icon */}
              <div className="relative mb-7">
                <div
                  className="
                    w-14 h-14 rounded-2xl
                    bg-gray-700 text-white
                    flex items-center justify-center
                    shadow-lg
                    transition-transform duration-500
                    group-hover:scale-110
                  "
                >
                  <role.icon className="w-7 h-7" />
                </div>
              </div>

              {/* Content */}
              <h3 className="text-xl font-semibold text-gray-900 mb-3 tracking-tight">
                {role.title}
              </h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                {role.description}
              </p>

              {/* Border */}
              <span className="absolute inset-0 rounded-3xl ring-1 ring-gray-200/70 pointer-events-none" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}