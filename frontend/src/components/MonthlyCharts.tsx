"use client";

import type { ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const PIE_COLORS = ["#2563eb", "#ef4444"];

export function MonthlyCharts({
  monthlyAttendance,
  subjectStats,
  weeklyDistribution,
  attendanceBreakdown,
}: {
  monthlyAttendance: Array<{ month: string; percentage: number }>;
  subjectStats: Array<{ subject: string; attendancePercentage: number }>;
  weeklyDistribution: Array<{ day: string; percentage: number }>;
  attendanceBreakdown: Array<{ name: string; value: number }>;
}) {
  const topSubjects = subjectStats.slice(0, 6);

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <ChartCard title="Monthly Attendance Trend" subtitle="How your attendance changes across months.">
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={monthlyAttendance}>
            <CartesianGrid strokeDasharray="3 3" stroke="#dbe4f0" />
            <XAxis dataKey="month" stroke="#64748b" />
            <YAxis domain={[0, 100]} stroke="#64748b" />
            <Tooltip />
            <Line type="monotone" dataKey="percentage" stroke="#2563eb" strokeWidth={3} dot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Subject-wise Attendance" subtitle="Strongest and weakest subjects by attendance rate.">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={topSubjects}>
            <CartesianGrid strokeDasharray="3 3" stroke="#dbe4f0" />
            <XAxis dataKey="subject" stroke="#64748b" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={50} />
            <YAxis domain={[0, 100]} stroke="#64748b" />
            <Tooltip />
            <Bar dataKey="attendancePercentage" radius={[10, 10, 0, 0]} fill="#10b981" />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Weekly Distribution" subtitle="Attendance rhythm through the week.">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={weeklyDistribution}>
            <CartesianGrid strokeDasharray="3 3" stroke="#dbe4f0" />
            <XAxis dataKey="day" stroke="#64748b" />
            <YAxis domain={[0, 100]} stroke="#64748b" />
            <Tooltip />
            <Bar dataKey="percentage" radius={[10, 10, 0, 0]} fill="#f59e0b" />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Attendance vs Absence" subtitle="Quick ratio of attended versus missed classes.">
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Pie data={attendanceBreakdown} dataKey="value" nameKey="name" innerRadius={60} outerRadius={95} paddingAngle={4}>
              {attendanceBreakdown.map((entry, index) => (
                <Cell key={entry.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[1.8rem] border border-white/60 bg-white/60 p-5 shadow-[0_20px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">{title}</p>
      <p className="mt-2 text-sm text-slate-600">{subtitle}</p>
      <div className="mt-5 h-[280px]">{children}</div>
    </section>
  );
}
