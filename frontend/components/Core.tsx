import {
  Camera,
  MapPin,
  ShieldCheck,
  Radio,
} from "lucide-react";

const coreFeatures = [
  {
    title: "OpenCV Face Verification",
    desc: "Secure facial identity validation using your existing AI pipeline during attendance.",
    icon: Camera,
  },
  {
    title: "Geo-Validated Attendance",
    desc: "Attendance is accepted only when live location matches institution policies.",
    icon: MapPin,
  },
  {
    title: "Role-Based ERP System",
    desc: "Admin, HOD, Teachers, Students and Parents operate in fully separated workflows.",
    icon: ShieldCheck,
  },
  {
    title: "Live Classroom Operations",
    desc: "Create classes, share codes and manage sessions in real time.",
    icon: Radio,
  },
];

export default function Core() {
  return (
    <section className="bg-white py-32">
      <div className="max-w-6xl mx-auto px-6">
        {/* Heading */}
        <div className="mb-24">
          <h2 className="text-4xl md:text-5xl font-extrabold tracking-wide text-gray-800 uppercase">
            Core Features
          </h2>
          <p className="mt-6 text-lg text-gray-500 max-w-2xl">
            Built as a deeply integrated system, not a collection of isolated modules.
          </p>
        </div>

        {/* Feature List */}
        <div className="space-y-20">
          {coreFeatures.map((item, index) => {
            const Icon = item.icon;
            return (
              <div
                key={index}
                className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start"
              >
                {/* Left Side */}
                <div className="md:col-span-3 flex items-center gap-6">
                  <span className="text-5xl font-bold text-gray-200">
                    {`0${index + 1}`}
                  </span>
                  <div className="w-12 h-12 bg-gray-700 text-white rounded-xl flex items-center justify-center">
                    <Icon size={22} />
                  </div>
                </div>

                {/* Right Side */}
                <div className="md:col-span-9">
                  <h3 className="text-2xl font-semibold text-gray-800">
                    {item.title}
                  </h3>
                  <p className="mt-4 text-gray-500 leading-relaxed max-w-3xl">
                    {item.desc}
                  </p>

                  {/* Divider */}
                  <div className="mt-10 h-px bg-gray-200 w-full" />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}