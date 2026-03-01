"use client";

import { useRouter } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import React from "react";

const Navbar = () => {
  const router = useRouter(); // ✅ MOVE IT HERE

  return (
    <nav className="sticky top-0 z-50 backdrop-blur-md bg-white/70 border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-8 h-20 flex items-center justify-between">
        
        {/* Left Side - Combined Logo */}
        <div className="flex items-center cursor-pointer group">
          <img
            src="/heroimg.png"
            alt="Profile"
            className="w-12 h-12 rounded-full object-cover transition duration-300 group-hover:scale-105"
          />

          <img
            src="/logo.png"
            alt="Company Logo"
            className="w-40 -ml-4 mt-3 h-auto object-contain transition duration-300 group-hover:scale-105"
          />
        </div>

        {/* Center - Nav Links */}
        <ul className="hidden md:flex items-center gap-10 text-gray-700 font-medium">
          <li className="cursor-pointer hover:text-black transition duration-200">
            Home
          </li>
          <li className="cursor-pointer hover:text-black transition duration-200">
            Features
          </li>
          <li className="cursor-pointer hover:text-black transition duration-200">
            Roles
          </li>
          <li className="cursor-pointer hover:text-black transition duration-200">
            Workflow
          </li>
          <li className="cursor-pointer hover:text-black transition duration-200">
            About Us
          </li>
          <li className="cursor-pointer hover:text-black transition duration-200">
            Contact Us
          </li>
        </ul>

        {/* Right Side - Button */}
        <div>
          <button
            onClick={() => router.push("/auth")}
            className="group cursor-pointer relative overflow-hidden bg-gray-700 text-white px-5 py-2 rounded-md transition duration-300 flex items-center gap-2 shadow-md hover:shadow-lg"
          >
            <span className="relative z-10">Sign In</span>

            <span className="relative z-10 bg-white text-black p-1 rounded-full flex items-center justify-center overflow-hidden">
              <span className="inline-block transition-transform duration-500 ease-in-out group-hover:translate-x-6 group-hover:-translate-y-6">
                <ArrowUpRight size={16} />
              </span>

              <span className="absolute inline-block -translate-x-6 translate-y-6 transition-transform duration-500 ease-in-out group-hover:translate-x-0 group-hover:translate-y-0">
                <ArrowUpRight size={16} />
              </span>
            </span>
          </button>
        </div>

      </div>
    </nav>
  );
};

export default Navbar;