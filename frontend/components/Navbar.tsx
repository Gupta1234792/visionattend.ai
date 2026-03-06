"use client";

import { usePathname, useRouter } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import React from "react";
import Image from "next/image";

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

  const goToSection = (id: string) => {
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

        <ul className="hidden items-center gap-10 font-medium text-gray-700 md:flex">
          {navItems.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => goToSection(item.id)}
                className="cursor-pointer transition duration-200 hover:text-black"
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>

        <div>
          <button
            onClick={() => router.push("/auth")}
            className="group relative flex cursor-pointer items-center gap-2 overflow-hidden rounded-md bg-gray-700 px-3 py-2 text-sm text-white shadow-md transition duration-300 hover:shadow-lg sm:px-5 sm:text-base"
          >
            <span className="relative z-10">Sign In</span>
            <span className="relative z-10 flex items-center justify-center overflow-hidden rounded-full bg-white p-1 text-black">
              <span className="inline-block transition-transform duration-500 ease-in-out group-hover:-translate-y-6 group-hover:translate-x-6">
                <ArrowUpRight size={16} />
              </span>
              <span className="absolute inline-block translate-y-6 -translate-x-6 transition-transform duration-500 ease-in-out group-hover:translate-x-0 group-hover:translate-y-0">
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
