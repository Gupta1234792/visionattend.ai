"use client";

import Link from "next/link";

export default function Footer() {
  return (
    <footer className="bg-black text-gray-300 relative">

      {/* Top Glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[200px] bg-gray-500/10 blur-[120px] pointer-events-none"></div>

      {/* MAIN */}
      <div className="max-w-7xl mx-auto px-6 py-20 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-12">

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
          <h4 className="text-sm font-semibold uppercase tracking-widest text-gray-100">
            Quick Links
          </h4>
          <ul className="mt-6 space-y-3 text-sm">
            {["features", "workflow", "roles", "about"].map((item) => (
              <li key={item}>
                <Link
                  href={`/#${item}`}
                  className="relative group transition"
                >
                  <span className="hover:text-white capitalize">
                    {item}
                  </span>
                  <span className="absolute left-0 -bottom-1 h-[1px] w-0 bg-white transition-all duration-300 group-hover:w-full"></span>
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Access */}
        <div>
          <h4 className="text-sm font-semibold uppercase tracking-widest text-gray-100">
            Access
          </h4>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/auth"
              className="px-4 py-2 rounded-full border border-gray-500 text-sm hover:bg-white hover:text-black transition-all duration-300 hover:scale-105 active:scale-95"
            >
              Login
            </Link>
            <Link
              href="/auth"
              className="px-4 py-2 rounded-full bg-white text-black text-sm font-medium hover:opacity-90 transition-all duration-300 hover:scale-105 active:scale-95"
            >
              Register
            </Link>
          </div>
        </div>

        {/* Extra / Info */}
        <div>
          <h4 className="text-sm font-semibold uppercase tracking-widest text-gray-100">
            Contact
          </h4>
          <p className="mt-6 text-sm text-gray-400 leading-relaxed">
            Mumbai, India <br />
            support@visionattend.ai
          </p>

          <div className="mt-6 flex gap-4 text-sm">
            <span className="hover:text-white cursor-pointer transition">
              Privacy
            </span>
            <span className="hover:text-white cursor-pointer transition">
              Terms
            </span>
          </div>
        </div>

      </div>

      {/* BOTTOM */}
      <div className="border-t border-gray-700/40 py-6 text-center text-xs text-gray-400">
        © {new Date().getFullYear()} VisionAttend ERP • Secure Campus Attendance
      </div>
    </footer>
  );
}