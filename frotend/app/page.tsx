"use client";

import Link from "next/link";
import { useEffect } from "react";

const platformHighlights = [
  {
    title: "OpenCV Face Verification",
    description: "Uses your existing AI service for secure identity confirmation during attendance.",
  },
  {
    title: "Geo-Validated Marking",
    description: "Attendance is accepted only when class location matches your backend policy.",
  },
  {
    title: "Role Based ERP",
    description: "Admin, HOD, Teacher, Coordinator, Student and Parent workflows stay separated.",
  },
  {
    title: "Live Classroom Operations",
    description: "Teacher and coordinator can generate invite links and class codes instantly.",
  },
];

const workflowSteps = [
  "Admin creates college and assigns HOD.",
  "HOD configures department, teachers, coordinators and subjects.",
  "Teacher or coordinator generates student invite link/code.",
  "Student joins, completes profile, and registers face through OpenCV flow.",
  "Teacher starts attendance session; students scan face with geo check.",
  "Reports are visible role-wise with secure backend validations.",
];

const roleCards = [
  { role: "Admin", text: "Manage institute structure, departments and HOD assignment." },
  { role: "HOD", text: "Control academic setup, staff allocation and class ownership." },
  { role: "Teacher", text: "Run classrooms, start live attendance and monitor reports." },
  { role: "Coordinator", text: "Support class operations and student onboarding invites." },
  { role: "Student", text: "Register face once, join classes, mark attendance securely." },
  { role: "Parent", text: "Track linked child details and attendance visibility." },
];

const faqs = [
  {
    q: "Does frontend run AI face recognition?",
    a: "No. Frontend only captures input and sends it to backend/OpenCV service.",
  },
  {
    q: "Can users manually enter college/subject IDs?",
    a: "No. Sensitive IDs are auto-fetched from backend and hidden from users.",
  },
  {
    q: "Is this ready for role-based operations?",
    a: "Yes. Each role has protected routes and dedicated workflow screens.",
  },
];

