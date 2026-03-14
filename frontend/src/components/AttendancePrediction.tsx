"use client";

import { AlertTriangle, ArrowUpRight, TrendingDown } from "lucide-react";

export function AttendancePrediction({
  prediction,
  lowAttendanceAlert,
}: {
  prediction: {
    primaryMessage: string;
    riskMessage: string;
    ifAttendNext5: number;
    ifMissNext2: number;
    classesNeededFor75: number;
    threshold: number;
  } | null;
  lowAttendanceAlert: {
    active: boolean;
    threshold: number;
    classesNeeded: number;
    message: string;
  } | null;
}) {
  if (!prediction) return null;

  return (
    <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
      <section className="rounded-[1.8rem] border border-white/60 bg-[linear-gradient(135deg,rgba(15,23,42,0.88),rgba(37,99,235,0.82))] p-5 text-white shadow-[0_20px_50px_rgba(15,23,42,0.18)]">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-100/80">Attendance Prediction</p>
        <h2 className="mt-2 text-2xl font-semibold">Forward-Looking Insight</h2>
        <p className="mt-4 text-base text-slate-100">{prediction.primaryMessage}</p>
        <p className="mt-3 text-sm text-slate-200">{prediction.riskMessage}</p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
            <div className="flex items-center gap-2 text-sm text-sky-100">
              <ArrowUpRight className="h-4 w-4" />
              If you attend next 5
            </div>
            <p className="mt-3 text-3xl font-bold">{prediction.ifAttendNext5}%</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
            <div className="flex items-center gap-2 text-sm text-sky-100">
              <TrendingDown className="h-4 w-4" />
              If you miss next 2
            </div>
            <p className="mt-3 text-3xl font-bold">{prediction.ifMissNext2}%</p>
          </div>
        </div>
      </section>

      <section className={`rounded-[1.8rem] border p-5 shadow-[0_20px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl ${
        lowAttendanceAlert?.active
          ? "border-rose-200 bg-rose-50/80"
          : "border-emerald-200 bg-emerald-50/80"
      }`}>
        <div className="flex items-center gap-3">
          <span className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl ${
            lowAttendanceAlert?.active ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"
          }`}>
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Threshold Check</p>
            <h3 className="text-lg font-semibold text-slate-900">
              {lowAttendanceAlert?.active ? "Low Attendance Alert" : "Attendance Stable"}
            </h3>
          </div>
        </div>

        <p className="mt-4 text-sm text-slate-700">
          {lowAttendanceAlert?.active
            ? lowAttendanceAlert.message
            : `You are safely above ${prediction.threshold}%. Keep the streak going.`}
        </p>

        <div className="mt-5 rounded-2xl bg-white/80 p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Classes needed to reach {prediction.threshold}%</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{prediction.classesNeededFor75}</p>
        </div>
      </section>
    </div>
  );
}
