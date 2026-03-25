"use client";

import React from "react";
import Image from "next/image";

const Hero = () => {
  return (
    <div
      id="home"
      className="relative flex flex-col items-center pt-20 sm:pt-24 md:pt-28 px-4"
    >

      {/* TEXT */}
      <div className="flex flex-col items-center text-center font-extrabold gap-2 sm:gap-3 text-gray-700 tracking-wide z-10">
        
        <h1 className="text-2xl sm:text-3xl md:text-5xl">
          Next-GEN FACIAL
        </h1>
        <h1 className="text-2xl sm:text-3xl md:text-5xl">
          RECOGNITION
        </h1>
        <h1 className="text-2xl sm:text-3xl md:text-5xl">
          ATTENDANCE SYSTEM
        </h1>

      </div>

      {/* IMAGE SECTION */}
      <div className="relative mt-8 sm:mt-10 flex justify-center items-center w-full max-w-5xl">

        {/* Background Text */}
        <h1
          className="absolute text-[40px] sm:text-[70px] md:text-[110px] font-black tracking-tight 
                     text-transparent opacity-10 
                     pointer-events-none select-none 
                     whitespace-nowrap z-0"
          style={{ WebkitTextStroke: "2px black" }}
        >
          Visionattend.ai
        </h1>

        {/* Image Wrapper */}
        <div className="relative z-10 overflow-hidden rounded-xl w-full">

          {/* Image */}
          <Image
            width={800}
            height={520}
            className="w-full h-auto object-contain"
            src="/heroimg.png"
            alt="Hero"
            priority
          />

          {/* Scan Line */}
          <div className="absolute left-0 w-full h-[2px] sm:h-1 bg-green-400/70 blur-sm animate-scan"></div>

          {/* Glow Overlay */}
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-green-400/5 to-transparent pointer-events-none"></div>

        </div>
      </div>

      {/* Animation */}
      <style>
        {`
          @keyframes scan {
            0% { top: 0%; }
            50% { top: 100%; }
            100% { top: 0%; }
          }

          .animate-scan {
            animation: scan 3s linear infinite;
          }
        `}
      </style>

    </div>
  );
};

export default Hero;