export default function LandingPage() {
  useEffect(() => {
    const elements = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 }
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_20%_20%,#dfeaff_0%,#f5f9ff_40%,#ffffff_100%)] text-slate-900">
      <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-4 md:px-6">
          <Link href="/" className="text-xl font-semibold text-[#135ed8]">
            VisionAttend
          </Link>

          <nav className="hidden items-center gap-6 text-sm text-slate-700 md:flex">
            <a href="#features" className="hover:text-[#135ed8]">Features</a>
            <a href="#workflow" className="hover:text-[#135ed8]">Workflow</a>
            <a href="#roles" className="hover:text-[#135ed8]">Roles</a>
            <a href="#faq" className="hover:text-[#135ed8]">FAQ</a>
          </nav>

          <div className="flex items-center gap-2">
            <Link href="/auth" className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700">
              Login
            </Link>
            <Link href="/auth" className="rounded-lg bg-[#135ed8] px-4 py-2 text-sm font-semibold text-white">
              Register
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto grid w-full max-w-7xl gap-8 px-4 pb-10 pt-14 md:grid-cols-[1.2fr_0.8fr] md:px-6 md:pt-20">
          <div data-reveal>
            <p className="inline-flex rounded-full border border-[#135ed8]/20 bg-[#135ed8]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em] text-[#135ed8]">
              AI Smart Attendance ERP
            </p>
            <h1 className="mt-5 text-4xl font-bold leading-tight md:text-5xl">
              AI Powered Smart Attendance System for Modern Campuses
            </h1>
            <p className="mt-4 max-w-2xl text-base text-slate-600 md:text-lg">
              Secure Face Recognition plus GeoLocation validation integrated with your existing backend and OpenCV pipeline.
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/auth" className="rounded-xl bg-[#135ed8] px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-[#135ed8]/25">
                Get Started
              </Link>
              <a href="#workflow" className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700">
                See Workflow
              </a>
            </div>
          </div>

          <div data-reveal className="rounded-3xl border border-slate-200 bg-white p-5 shadow-lg">
            <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-slate-500">Platform Snapshot</h2>
            <ul className="mt-4 space-y-3 text-sm text-slate-700">
              <li className="rounded-xl bg-slate-50 px-4 py-3">Live attendance sessions with role authorization.</li>
              <li className="rounded-xl bg-slate-50 px-4 py-3">Invite-based student onboarding with token/code flow.</li>
              <li className="rounded-xl bg-slate-50 px-4 py-3">OpenCV-verified face registration and attendance mark.</li>
              <li className="rounded-xl bg-slate-50 px-4 py-3">Department and classroom level reporting visibility.</li>
            </ul>
          </div>
        </section>

        <section id="features" className="mx-auto w-full max-w-7xl px-4 py-8 md:px-6">
          <h2 data-reveal className="text-2xl font-semibold">Core Features</h2>
          <p data-reveal className="mt-2 text-sm text-slate-600">Everything connected to your existing backend logic, without duplicate AI on frontend.</p>
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {platformHighlights.map((item, index) => (
              <article key={item.title} data-reveal style={{ transitionDelay: `${index * 70}ms` }} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="text-base font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm text-slate-600">{item.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="workflow" className="mx-auto w-full max-w-7xl px-4 py-8 md:px-6">
          <div data-reveal className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
            <h2 className="text-2xl font-semibold">End-to-End Workflow</h2>
            <div className="mt-5 grid gap-3">
              {workflowSteps.map((step, index) => (
                <div key={step} data-reveal style={{ transitionDelay: `${index * 50}ms` }} className="flex gap-3 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#135ed8] text-xs font-semibold text-white">
                    {index + 1}
                  </span>
                  <p>{step}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="roles" className="mx-auto w-full max-w-7xl px-4 py-8 md:px-6">
          <h2 data-reveal className="text-2xl font-semibold">Role Modules</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {roleCards.map((item, index) => (
              <article key={item.role} data-reveal style={{ transitionDelay: `${index * 70}ms` }} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="text-base font-semibold text-[#135ed8]">{item.role}</h3>
                <p className="mt-2 text-sm text-slate-600">{item.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="faq" className="mx-auto w-full max-w-7xl px-4 pb-14 pt-8 md:px-6">
          <h2 data-reveal className="text-2xl font-semibold">FAQ</h2>
          <div className="mt-5 space-y-3">
            {faqs.map((item, index) => (
              <article key={item.q} data-reveal style={{ transitionDelay: `${index * 60}ms` }} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-900">{item.q}</h3>
                <p className="mt-2 text-sm text-slate-600">{item.a}</p>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-10 text-sm md:grid-cols-3 md:px-6">
          <div>
            <h3 className="text-base font-semibold text-[#135ed8]">VisionAttend</h3>
            <p className="mt-2 text-slate-600">Full-stack AI attendance platform with role-based ERP control.</p>
          </div>
          <div>
            <h4 className="font-semibold">Quick Links</h4>
            <ul className="mt-2 space-y-1 text-slate-600">
              <li><a href="#features">Features</a></li>
              <li><a href="#workflow">Workflow</a></li>
              <li><a href="#roles">Roles</a></li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold">Access</h4>
            <div className="mt-2 flex flex-wrap gap-2">
              <Link href="/auth" className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700">Login</Link>
              <Link href="/auth" className="rounded-lg bg-[#135ed8] px-3 py-1.5 text-xs font-semibold text-white">Register</Link>
            </div>
          </div>
        </div>
        <div className="border-t border-slate-200 py-3 text-center text-xs text-slate-500">
          VisionAttend ERP | OpenCV Face + Geo Validation | Secure Campus Attendance
        </div>
      </footer>

      <style jsx>{`
        [data-reveal] {
          opacity: 0;
          transform: translateY(18px);
          transition: opacity 500ms ease, transform 500ms ease;
          will-change: opacity, transform;
        }
        [data-reveal].is-visible {
          opacity: 1;
          transform: translateY(0);
        }
      `}</style>
    </div>
  );
}
