"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/src/context/auth-context";
import api from "@/src/services/api";
import { ProtectedRoute } from "@/src/components/protected-route";
import { DashboardLayout } from "@/src/layouts/dashboard-layout";
import { ToastItem, ToastStack } from "@/src/components/toast-stack";

type TimetableSlot = {
  startTime: string;
  endTime: string;
  subject: string;
  teacherName: string;
  teacherId: string;
  type: "lecture" | "practical" | "break" | "custom";
  notes: string;
  order: number;
};

type TimetableEntry = {
  _id: string;
  classLabel: string;
  date: string;
  department: { _id: string; name: string };
  batchKey: string;
  year: string;
  division: string;
  slots: TimetableSlot[];
  createdBy: { _id: string; name: string };
  isPublished: boolean;
  isActive: boolean;
};

type Subject = { _id: string; name: string; code: string; teacher: { _id: string; name: string } };
type Teacher = { _id: string; name: string; email: string; subjects: string[] };

export default function CoordinatorTimetablePage() {
  const { user } = useAuth();
  const [timetables, setTimetables] = useState<TimetableEntry[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [loading, setLoading] = useState(false);

  // Form states
  const [newEntry, setNewEntry] = useState({
    classLabel: "",
    date: "",
    department: "",
    year: "FY",
    division: "A",
    slots: [] as TimetableSlot[]
  });

  const [editingEntry, setEditingEntry] = useState<TimetableEntry | null>(null);

  const parseApiError = (error: unknown, fallback: string) => {
    const maybeMessage = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
    return maybeMessage || fallback;
  };

  const pushToast = (text: string, type: "success" | "error" | "info" = "info") => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((item) => item.id !== id)), 3200);
  };

  const loadTimetables = async () => {
    try {
      const res = await api.get("/timetables/range/TY_IT"); // Default batch
      setTimetables(res.data.timetables || []);
    } catch (error) {
      pushToast(parseApiError(error, "Failed to load timetables"), "error");
    }
  };

  const loadSubjects = async () => {
    if (!user?.department) return;
    try {
      const res = await api.get("/subjects/mine");
      setSubjects(res.data.subjects || []);
    } catch (error) {
      pushToast(parseApiError(error, "Failed to load subjects"), "error");
    }
  };

  const loadTeachers = async () => {
    if (!user?.department) return;
    try {
      const res = await api.get(`/classroom/${user.department}/teachers`);
      setTeachers(res.data.teachers || []);
    } catch (error) {
      pushToast(parseApiError(error, "Failed to load teachers"), "error");
    }
  };

  useEffect(() => {
    loadTimetables();
    loadSubjects();
    loadTeachers();
  }, []);

  const addSlot = () => {
    setNewEntry(prev => ({
      ...prev,
      slots: [...prev.slots, {
        startTime: "",
        endTime: "",
        subject: "",
        teacherName: "",
        teacherId: "",
        type: "lecture",
        notes: "",
        order: prev.slots.length
      }]
    }));
  };

  const removeSlot = (index: number) => {
    setNewEntry(prev => ({
      ...prev,
      slots: prev.slots.filter((_, i) => i !== index)
    }));
  };

  const updateSlot = (index: number, field: string, value: any) => {
    setNewEntry(prev => ({
      ...prev,
      slots: prev.slots.map((slot, i) =>
        i === index ? { ...slot, [field]: value } : slot
      )
    }));
  };

  const createTimetable = async () => {
    if (!newEntry.classLabel || !newEntry.date || !newEntry.department || !newEntry.slots.length) {
      pushToast("Please fill all required fields", "error");
      return;
    }

    setLoading(true);
    try {
      const res = await api.post("/timetables/manual", newEntry);
      pushToast("Timetable created successfully", "success");
      loadTimetables();
      setNewEntry({
        classLabel: "",
        date: "",
        department: "",
        year: "FY",
        division: "A",
        slots: []
      });
    } catch (error) {
      pushToast(parseApiError(error, "Failed to create timetable"), "error");
    } finally {
      setLoading(false);
    }
  };

  const updateTimetable = async () => {
    if (!editingEntry) return;
    setLoading(true);
    try {
      const res = await api.put(`/timetables/manual/${editingEntry._id}`, {
        classLabel: editingEntry.classLabel,
        date: editingEntry.date,
        slots: editingEntry.slots
      });
      pushToast("Timetable updated successfully", "success");
      loadTimetables();
      setEditingEntry(null);
    } catch (error) {
      pushToast(parseApiError(error, "Failed to update timetable"), "error");
    } finally {
      setLoading(false);
    }
  };

  const deleteTimetable = async (timetableId: string) => {
    setLoading(true);
    try {
      const res = await api.delete(`/timetables/manual/${timetableId}`);
      pushToast("Timetable deleted successfully", "success");
      loadTimetables();
    } catch (error) {
      pushToast(parseApiError(error, "Failed to delete timetable"), "error");
    } finally {
      setLoading(false);
    }
  };

  const getTeacherName = (teacherId: string) => {
    const teacher = teachers.find(t => t._id === teacherId);
    return teacher ? teacher.name : "";
  };

  const getSubjectName = (subjectId: string) => {
    const subject = subjects.find(s => s._id === subjectId);
    return subject ? subject.name : "";
  };

  return (
    <ProtectedRoute allow={["coordinator", "admin"]}>
      <DashboardLayout title="Coordinator Timetable Management">
        <ToastStack
          toasts={toasts}
          onDismiss={(id) => setToasts((prev) => prev.filter((item) => item.id !== id))}
        />
        
        <div className="grid gap-6 md:grid-cols-2">
          {/* Create New Timetable */}
          <section className="rounded-3xl border border-white/70 bg-white/75 p-4 shadow-[0_12px_35px_rgba(35,70,140,0.08)] backdrop-blur">
            <h2 className="text-base font-semibold">Create New Timetable Entry</h2>
            <p className="mt-2 text-sm text-slate-600">Add manual timetable entries for your batch</p>
            
            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <input
                  type="text"
                  placeholder="Class Label (e.g., TY-IT)"
                  value={newEntry.classLabel}
                  onChange={(e) => setNewEntry(prev => ({ ...prev, classLabel: e.target.value }))}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <input
                  type="date"
                  value={newEntry.date}
                  onChange={(e) => setNewEntry(prev => ({ ...prev, date: e.target.value }))}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              
              <div className="grid grid-cols-3 gap-4">
                <select
                  value={newEntry.year}
                  onChange={(e) => setNewEntry(prev => ({ ...prev, year: e.target.value }))}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="FY">FY</option>
                  <option value="SY">SY</option>
                  <option value="TY">TY</option>
                  <option value="FINAL">FINAL</option>
                </select>
                <select
                  value={newEntry.division}
                  onChange={(e) => setNewEntry(prev => ({ ...prev, division: e.target.value }))}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="A">A</option>
                  <option value="B">B</option>
                  <option value="C">C</option>
                </select>
                <input
                  type="text"
                  placeholder="Department ID"
                  value={newEntry.department}
                  onChange={(e) => setNewEntry(prev => ({ ...prev, department: e.target.value }))}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              {/* Slots Management */}
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="font-medium">Timetable Slots</h3>
                  <button
                    onClick={addSlot}
                    className="rounded-lg bg-[#135ed8] px-4 py-2 text-sm font-semibold text-white"
                  >
                    Add Slot
                  </button>
                </div>

                {newEntry.slots.map((slot, index) => (
                  <div key={index} className="rounded-lg border border-slate-200 p-4">
                    <div className="grid grid-cols-3 gap-4">
                      <input
                        type="time"
                        value={slot.startTime}
                        onChange={(e) => updateSlot(index, "startTime", e.target.value)}
                        className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                        placeholder="Start Time"
                      />
                      <input
                        type="time"
                        value={slot.endTime}
                        onChange={(e) => updateSlot(index, "endTime", e.target.value)}
                        className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                        placeholder="End Time (optional)"
                      />
                      <select
                        value={slot.type}
                        onChange={(e) => updateSlot(index, "type", e.target.value)}
                        className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      >
                        <option value="lecture">Lecture</option>
                        <option value="practical">Practical</option>
                        <option value="break">Break</option>
                        <option value="custom">Custom</option>
                      </select>
                    </div>
                    
                    <div className="mt-4 grid grid-cols-2 gap-4">
                      <input
                        type="text"
                        value={slot.subject}
                        onChange={(e) => updateSlot(index, "subject", e.target.value)}
                        className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                        placeholder="Subject Name"
                      />
                      <input
                        type="text"
                        value={slot.teacherName}
                        onChange={(e) => updateSlot(index, "teacherName", e.target.value)}
                        className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                        placeholder="Teacher Name (optional)"
                      />
                    </div>
                    
                    <input
                      type="text"
                      value={slot.notes}
                      onChange={(e) => updateSlot(index, "notes", e.target.value)}
                      className="mt-4 rounded-lg border border-slate-300 px-3 py-2 text-sm w-full"
                      placeholder="Additional Notes (optional)"
                    />
                    
                    <button
                      onClick={() => removeSlot(index)}
                      className="mt-2 rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-sm text-red-700"
                    >
                      Remove Slot
                    </button>
                  </div>
                ))}
              </div>

              <button
                onClick={createTimetable}
                disabled={loading || !newEntry.slots.length}
                className="w-full rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                Create Timetable Entry
              </button>
            </div>
          </section>

          {/* Existing Timetables */}
          <section className="rounded-3xl border border-white/70 bg-white/75 p-4 shadow-[0_12px_35px_rgba(35,70,140,0.08)] backdrop-blur">
            <h2 className="text-base font-semibold">Existing Timetables</h2>
            <p className="mt-2 text-sm text-slate-600">Manage and edit existing timetable entries</p>
            
            <div className="mt-4 space-y-4">
              {timetables.map((timetable) => (
                <div key={timetable._id} className="rounded-lg border border-slate-200 p-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-semibold">{timetable.classLabel}</h3>
                      <p className="text-sm text-slate-600">{timetable.date}</p>
                      <p className="text-xs text-slate-500">Batch: {timetable.batchKey}</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setEditingEntry(timetable)}
                        className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-1.5 text-sm text-blue-700"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deleteTimetable(timetable._id)}
                        className="rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-sm text-red-700"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  
                  <div className="mt-4 grid grid-cols-1 gap-2">
                    {timetable.slots.map((slot, index) => (
                      <div key={index} className="flex justify-between items-center p-2 bg-slate-50 rounded">
                        <div className="flex gap-4 text-sm">
                          <span className="font-medium">{slot.startTime} - {slot.endTime || "Onwards"}</span>
                          <span className={`px-2 py-1 rounded text-xs font-semibold ${slot.type === "break" ? "bg-orange-100 text-orange-700" : "bg-blue-100 text-blue-700"}`}>
                            {slot.type.toUpperCase()}
                          </span>
                          <span>{slot.subject}</span>
                          {slot.teacherName && <span className="text-slate-600">by {slot.teacherName}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {timetables.length === 0 && (
                <p className="text-slate-500">No timetables found</p>
              )}
            </div>
          </section>
        </div>

        {/* Edit Modal */}
        {editingEntry && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg p-6 w-full max-w-2xl">
              <h3 className="text-lg font-semibold mb-4">Edit Timetable Entry</h3>
              
              <div className="grid grid-cols-2 gap-4 mb-4">
                <input
                  type="text"
                  value={editingEntry.classLabel}
                  onChange={(e) => setEditingEntry(prev => prev ? { ...prev, classLabel: e.target.value } : null)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <input
                  type="date"
                  value={editingEntry.date}
                  onChange={(e) => setEditingEntry(prev => prev ? { ...prev, date: e.target.value } : null)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div className="space-y-4 mb-4">
                {editingEntry.slots.map((slot, index) => (
                  <div key={index} className="rounded-lg border border-slate-200 p-4">
                    <div className="grid grid-cols-3 gap-4">
                      <input
                        type="time"
                        value={slot.startTime}
                        onChange={(e) => setEditingEntry(prev => prev ? {
                          ...prev,
                          slots: prev.slots.map((s, i) => i === index ? { ...s, startTime: e.target.value } : s)
                        } : null)}
                        className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                      <input
                        type="time"
                        value={slot.endTime}
                        onChange={(e) => setEditingEntry(prev => prev ? {
                          ...prev,
                          slots: prev.slots.map((s, i) => i === index ? { ...s, endTime: e.target.value } : s)
                        } : null)}
                        className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                      <select
                        value={slot.type}
                        onChange={(e) => setEditingEntry(prev => prev ? {
                          ...prev,
                          slots: prev.slots.map((s, i) => i === index ? { ...s, type: e.target.value as any } : s)
                        } : null)}
                        className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      >
                        <option value="lecture">Lecture</option>
                        <option value="practical">Practical</option>
                        <option value="break">Break</option>
                        <option value="custom">Custom</option>
                      </select>
                    </div>
                    
                    <div className="mt-4 grid grid-cols-2 gap-4">
                      <input
                        type="text"
                        value={slot.subject}
                        onChange={(e) => setEditingEntry(prev => prev ? {
                          ...prev,
                          slots: prev.slots.map((s, i) => i === index ? { ...s, subject: e.target.value } : s)
                        } : null)}
                        className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                      <input
                        type="text"
                        value={slot.teacherName}
                        onChange={(e) => setEditingEntry(prev => prev ? {
                          ...prev,
                          slots: prev.slots.map((s, i) => i === index ? { ...s, teacherName: e.target.value } : s)
                        } : null)}
                        className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={updateTimetable}
                  disabled={loading}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Update Timetable
                </button>
                <button
                  onClick={() => setEditingEntry(null)}
                  className="rounded-lg border border-slate-300 bg-slate-50 px-4 py-2 text-sm text-slate-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </DashboardLayout>
    </ProtectedRoute>
  );
}