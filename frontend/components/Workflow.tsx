"use client";

import { motion } from "framer-motion";

const steps = [
  "Admin sets up institute and assigns HOD.",
  "HOD configures departments, staff, and subjects.",
  "Teacher or coordinator generates student invite.",
  "Student joins system and completes face registration.",
  "Teacher starts attendance with face + geo validation.",
  "Role-wise reports and analytics are generated securely.",
];

export default function Workflow() {
  return (
    <section className="relative bg-white py-20 md:py-32 overflow-hidden">
      
      {/* background */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(55,65,81,0.05),transparent_70%)]" />

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6">

        {/* Heading */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
          className="mb-16 md:mb-24 max-w-3xl"
        >
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-gray-900">
            Workflow Architecture
          </h2>
          <p className="mt-4 md:mt-6 text-gray-500 text-sm sm:text-base md:text-lg">
            A structured, role-driven flow designed for scale and security.
          </p>
        </motion.div>

        {/* Timeline */}
        <div className="relative">

          {/* Center line (mobile + desktop) */}
          <motion.div
            initial={{ height: 0 }}
            whileInView={{ height: "100%" }}
            viewport={{ once: true }}
            transition={{ duration: 1 }}
            className="
              absolute left-5 md:left-1/2 top-0
              w-[2px] bg-gray-200
              md:-translate-x-1/2
            "
          />

          <div className="space-y-16 md:space-y-24">
            {steps.map((step, index) => {
              const isLeft = index % 2 === 0;

              return (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: isLeft ? -60 : 60 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6 }}
                  className={`
                    relative flex
                    md:${isLeft ? "justify-start" : "justify-end"}
                  `}
                >
                  {/* Node */}
                  <div
                    className="
                      absolute left-5 md:left-1/2
                      w-8 h-8 md:w-10 md:h-10
                      rounded-full bg-gray-700 text-white
                      flex items-center justify-center
                      text-sm md:text-base font-semibold shadow-lg
                      md:-translate-x-1/2
                    "
                  >
                    {index + 1}
                  </div>

                  {/* Card */}
                  <div className="w-full pl-12 md:pl-0 md:w-[46%]">
                    <motion.div
                      whileHover={{ y: -6, scale: 1.02 }}
                      transition={{ type: "spring", stiffness: 200 }}
                      className="
                        relative bg-white rounded-2xl md:rounded-3xl
                        p-5 sm:p-6 md:p-8
                        shadow-[0_20px_60px_rgba(0,0,0,0.08)]
                        border border-gray-200
                      "
                    >
                      <h3 className="text-base md:text-lg font-semibold text-gray-900 mb-2">
                        Step {index + 1}
                      </h3>
                      <p className="text-gray-600 text-sm md:text-base leading-relaxed">
                        {step}
                      </p>

                      {/* glow */}
                      <span className="absolute inset-0 rounded-2xl md:rounded-3xl ring-1 ring-gray-200 pointer-events-none" />
                    </motion.div>
                  </div>

                </motion.div>
              );
            })}
          </div>
        </div>

      </div>
    </section>
  );
}