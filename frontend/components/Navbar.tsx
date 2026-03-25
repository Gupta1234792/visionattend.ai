"use client";

import { usePathname, useRouter } from "next/navigation";
import { ArrowUpRight, Menu, X } from "lucide-react";
import React, { useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";

const navItems = [
  { label: "Home", id: "home" },
  { label: "Features", id: "features" },
  { label: "Roles", id: "roles" },
  { label: "Workflow", id: "workflow" },
  { label: "About Us", id: "about" },
  { label: "Contact Us", id: "contact" }
];

const Navbar = () => {
  const router = useRouter();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  const goToSection = (id: string) => {
    setIsOpen(false);

    if (pathname !== "/") {
      router.push(`/#${id}`);
      return;
    }

    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <nav className="sticky top-0 z-50 border-b border-gray-200 bg-white/70 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:h-20 sm:px-8">
        
        {/* Logo */}
        <div className="group flex cursor-pointer items-center">
          <Image
            src="/heroimg.png"
            alt="Profile"
            width={48}
            height={48}
            className="h-10 w-10 rounded-full object-cover transition duration-300 group-hover:scale-105 sm:h-12 sm:w-12"
          />
          <Image
            src="/logo.png"
            alt="Company Logo"
            width={160}
            height={64}
            className="-ml-3 mt-2 h-auto w-28 object-contain transition duration-300 group-hover:scale-105 sm:-ml-4 sm:mt-3 sm:w-40"
            priority
          />
        </div>

        {/* Desktop Menu */}
        <ul className="hidden items-center gap-10 font-medium text-gray-700 md:flex">
          {navItems.map((item) => (
            <li key={item.id}>
              <button
                onClick={() => goToSection(item.id)}
                className="relative group text-gray-700 transition duration-300"
              >
                <span className="relative">
                  {item.label}
                  {/* Underline animation */}
                  <span className="absolute left-0 -bottom-1 h-[2px] w-0 bg-black transition-all duration-300 group-hover:w-full"></span>
                </span>
              </button>
            </li>
          ))}
        </ul>

        {/* Right Section */}
        <div className="flex items-center gap-3">
          
          {/* Sign In */}
          <button
            onClick={() => router.push("/auth")}
            className="hidden sm:flex group relative items-center gap-2 overflow-hidden rounded-md bg-gray-800 px-4 py-2 text-sm text-white shadow-md transition-all duration-300 hover:shadow-xl hover:scale-105 active:scale-95"
          >
            <span className="relative z-10">Sign In</span>

            <span className="relative z-10 flex items-center justify-center overflow-hidden rounded-full bg-white p-1 text-black">
              <span className="inline-block transition-transform duration-500 group-hover:-translate-y-6 group-hover:translate-x-6">
                <ArrowUpRight size={16} />
              </span>
              <span className="absolute translate-y-6 -translate-x-6 transition-transform duration-500 group-hover:translate-x-0 group-hover:translate-y-0">
                <ArrowUpRight size={16} />
              </span>
            </span>
          </button>

          {/* Hamburger */}
          <button
            className="md:hidden transition-transform duration-300 hover:scale-110 active:scale-90"
            onClick={() => setIsOpen(!isOpen)}
          >
            {isOpen ? <X size={28} /> : <Menu size={28} />}
          </button>
        </div>
      </div>

      {/* Mobile Menu (Shutter + Smooth + Stagger) */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: "100vh" }}
            exit={{ height: 0 }}
            transition={{ type: "spring", stiffness: 80, damping: 18 }}
            className="overflow-hidden bg-white md:hidden"
          >
            <motion.div
              initial="hidden"
              animate="visible"
              exit="hidden"
              variants={{
                visible: {
                  transition: {
                    staggerChildren: 0.08,
                    delayChildren: 0.2
                  }
                }
              }}
              className="flex flex-col items-center justify-center gap-8 py-10 text-lg font-medium"
            >
              
              {navItems.map((item) => (
                <motion.button
                  key={item.id}
                  onClick={() => goToSection(item.id)}
                  variants={{
                    hidden: { opacity: 0, y: -20 },
                    visible: { opacity: 1, y: 0 }
                  }}
                  transition={{ type: "spring", stiffness: 120 }}
                  className="relative text-gray-700 transition"
                >
                  <span className="group relative">
                    {item.label}
                    <span className="absolute left-0 -bottom-1 h-[2px] w-0 bg-black transition-all duration-300 group-hover:w-full"></span>
                  </span>
                </motion.button>
              ))}

              {/* Sign In inside mobile */}
              <motion.button
                onClick={() => {
                  setIsOpen(false);
                  router.push("/auth");
                }}
                variants={{
                  hidden: { opacity: 0, y: 20 },
                  visible: { opacity: 1, y: 0 }
                }}
                transition={{ type: "spring", stiffness: 120 }}
                className="rounded-md bg-gray-800 px-6 py-2 text-white transition hover:scale-105 active:scale-95"
              >
                Sign In
              </motion.button>

            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
};

export default Navbar;