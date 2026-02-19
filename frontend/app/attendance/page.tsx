import Link from "next/link";

export default function LegacyAttendancePage() {
  return (
    <div className="mx-auto max-w-3xl p-8">
      <h1 className="text-xl font-semibold">Attendance Module Moved</h1>
      <p className="mt-2 text-sm text-slate-600">Teacher and Student attendance is now inside role dashboards.</p>
      <div className="mt-4 flex gap-3">
        <Link href="/teacher" className="rounded-lg bg-[#135ed8] px-4 py-2 text-sm text-white">Go Teacher</Link>
        <Link href="/student" className="rounded-lg border border-slate-300 px-4 py-2 text-sm">Go Student</Link>
      </div>
    </div>
  );
}
