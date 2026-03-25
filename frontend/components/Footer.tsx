"use client";

import Link from "next/link";

export default function Footer() {
  return (
    <footer className="bg-gradient-to-b from-black to-gray-900 text-gray-300 relative overflow-hidden">

      {/* Glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[250px] bg-white/5 blur-[140px] pointer-events-none"></div>

      {/* Top Divider Glow Line */}
      <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-gray-500/40 to-transparent"></div>

      {/* MAIN */}
      <div className="max-w-7xl mx-auto px-6 py-16 sm:py-20 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 sm:gap-12">

        {/* Brand */}
        <div className="space-y-4">
          <h3 className="text-2xl font-bold text-white tracking-wide">
            VisionAttend
          </h3>
          <p className="text-sm text-gray-400 leading-relaxed max-w-sm">
            Full-stack AI attendance platform with role-based ERP,
            OpenCV face recognition and geo validation for smart campuses.
          </p>
        </div>

        {/* Links */}
        <div>
          <h4 className="text-xs sm:text-sm font-semibold uppercase tracking-widest text-gray-100">
            Quick Links
          </h4>

          <ul className="mt-5 space-y-3 text-sm">
            {["features", "workflow", "roles", "about"].map((item) => (
              <li key={item}>
                <Link
                  href={`/#${item}`}
                  className="relative group inline-block transition-all duration-300 hover:translate-x-1"
                >
                  <span className="hover:text-white capitalize">
                    {item}
                  </span>

                  {/* Underline */}
                  <span className="absolute left-0 -bottom-1 h-[1px] w-0 bg-white transition-all duration-300 group-hover:w-full"></span>
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Access */}
        <div>
          <h4 className="text-xs sm:text-sm font-semibold uppercase tracking-widest text-gray-100">
            Access
          </h4>

          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/auth"
              className="px-4 py-2 rounded-full border border-gray-500 text-sm transition-all duration-300 hover:bg-white hover:text-black hover:scale-105 active:scale-95 shadow-sm hover:shadow-md"
            >
              Login
            </Link>

            <Link
              href="/auth"
              className="px-4 py-2 rounded-full bg-white text-black text-sm font-medium transition-all duration-300 hover:scale-105 active:scale-95 shadow-sm hover:shadow-md"
            >
              Register
            </Link>
          </div>
        </div>

        {/* Contact */}
        <div>
          <h4 className="text-xs sm:text-sm font-semibold uppercase tracking-widest text-gray-100">
            Contact
          </h4>

          <p className="mt-5 text-sm text-gray-400 leading-relaxed">
            Mumbai, India <br />
            support@visionattend.ai
          </p>

          <div className="mt-5 flex gap-4 text-sm">
            {["Privacy", "Terms"].map((item) => (
              <span
                key={item}
                className="relative group cursor-pointer transition-all duration-300 hover:text-white"
              >
                {item}
                <span className="absolute left-0 -bottom-1 h-[1px] w-0 bg-white transition-all duration-300 group-hover:w-full"></span>
              </span>
            ))}
          </div>
        </div>

      </div>

      {/* BOTTOM */}
      <div className="border-t border-gray-700/40 py-5 text-center text-xs text-gray-400">
        © {new Date().getFullYear()} VisionAttend ERP • Secure Campus Attendance
      </div>
    </footer>
  );
}