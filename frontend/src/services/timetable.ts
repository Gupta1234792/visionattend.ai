import api from "./api";

export type TimetableSlotType = "theory" | "practical" | "event" | "break";

export type TimetableSlotInput = {
  startTime: string;
  endTime?: string;
  subject: string;
  teacherName?: string;
  teacherId?: string;
  type: TimetableSlotType;
  notes?: string;
  order?: number;
};

export type TimetableSlot = TimetableSlotInput & {
  _id?: string;
  teacherId?: string | { _id: string; name: string; email?: string };
};

export type Timetable = {
  _id: string;
  classLabel: string;
  date: string;
  batchKey: string;
  year: string;
  division: string;
  isPublished: boolean;
  slots: TimetableSlot[];
  createdAt: string;
  updatedAt: string;
};

export type TimetableTemplate = {
  _id: string;
  templateName: string;
  classLabel: string;
  weekday: number;
  batchKey: string;
  year: string;
  division: string;
  slots: TimetableSlot[];
  createdAt: string;
  updatedAt: string;
};

export async function createTimetable(payload: {
  classLabel: string;
  year: string;
  division: string;
  date: string;
  slots: TimetableSlotInput[];
  isPublished: boolean;
}) {
  const { data } = await api.post("/timetable/create", payload);
  return data as { success: boolean; timetable?: Timetable; message?: string };
}

export async function updateTimetable(timetableId: string, payload: {
  classLabel?: string;
  date?: string;
  slots?: TimetableSlotInput[];
  isPublished?: boolean;
}) {
  const { data } = await api.put(`/timetable/update/${timetableId}`, payload);
  return data as { success: boolean; timetable?: Timetable; message?: string };
}

export async function deleteTimetable(timetableId: string) {
  const { data } = await api.delete(`/timetable/delete/${timetableId}`);
  return data as { success: boolean; message?: string };
}

export async function duplicateTimetable(
  timetableId: string,
  payload: { targetDate: string; classLabel?: string; isPublished?: boolean }
) {
  const { data } = await api.post(`/timetable/duplicate/${timetableId}`, payload);
  return data as { success: boolean; timetable?: Timetable; message?: string };
}

export async function getClassTimetable(classKey: string, date?: string) {
  const { data } = await api.get(`/timetable/class/${classKey}`, { params: { date } });
  return data as { success: boolean; timetable?: Timetable; message?: string };
}

export async function getTeacherTimetable(teacherId = "me", date?: string) {
  const { data } = await api.get(`/timetable/teacher/${teacherId}`, { params: { date } });
  return data as {
    success: boolean;
    lectures?: Array<{
      timetableId: string;
      classLabel: string;
      date: string;
      slot: TimetableSlot;
    }>;
    message?: string;
  };
}

export async function getWeeklyTimetable(batchKey?: string) {
  const { data } = await api.get("/timetable/weekly", { params: { batchKey } });
  return data as { success: boolean; timetables?: Timetable[]; message?: string };
}

export async function getTimetableTemplates(batchKey?: string) {
  const { data } = await api.get("/timetable/templates", { params: { batchKey } });
  return data as { success: boolean; templates?: TimetableTemplate[]; message?: string };
}

export async function createTimetableTemplate(payload: {
  templateName: string;
  classLabel: string;
  year: string;
  division: string;
  weekday: number;
  slots: TimetableSlotInput[];
}) {
  const { data } = await api.post("/timetable/templates", payload);
  return data as { success: boolean; template?: TimetableTemplate; message?: string };
}

export async function updateTimetableTemplate(templateId: string, payload: {
  templateName?: string;
  classLabel?: string;
  weekday?: number;
  slots?: TimetableSlotInput[];
}) {
  const { data } = await api.put(`/timetable/templates/${templateId}`, payload);
  return data as { success: boolean; template?: TimetableTemplate; message?: string };
}

export async function deleteTimetableTemplate(templateId: string) {
  const { data } = await api.delete(`/timetable/templates/${templateId}`);
  return data as { success: boolean; message?: string };
}

export async function applyTimetableTemplate(
  templateId: string,
  payload: { startDate: string; endDate: string; isPublished?: boolean }
) {
  const { data } = await api.post(`/timetable/templates/${templateId}/apply`, payload);
  return data as {
    success: boolean;
    message?: string;
    created?: Array<{ id: string; date: string }>;
    skipped?: Array<{ date: string; reason: string }>;
  };
}

export async function bulkApplyTimetableTemplates(payload: {
  year: string;
  division: string;
  startDate: string;
  endDate: string;
  isPublished?: boolean;
  classLabel?: string;
}) {
  const { data } = await api.post("/timetable/templates/bulk-apply", payload);
  return data as {
    success: boolean;
    message?: string;
    created?: Array<{ id: string; date: string; templateName?: string }>;
    skipped?: Array<{ date: string; reason: string; templateName?: string }>;
  };
}

export async function downloadTimetablePdf(timetableId: string) {
  const { data } = await api.get(`/timetable/export/${timetableId}/pdf`, {
    responseType: "blob"
  });
  return data as Blob;
}
