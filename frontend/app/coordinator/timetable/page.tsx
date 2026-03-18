import { useAuth } from "@/src/context/auth-context";
import { ProtectedRoute } from "@/src/components/protected-route";
import { DashboardLayout } from "@/src/layouts/dashboard-layout";

export default function CoordinatorTimetablePage() {
  const { user } = useAuth();

  return (
    <ProtectedRoute allow={["coordinator", "admin"]}>
      <DashboardLayout title="Coordinator Timetable Management">
        <div className="p-6 text-center text-slate-500">
          Timetable scheduling has been removed.
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}