import React from "react";

const Hero = () => {
  return (
    <div className="relative flex flex-col items-center pt-16">

      {/* Text Section */}
      <div className="flex flex-col items-center text-3xl md:text-5xl font-extrabold gap-3 text-gray-700 tracking-wider text-center z-10">
        <h1>Next-GEN FACIAL</h1>
        <h1>RECOGNITION</h1>
        <h1>ATTENDANCE SYSTEM</h1>
      </div>

      {/* Image + Scan Effect Wrapper */}
      <div className="relative mt-6 flex justify-center items-center">

        {/* Background Stroke Text */}
        <h1
          className="absolute text-[110px] font-black tracking-tight 
                     text-transparent opacity-10 
                     pointer-events-none select-none 
                     whitespace-nowrap z-0"
          style={{ WebkitTextStroke: "2px black" }}
        >
          ViSionattend.ai
        </h1>

        {/* Image Container */}
        <div className="relative z-10 overflow-hidden rounded-xl">

          {/* Hero Image */}
          <img
            width={800}
            className="block"
            src="/heroimg.png"
            alt="Hero"
          />

          {/* Scanning Line */}
          <div className="absolute left-0 w-full h-1 bg-green-400/70 blur-sm animate-scan"></div>

          {/* Soft Glow Overlay */}
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-green-400/5 to-transparent pointer-events-none"></div>

        </div>
      </div>

      {/* Custom Animation */}
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