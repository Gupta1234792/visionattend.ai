import Link from "next/link";

export default function LegacyLecturesPage() {
  return (
    <div className="mx-auto max-w-3xl p-8">
      <h1 className="text-xl font-semibold">Virtual Classroom Moved</h1>
      <p className="mt-2 text-sm text-slate-600">Use role dashboards to access lecture workflows.</p>
      <div className="mt-4 flex gap-3">
        <Link href="/teacher" className="rounded-lg bg-[#135ed8] px-4 py-2 text-sm text-white">Go Teacher</Link>
        <Link href="/student" className="rounded-lg border border-slate-300 px-4 py-2 text-sm">Go Student</Link>
      </div>
    </div>
  );
}
