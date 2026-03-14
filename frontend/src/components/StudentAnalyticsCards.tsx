"use client";

import type { ComponentType } from "react";
import { Activity, BookOpen, CalendarDays, Flame, ShieldAlert, UserCheck } from "lucide-react";

type MetricCard = {
  label: string;
  value: string;
  helper: string;
  tone: "green" | "yellow" | "red" | "blue";
  progress: number;
  icon: ComponentType<{ className?: string }>;
};

const toneClasses: Record<MetricCard["tone"], string> = {
  green: "from-emerald-500/20 to-emerald-100/60 text-emerald-900 ring-emerald-200",
  yellow: "from-amber-500/20 to-amber-100/60 text-amber-900 ring-amber-200",
  red: "from-rose-500/20 to-rose-100/60 text-rose-900 ring-rose-200",
  blue: "from-sky-500/20 to-sky-100/60 text-sky-900 ring-sky-200",
};

export function StudentAnalyticsCards({
  overallAttendance,
  totalClassesAttended,
  totalClassesMissed,
  totalLectures,
  streak,
  classesToday,
}: {
  overallAttendance: number;
  totalClassesAttended: number;
  totalClassesMissed: number;
  totalLectures: number;
  streak: number;
  classesToday: number;
}) {
  const attendanceTone = overallAttendance >= 85 ? "green" : overallAttendance >= 75 ? "yellow" : "red";

  const cards: MetricCard[] = [
    {
      label: "Overall Attendance",
      value: `${overallAttendance}%`,
      helper: overallAttendance >= 75 ? "Healthy range" : "Needs recovery",
      tone: attendanceTone,
      progress: overallAttendance,
      icon: Activity,
    },
    {
      label: "Classes Attended",
      value: String(totalClassesAttended),
      helper: "Present + remote entries",
      tone: "green",
      progress: totalLectures ? (totalClassesAttended / totalLectures) * 100 : 0,
      icon: UserCheck,
    },
    {
      label: "Classes Missed",
      value: String(totalClassesMissed),
      helper: "Marked absent sessions",
      tone: totalClassesMissed > 10 ? "red" : "yellow",
      progress: totalLectures ? (totalClassesMissed / totalLectures) * 100 : 0,
      icon: ShieldAlert,
    },
    {
      label: "Lectures Conducted",
      value: String(totalLectures),
      helper: "All batch sessions tracked",
      tone: "blue",
      progress: 100,
      icon: BookOpen,
    },
    {
      label: "Attendance Streak",
      value: `${streak} day${streak === 1 ? "" : "s"}`,
      helper: "Continuous attended days",
      tone: streak >= 5 ? "green" : "yellow",
      progress: Math.min(100, streak * 10),
      icon: Flame,
    },
    {
      label: "Classes Today",
      value: String(classesToday),
      helper: "Scheduled in your batch today",
      tone: "blue",
      progress: Math.min(100, classesToday * 20),
      icon: CalendarDays,
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <article
            key={card.label}
            className={`rounded-[1.6rem] border border-white/60 bg-gradient-to-br ${toneClasses[card.tone]} p-4 shadow-[0_20px_50px_rgba(15,23,42,0.08)] ring-1 backdrop-blur-xl`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  {card.label}
                </p>
                <p className="mt-3 text-3xl font-bold">{card.value}</p>
              </div>
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-white/70 shadow-sm">
                <Icon className="h-5 w-5" />
              </span>
            </div>

            <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-white/60">
              <div
                className="h-full rounded-full bg-slate-900/70 transition-all duration-500"
                style={{ width: `${Math.max(6, Math.min(100, card.progress))}%` }}
              />
            </div>

            <p className="mt-3 text-sm text-slate-600">{card.helper}</p>
          </article>
        );
      })}
    </div>
  );
}
