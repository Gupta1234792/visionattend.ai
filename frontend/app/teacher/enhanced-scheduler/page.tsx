"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/src/context/auth-context";
import api from "@/src/services/api";
import { ProtectedRoute } from "@/src/components/protected-route";
import { DashboardLayout } from "@/src/layouts/dashboard-layout";
import { ToastItem, ToastStack } from "@/src/components/toast-stack";

type Subject = { _id: string; name: string; code: string };
type Batch = { department: string; year: string; division: string };
type Lecture = {
  _id: string;
  title: string;
  subjectId: { name: string; code: string };
  batchId: string;
  scheduledAt: string;
  durationMinutes: number;
  status: string;
  meetingLink: string;
};

export default function EnhancedSchedulerPage() {
  const { user } = useAuth();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [loading, setLoading] = useState(false);

  // Form states
  const [bulkForm, setBulkForm] = useState({
    lectures: [] as Array<{
      title: string;
      subjectId: string;
      batchId: string;
      scheduledAt: string;
      durationMinutes: number;
      purpose: string;
    }>,
    startDate: "",
    endDate: "",
    dailyLectures: 6,
    lectureDuration: 60
  });

  const [timetableForm, setTimetableForm] = useState({
    batchId: "",
    startDate: "",
    endDate: "",
    dailyLectures: 6,
    lectureDuration: 60
  });

  const [semesterForm, setSemesterForm] = useState({
    batchId: "",
    startDate: "",
    endDate: "",
    lecturesPerWeek: 3,
    lectureDuration: 60
  });

  const parseApiError = (error: unknown, fallback: string) => {
    const maybeMessage = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
    return maybeMessage || fallback;
  };

  const pushToast = (text: string, type: "success" | "error" | "info" = "info") => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((item) => item.id !== id)), 3200);
  };

  const loadSubjects = async () => {
    try {
      const res = await api.get("/subjects/mine");
      setSubjects(res.data.subjects || []);
    } catch (error) {
      pushToast(parseApiError(error, "Failed to load subjects"), "error");
    }
  };

  const loadBatches = async () => {
    if (!user?.department) return;
    try {
      const res = await api.get(`/classroom/${user.department}`);
      const batchInfo = res.data?.batchInfo;
      if (batchInfo) {
        setBatches([{
          department: batchInfo.departmentId || user.department,
          year: batchInfo.year || user.year || "FY",
          division: batchInfo.division || user.division || "A"
        }]);
      }
    } catch (error) {
      pushToast(parseApiError(error, "Failed to load batches"), "error");
    }
  };

  const loadLectures = async () => {
    try {
      const res = await api.get("/lectures/my");
      setLectures(res.data.lectures || []);
    } catch (error) {
      pushToast(parseApiError(error, "Failed to load lectures"), "error");
    }
  };

  useEffect(() => {
    loadSubjects();
    loadBatches();
    loadLectures();
  }, []);

  const addBulkLecture = () => {
    setBulkForm(prev => ({
      ...prev,
      lectures: [...prev.lectures, {
        title: "",
        subjectId: subjects[0]?._id || "",
        batchId: batches[0] ? `${batches[0].department}_${batches[0].year}_${batches[0].division}` : "",
        scheduledAt: "",
        durationMinutes: 60,
        purpose: ""
      }]
    }));
  };

  const removeBulkLecture = (index: number) => {
    setBulkForm(prev => ({
      ...prev,
      lectures: prev.lectures.filter((_, i) => i !== index)
    }));
  };

  const updateBulkLecture = (index: number, field: string, value: any) => {
    setBulkForm(prev => ({
      ...prev,
      lectures: prev.lectures.map((lecture, i) =>
        i === index ? { ...lecture, [field]: value } : lecture
      )
    }));
  };

  const scheduleBulkLectures = async () => {
    if (bulkForm.lectures.length === 0) {
      pushToast("Add at least one lecture to schedule", "error");
      return;
    }

    setLoading(true);
    try {
      const res = await api.post("/lectures/bulk", { lectures: bulkForm.lectures });
      pushToast(`Successfully created ${res.data.createdLectures.length} lectures`, "success");
      loadLectures();
      setBulkForm({
        lectures: [],
        startDate: "",
        endDate: "",
        dailyLectures: 6,
        lectureDuration: 60
      });
    } catch (error) {
      pushToast(parseApiError(error, "Failed to schedule lectures"), "error");
    } finally {
      setLoading(false);
    }
  };

  const generateWeeklyTimetable = async () => {
    if (!timetableForm.batchId || !timetableForm.startDate || !timetableForm.endDate) {
      pushToast("Please fill all required fields", "error");
      return;
    }

    setLoading(true);
    try {
      const res = await api.post("/timetables/weekly", timetableForm);
      pushToast(`Generated ${res.data.generatedLectures.length} lectures`, "success");
      loadLectures();
    } catch (error) {
      pushToast(parseApiError(error, "Failed to generate timetable"), "error");
    } finally {
      setLoading(false);
    }
  };

  const generateSemesterTimetable = async () => {
    if (!semesterForm.batchId || !semesterForm.startDate || !semesterForm.endDate) {
      pushToast("Please fill all required fields", "error");
      return;
    }

    setLoading(true);
    try {
      const res = await api.post("/timetables/semester", semesterForm);
      pushToast(`Generated ${res.data.generatedLectures.length} semester lectures`, "success");
      loadLectures();
    } catch (error) {
      pushToast(parseApiError(error, "Failed to generate semester timetable"), "error");
    } finally {
      setLoading(false);
    }
  };

  const cancelLectures = async (lectureIds: string[]) => {
    if (lectureIds.length === 0) {
      pushToast("Select lectures to cancel", "error");
      return;
    }

    setLoading(true);
    try {
      const res = await api.post("/lectures/cancel/bulk", {
        lectureIds,
        reason: "Canceled by teacher"
      });
      pushToast(`Canceled ${res.data.canceledLectures.length} lectures`, "success");
      loadLectures();
    } catch (error) {
      pushToast(parseApiError(error, "Failed to cancel lectures"), "error");
    } finally {
      setLoading(false);
    }
  };

  const getBatchId = (batch: Batch) => `${batch.department}_${batch.year}_${batch.division}`;

  return (
    <ProtectedRoute allow={["teacher", "coordinator"]}>
      <DashboardLayout title="Enhanced Lecture Scheduler">
        <ToastStack
          toasts={toasts}
          onDismiss={(id) => setToasts((prev) => prev.filter((item) => item.id !== id))}
        />
        
        <div className="grid gap-6 md:grid-cols-2">
          {/* Bulk Lecture Scheduling */}
          <section className="rounded-3xl border border-white/70 bg-white/75 p-4 shadow-[0_12px_35px_rgba(35,70,140,0.08)] backdrop-blur">
            <h2 className="text-base font-semibold">Bulk Lecture Scheduling</h2>
            <p className="mt-2 text-sm text-slate-600">Schedule multiple lectures at once</p>
            
            <div className="mt-4 space-y-4">
              {bulkForm.lectures.map((lecture, index) => (
                <div key={index} className="rounded-lg border border-slate-200 p-4">
                  <div className="grid grid-cols-2 gap-4">
                    <input
                      type="text"
                      placeholder="Lecture Title"
                      value={lecture.title}
                      onChange={(e) => updateBulkLecture(index, "title", e.target.value)}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                    <select
                      value={lecture.subjectId}
                      onChange={(e) => updateBulkLecture(index, "subjectId", e.target.value)}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    >
                      <option value="">Select Subject</option>
                      {subjects.map((subject) => (
                        <option key={subject._id} value={subject._id}>
                          {subject.name} ({subject.code})
                        </option>
                      ))}
                    </select>
                    <input
                      type="datetime-local"
                      value={lecture.scheduledAt}
                      onChange={(e) => updateBulkLecture(index, "scheduledAt", e.target.value)}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                    <input
                      type="number"
                      placeholder="Duration (minutes)"
                      value={lecture.durationMinutes}
                      onChange={(e) => updateBulkLecture(index, "durationMinutes", Number(e.target.value))}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                    <input
                      type="text"
                      placeholder="Purpose (optional)"
                      value={lecture.purpose}
                      onChange={(e) => updateBulkLecture(index, "purpose", e.target.value)}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm col-span-2"
                    />
                  </div>
                  <button
                    onClick={() => removeBulkLecture(index)}
                    className="mt-2 rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-sm text-red-700"
                  >
                    Remove
                  </button>
                </div>
              ))}
              
              <div className="flex gap-2">
                <button
                  onClick={addBulkLecture}
                  className="rounded-lg bg-[#135ed8] px-4 py-2 text-sm font-semibold text-white"
                >
                  Add Lecture
                </button>
                <button
                  onClick={scheduleBulkLectures}
                  disabled={loading || bulkForm.lectures.length === 0}
                  className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Schedule All
                </button>
              </div>
            </div>
          </section>

          {/* Weekly Timetable Generator */}
          <section className="rounded-3xl border border-white/70 bg-white/75 p-4 shadow-[0_12px_35px_rgba(35,70,140,0.08)] backdrop-blur">
            <h2 className="text-base font-semibold">Weekly Timetable Generator</h2>
            <p className="mt-2 text-sm text-slate-600">Generate automatic weekly schedule</p>
            
            <div className="mt-4 space-y-4">
              <select
                value={timetableForm.batchId}
                onChange={(e) => setTimetableForm(prev => ({ ...prev, batchId: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">Select Batch</option>
                {batches.map((batch) => (
                  <option key={getBatchId(batch)} value={getBatchId(batch)}>
                    {batch.department} - {batch.year} - {batch.division}
                  </option>
                ))}
              </select>
              
              <div className="grid grid-cols-2 gap-4">
                <input
                  type="date"
                  value={timetableForm.startDate}
                  onChange={(e) => setTimetableForm(prev => ({ ...prev, startDate: e.target.value }))}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <input
                  type="date"
                  value={timetableForm.endDate}
                  onChange={(e) => setTimetableForm(prev => ({ ...prev, endDate: e.target.value }))}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <input
                  type="number"
                  placeholder="Daily Lectures"
                  value={timetableForm.dailyLectures}
                  onChange={(e) => setTimetableForm(prev => ({ ...prev, dailyLectures: Number(e.target.value) }))}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <input
                  type="number"
                  placeholder="Lecture Duration"
                  value={timetableForm.lectureDuration}
                  onChange={(e) => setTimetableForm(prev => ({ ...prev, lectureDuration: Number(e.target.value) }))}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              
              <button
                onClick={generateWeeklyTimetable}
                disabled={loading}
                className="w-full rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                Generate Weekly Timetable
              </button>
            </div>
          </section>

          {/* Semester Timetable Generator */}
          <section className="rounded-3xl border border-white/70 bg-white/75 p-4 shadow-[0_12px_35px_rgba(35,70,140,0.08)] backdrop-blur">
            <h2 className="text-base font-semibold">Semester Timetable Generator</h2>
            <p className="mt-2 text-sm text-slate-600">Generate semester-long schedule</p>
            
            <div className="mt-4 space-y-4">
              <select
                value={semesterForm.batchId}
                onChange={(e) => setSemesterForm(prev => ({ ...prev, batchId: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">Select Batch</option>
                {batches.map((batch) => (
                  <option key={getBatchId(batch)} value={getBatchId(batch)}>
                    {batch.department} - {batch.year} - {batch.division}
                  </option>
                ))}
              </select>
              
              <div className="grid grid-cols-2 gap-4">
                <input
                  type="date"
                  value={semesterForm.startDate}
                  onChange={(e) => setSemesterForm(prev => ({ ...prev, startDate: e.target.value }))}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <input
                  type="date"
                  value={semesterForm.endDate}
                  onChange={(e) => setSemesterForm(prev => ({ ...prev, endDate: e.target.value }))}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <input
                  type="number"
                  placeholder="Lectures per Week"
                  value={semesterForm.lecturesPerWeek}
                  onChange={(e) => setSemesterForm(prev => ({ ...prev, lecturesPerWeek: Number(e.target.value) }))}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <input
                  type="number"
                  placeholder="Lecture Duration"
                  value={semesterForm.lectureDuration}
                  onChange={(e) => setSemesterForm(prev => ({ ...prev, lectureDuration: Number(e.target.value) }))}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              
              <button
                onClick={generateSemesterTimetable}
                disabled={loading}
                className="w-full rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                Generate Semester Timetable
              </button>
            </div>
          </section>

          {/* Lecture Management */}
          <section className="rounded-3xl border border-white/70 bg-white/75 p-4 shadow-[0_12px_35px_rgba(35,70,140,0.08)] backdrop-blur">
            <h2 className="text-base font-semibold">Lecture Management</h2>
            <p className="mt-2 text-sm text-slate-600">Manage your scheduled lectures</p>
            
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="py-2">Title</th>
                    <th className="py-2">Subject</th>
                    <th className="py-2">Date</th>
                    <th className="py-2">Status</th>
                    <th className="py-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {lectures.map((lecture) => (
                    <tr key={lecture._id} className="border-b border-slate-100">
                      <td className="py-2">{lecture.title}</td>
                      <td className="py-2">{lecture.subjectId.name}</td>
                      <td className="py-2">{new Date(lecture.scheduledAt).toLocaleString()}</td>
                      <td className="py-2">
                        <span className={`rounded-full px-2 py-1 text-xs font-semibold uppercase ${lecture.status === "LIVE" ? "bg-red-100 text-red-700" : lecture.status === "SCHEDULED" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`}>
                          {lecture.status}
                        </span>
                      </td>
                      <td className="py-2">
                        <button
                          onClick={() => cancelLectures([lecture._id])}
                          disabled={lecture.status === "LIVE" || lecture.status === "ENDED"}
                          className="rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-sm text-red-700 disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      </td>
                    </tr>
                  ))}
                  {lectures.length === 0 && (
                    <tr>
                      <td className="py-3 text-slate-500" colSpan={5}>No lectures found</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}