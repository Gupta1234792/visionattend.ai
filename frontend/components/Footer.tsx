"use client";

import Link from "next/link";

export default function Footer() {
  return (
    <footer className="bg-black text-gray-200">
      <div className="max-w-7xl mx-auto px-6 py-16 grid grid-cols-1 md:grid-cols-3 gap-12">

        {/* Brand */}
        <div>
          <h3 className="text-xl font-bold text-white">
            VisionAttend
          </h3>
          <p className="mt-4 text-sm text-gray-300 leading-relaxed">
            Full-stack AI attendance platform with role-based ERP,
            OpenCV face recognition and geo validation.
          </p>
        </div>

        {/* Links */}
        <div>
          <h4 className="text-sm font-semibold uppercase tracking-widest text-gray-100">
            Quick Links
          </h4>
          <ul className="mt-5 space-y-3 text-sm">
            <li><Link href="#" className="hover:text-white">Features</Link></li>
            <li><Link href="#" className="hover:text-white">Workflow</Link></li>
            <li><Link href="#" className="hover:text-white">Roles</Link></li>
            <li><Link href="#" className="hover:text-white">About Us</Link></li>
          </ul>
        </div>

        {/* Access */}
        <div>
          <h4 className="text-sm font-semibold uppercase tracking-widest text-gray-100">
            Access
          </h4>
          <div className="mt-6 flex gap-4">
            <Link
              href="/login"
              className="px-5 py-2 rounded-full border border-gray-400 text-sm hover:bg-white hover:text-gray-800 transition"
            >
              Login
            </Link>
            <Link
              href="/register"
              className="px-5 py-2 rounded-full bg-white text-gray-800 text-sm font-medium hover:opacity-90 transition"
            >
              Register
            </Link>
          </div>
        </div>
      </div>

      <div className="border-t border-gray-500/30 py-6 text-center text-xs text-gray-300">
        © {new Date().getFullYear()} VisionAttend ERP • Secure Campus Attendance
      </div>
    </footer>
  );
}