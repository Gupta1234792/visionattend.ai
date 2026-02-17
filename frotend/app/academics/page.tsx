import Link from "next/link";

export default function LegacyAcademicsPage() {
  return (
    <div className="mx-auto max-w-3xl p-8">
      <h1 className="text-xl font-semibold">Academics Module Moved</h1>
      <p className="mt-2 text-sm text-slate-600">Use role dashboards for this workflow.</p>
      <div className="mt-4 flex gap-3">
        <Link href="/admin" className="rounded-lg bg-[#135ed8] px-4 py-2 text-sm text-white">Go Admin</Link>
        <Link href="/hod" className="rounded-lg border border-slate-300 px-4 py-2 text-sm">Go HOD</Link>
      </div>
    </div>
  );
}
