"use client";

export function SubjectTable({
  rows,
}: {
  rows: Array<{
    subject: string;
    subjectCode?: string;
    present: number;
    absent: number;
    attendancePercentage: number;
  }>;
}) {
  return (
    <section className="rounded-[1.8rem] border border-white/60 bg-white/60 p-5 shadow-[0_20px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Subject Performance</p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-900">Per-Subject Attendance</h2>
        </div>
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[680px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="pb-3">Subject</th>
              <th className="pb-3">Present</th>
              <th className="pb-3">Absent</th>
              <th className="pb-3">Attendance %</th>
              <th className="pb-3">Progress</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const tone =
                row.attendancePercentage >= 85
                  ? "bg-emerald-100 text-emerald-700"
                  : row.attendancePercentage >= 75
                    ? "bg-amber-100 text-amber-700"
                    : "bg-rose-100 text-rose-700";

              return (
                <tr key={`${row.subject}-${row.subjectCode || ""}`} className="border-b border-slate-100">
                  <td className="py-4">
                    <p className="font-semibold text-slate-900">{row.subject}</p>
                    <p className="text-xs text-slate-500">{row.subjectCode || "Custom"}</p>
                  </td>
                  <td className="py-4 text-slate-700">{row.present}</td>
                  <td className="py-4 text-slate-700">{row.absent}</td>
                  <td className="py-4">
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${tone}`}>
                      {row.attendancePercentage}%
                    </span>
                  </td>
                  <td className="py-4">
                    <div className="h-2.5 w-full max-w-[220px] overflow-hidden rounded-full bg-slate-200">
                      <div
                        className={`h-full rounded-full ${
                          row.attendancePercentage >= 85
                            ? "bg-emerald-500"
                            : row.attendancePercentage >= 75
                              ? "bg-amber-500"
                              : "bg-rose-500"
                        }`}
                        style={{ width: `${Math.min(100, Math.max(4, row.attendancePercentage))}%` }}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-slate-500">
                  No subject analytics available yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
