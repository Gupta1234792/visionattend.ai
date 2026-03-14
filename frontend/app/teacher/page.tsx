"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import api from "@/src/services/api";
import { ProtectedRoute } from "@/src/components/protected-route";
import { ToastItem, ToastStack } from "@/src/components/toast-stack";
import { DashboardLayout } from "@/src/layouts/dashboard-layout";
import { useAuth } from "@/src/context/auth-context";
import { buildBatchKey, buildBatchRoomId, buildLectureRoomId, connectCollegeSocket } from "@/src/services/socket";
import {
  AttendanceGeoMap,
  type AttendanceGeoPoint,
} from "@/src/components/AttendanceGeoMap";

type Subject = { _id: string; name: string; code: string };
type YearValue = "FY" | "SY" | "TY" | "FINAL";
type RemoteStream = { socketId: string; stream: MediaStream };
type ScheduledLecture = {
  _id: string;
  title: string;
  purpose?: string;
  scheduledAt: string;
  durationMinutes: number;
  meetingLink?: string;
  meetingRoomId?: string;
  startedAt?: string;
  endedAt?: string;
  status?: string;
  subjectId?: { name?: string; code?: string };
};
type SubjectAttendanceRow = {
  _id: string;
  status: "present" | "remote" | "absent";
  locationFlag?: "green" | "yellow" | "red";
  distanceMeters?: number | null;
  gpsDistance?: number | null;
  markedAt: string;
  student?: { name?: string; rollNo?: string };
};
type Announcement = {
  roomId?: string;
  message: string;
  sender?: { _id?: string; name?: string; role?: string };
  time?: string;
};
type ClassroomStudent = {
  _id: string;
  name: string;
  email: string;
  rollNo?: string;
  parentEmail?: string;
  year?: string;
  division?: string;
  faceRegisteredAt?: string | null;
};
type ClassroomSession = {
  _id: string;
  subject?: string | { _id?: string; name?: string; code?: string };
  teacher?: string | { _id?: string; name?: string; email?: string; role?: string };
  isActive?: boolean;
  date?: string;
  startTime?: string;
  endTime?: string;
  classKey?: string;
};
type ClassroomAttendance = {
  _id: string;
  session?: string;
  status?: "present" | "remote" | "absent";
  locationFlag?: "green" | "yellow" | "red";
  distanceMeters?: number | null;
  gpsDistance?: number | null;
  location?: { latitude?: number | null; longitude?: number | null };
  markedAt?: string;
  student?: { name?: string; rollNo?: string };
  subject?: { name?: string; code?: string };
};
type ClassroomCoordinator = {
  _id: string;
  name: string;
  email: string;
  year?: string;
  division?: string;
};
type ClassroomBatchInfo = {
  departmentId?: string;
  departmentName?: string;
  departmentCode?: string;
  year?: string;
  division?: string;
};
type TeacherGuardrails = {
  hasAssignedSubjects: boolean;
  assignedSubjectsCount: number;
  canStartAttendance: boolean;
  canScheduleLecture: boolean;
};

const years: YearValue[] = ["FY", "SY", "TY", "FINAL"];
const divisions = ["A", "B", "C"];

export default function TeacherPage() {
  const { user, token } = useAuth();

  const [message, setMessage] = useState("Teacher workflow ready.");
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [scheduledLectures, setScheduledLectures] = useState<ScheduledLecture[]>([]);
  const [reportRows, setReportRows] = useState<SubjectAttendanceRow[]>([]);
  const [classroomTeachers, setClassroomTeachers] = useState<Array<{ _id: string; name: string; email: string; subjects?: Array<{ name?: string; code?: string }> }>>([]);
  const [classroomCoordinators, setClassroomCoordinators] = useState<ClassroomCoordinator[]>([]);
  const [classroomBatchInfo, setClassroomBatchInfo] = useState<ClassroomBatchInfo | null>(null);
  const [classroomStudents, setClassroomStudents] = useState<ClassroomStudent[]>([]);
  const [classroomSessions, setClassroomSessions] = useState<ClassroomSession[]>([]);
  const [classroomAttendance, setClassroomAttendance] = useState<ClassroomAttendance[]>([]);
  const [inviteResult, setInviteResult] = useState<{ inviteLink: string; inviteCode: string } | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [guardrails, setGuardrails] = useState<TeacherGuardrails | null>(null);

  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [year, setYear] = useState<YearValue>((user?.year as YearValue) || "FY");
  const [division, setDivision] = useState(user?.division || "A");
  const [lectureForm, setLectureForm] = useState({
    title: "",
    scheduledAtLocal: "",
    durationMinutes: 60,
    subjectId: "",
    purpose: "",
  });


  const [liveClassActive, setLiveClassActive] = useState(false);
  const [activeLiveLecture, setActiveLiveLecture] = useState<ScheduledLecture | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<RemoteStream[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [announcementText, setAnnouncementText] = useState("");
  const liveLocalVideoRef = useRef<HTMLVideoElement | null>(null);
  const liveLocalStreamRef = useRef<MediaStream | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const [socketId, setSocketId] = useState("");

  const parseApiError = (error: unknown, fallback: string) => {
    const maybeMessage = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
    return maybeMessage || fallback;
  };
  const pushToast = (text: string, type: "success" | "error" | "info" = "info") => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 3200);
  };

  const batchKey = user?.department ? buildBatchKey(user.department, year, division) : "";
  const liveRoomId = batchKey ? buildBatchRoomId(batchKey) : "";
  const lectureRoomId = activeLiveLecture?.meetingRoomId ? buildLectureRoomId(activeLiveLecture.meetingRoomId) : "";
  const mediaRoomId = lectureRoomId || liveRoomId;
  const today = new Date().toISOString().split("T")[0];
  const getEffectiveSessionEndMs = (session: ClassroomSession) => {
    const startMs = new Date(session.startTime || 0).getTime();
    if (!startMs) return 0;
    const hardLimitEndMs = startMs + 10 * 60 * 1000;
    const storedEndMs = session.endTime ? new Date(session.endTime).getTime() : hardLimitEndMs;
    return Math.min(storedEndMs || hardLimitEndMs, hardLimitEndMs);
  };
  const activeAttendanceSession = classroomSessions.find(
    (session) =>
      Boolean(session.isActive) &&
      session.date === today &&
      getEffectiveSessionEndMs(session) > Date.now(),
  );
  const [sessionCountdownSeconds, setSessionCountdownSeconds] = useState(0);
  const selectedSubjectName = useMemo(() => {
    const selected = subjects.find((item) => item._id === selectedSubjectId);
    return selected?.name || "All Subjects";
  }, [subjects, selectedSubjectId]);
  const classroomTodayRows = useMemo(() => {
    const todaySessionIds = new Set(
      classroomSessions
        .filter((session) => session.date === today)
        .map((session) => String(session._id))
    );
    return classroomAttendance
      .filter((row) => row.session && todaySessionIds.has(String(row.session)))
      .sort((a, b) => new Date(b.markedAt || 0).getTime() - new Date(a.markedAt || 0).getTime());
  }, [classroomSessions, classroomAttendance, today]);
  const snapshot = useMemo(() => {
    const present = classroomTodayRows.filter((row) => row.status === "present").length;
    const remote = classroomTodayRows.filter((row) => row.status === "remote").length;
    const absent = classroomTodayRows.filter((row) => row.status === "absent").length;
    const faceRegistered = classroomStudents.filter((student) => Boolean(student.faceRegisteredAt)).length;
    return {
      totalStudents: classroomStudents.length,
      faceRegistered,
      present,
      remote,
      absent,
    };
  }, [classroomTodayRows, classroomStudents]);
  const pendingActions = useMemo(() => {
    const items: string[] = [];
    if (user?.role === "teacher" && guardrails && !guardrails.hasAssignedSubjects) {
      items.push("No subject assigned. Ask HOD to map subjects.");
    }
    if (classroomCoordinators.length === 0) {
      items.push("Class coordinator not assigned for selected batch.");
    }
    if (snapshot.totalStudents > snapshot.faceRegistered) {
      items.push(`Face registration pending for ${snapshot.totalStudents - snapshot.faceRegistered} students.`);
    }
    if (!activeAttendanceSession) {
      items.push("No active attendance session for this batch today.");
    }
    return items;
  }, [user?.role, guardrails, classroomCoordinators.length, snapshot, activeAttendanceSession]);
  const classroomGeoPoints = useMemo<AttendanceGeoPoint[]>(
    () =>
      classroomTodayRows
        .filter(
          (row) =>
            Number.isFinite(Number(row.location?.latitude)) &&
            Number.isFinite(Number(row.location?.longitude)),
        )
        .map((row) => ({
          id: row._id,
          latitude: Number(row.location?.latitude),
          longitude: Number(row.location?.longitude),
          flag: row.locationFlag || "green",
          label: `${row.student?.name || "Student"}${row.student?.rollNo ? ` (${row.student.rollNo})` : ""}`,
          meta: `${row.subject?.name || "-"} | ${row.status || "-"} | ${row.markedAt ? new Date(row.markedAt).toLocaleTimeString() : "-"}`,
        })),
    [classroomTodayRows],
  );

  const addRemoteStream = (peerSocketId: string, stream: MediaStream) => {
    setRemoteStreams((prev) => {
      const exists = prev.find((item) => item.socketId === peerSocketId);
      if (exists) {
        return prev.map((item) => (item.socketId === peerSocketId ? { socketId: peerSocketId, stream } : item));
      }
      return [...prev, { socketId: peerSocketId, stream }];
    });
  };

  const removeRemoteStream = (peerSocketId: string) => {
    setRemoteStreams((prev) => prev.filter((item) => item.socketId !== peerSocketId));
  };

  const closePeer = (peerSocketId: string) => {
    const peer = peersRef.current.get(peerSocketId);
    if (peer) {
      peer.ontrack = null;
      peer.onicecandidate = null;
      peer.close();
      peersRef.current.delete(peerSocketId);
    }
    removeRemoteStream(peerSocketId);
  };

  const createPeer = (peerSocketId: string, roomId: string) => {
    const existing = peersRef.current.get(peerSocketId);
    if (existing) return existing;

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    pc.onicecandidate = (event) => {
      if (!event.candidate || !socketRef.current) return;
      socketRef.current.emit("webrtc-signal", {
        roomId,
        to: peerSocketId,
        signal: { type: "ice-candidate", candidate: event.candidate },
      });
    };

    pc.ontrack = (event) => {
      const [stream] = event.streams;
      if (stream) addRemoteStream(peerSocketId, stream);
    };

    if (liveLocalStreamRef.current) {
      liveLocalStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, liveLocalStreamRef.current as MediaStream);
      });
    }

    peersRef.current.set(peerSocketId, pc);
    return pc;
  };

  const broadcastReady = (roomIdOverride?: string) => {
    const roomId = roomIdOverride || mediaRoomId;
    if (!socketRef.current || !roomId) return;
    socketRef.current.emit("join-room", { roomId });
    socketRef.current.emit("webrtc-ready", { roomId });
  };

  const openLiveMedia = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    liveLocalStreamRef.current = stream;
    if (liveLocalVideoRef.current) {
      liveLocalVideoRef.current.srcObject = stream;
    }
  };

  const stopLiveClass = () => {
    peersRef.current.forEach((_, peerSocketId) => closePeer(peerSocketId));
    setRemoteStreams([]);

    if (liveLocalStreamRef.current) {
      liveLocalStreamRef.current.getTracks().forEach((track) => track.stop());
      liveLocalStreamRef.current = null;
    }

    setLiveClassActive(false);
  };

  const loadSubjects = async () => {
    try {
      const res = await api.get("/subjects/mine");
      const list = res.data.subjects || [];
      setSubjects(list);
      if (!selectedSubjectId && list[0]) {
        setSelectedSubjectId(list[0]._id);
      }
    } catch (error) {
      setMessage(parseApiError(error, "Failed to load subjects"));
    }
  };

  const loadClassroom = async () => {
    if (!batchKey) return;
    try {
      const res = await api.get(`/classroom/${batchKey}`);
      setClassroomTeachers(res.data.teachers || []);
      setClassroomCoordinators(res.data.coordinators || []);
      setClassroomBatchInfo(res.data.batchInfo || null);
      setClassroomStudents(res.data.students || []);
      setClassroomSessions(res.data.sessions || []);
      setClassroomAttendance(res.data.attendance || []);
    } catch {
      setClassroomTeachers([]);
      setClassroomCoordinators([]);
      setClassroomBatchInfo(null);
      setClassroomStudents([]);
      setClassroomSessions([]);
      setClassroomAttendance([]);
    }
  };

  const loadAnnouncements = async () => {
    if (!liveRoomId) return;
    try {
      const res = await api.get(`/chat/room/${liveRoomId}`);
      const history = (res.data?.messages || []).map((item: { message: string; sender?: { name?: string; role?: string; _id?: string }; createdAt?: string }) => ({
        roomId: liveRoomId,
        message: item.message,
        sender: item.sender,
        time: item.createdAt,
      }));
      setAnnouncements(history);
    } catch {
      setAnnouncements([]);
    }
  };

  const loadMyLectures = async () => {
    try {
      const res = await api.get("/lectures/my");
      const lectures = res.data?.lectures || [];
      setScheduledLectures(lectures);
      const liveLecture = lectures.find((lecture: ScheduledLecture) => String(lecture.status || "").toUpperCase() === "LIVE") || null;
      setActiveLiveLecture(liveLecture);
    } catch {
      setScheduledLectures([]);
      setActiveLiveLecture(null);
    }
  };

  const loadGuardrails = async () => {
    if (user?.role !== "teacher") return;
    try {
      const res = await api.get("/teachers/me/guardrails");
      setGuardrails(res.data?.guardrails || null);
    } catch {
      setGuardrails(null);
    }
  };

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    const timer = setTimeout(() => {
      void loadSubjects();
      void loadGuardrails();
      void loadClassroom();
      void loadAnnouncements();
      void loadMyLectures();
    }, 0);
    return () => clearTimeout(timer);
  }, [year, division, liveRoomId]);
  /* eslint-enable react-hooks/exhaustive-deps */

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    if (!batchKey) return;
    const interval = setInterval(() => {
      void loadClassroom();
      void loadMyLectures();
    }, 25000);
    return () => clearInterval(interval);
  }, [batchKey]);
  /* eslint-enable react-hooks/exhaustive-deps */

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    if (!token || !user?.college) return;

    const socket = connectCollegeSocket(token, user.college);
    socketRef.current = socket;

    socket.on("connect", () => {
      setSocketId(socket.id || "");
      if (liveRoomId) {
        socket.emit("join-room", { roomId: liveRoomId });
      }
      if (mediaRoomId) {
        socket.emit("join-room", { roomId: mediaRoomId });
      }
    });

    socket.on("chat-message", (payload: Announcement) => {
      if (payload?.roomId && payload.roomId !== liveRoomId) return;
      setAnnouncements((prev) => [...prev, payload]);
    });

    socket.on("ATTENDANCE_SESSION_STARTED", () => {
      void loadClassroom();
      pushToast("Attendance session started (realtime update).", "info");
    });

    socket.on("ATTENDANCE_MARKED", () => {
      void loadClassroom();
    });

    socket.on("ATTENDANCE_SESSION_CLOSED", () => {
      void loadClassroom();
      pushToast("Attendance session closed.", "info");
    });

    socket.on("LECTURE_STARTED", () => {
      void loadMyLectures();
      pushToast("Scheduled lecture is now live.", "success");
    });

    socket.on("LECTURE_ENDED", () => {
      void loadMyLectures();
      if (liveClassActive) {
        stopLiveClass();
      }
      pushToast("Live lecture ended.", "info");
    });

    socket.on("room-peer-left", ({ roomId, socketId: peerSocketId }: { roomId: string; socketId: string }) => {
      if (roomId !== mediaRoomId) return;
      closePeer(peerSocketId);
    });

    socket.on("webrtc-ready", async ({ roomId, from }: { roomId: string; from: string }) => {
      if (!liveClassActive || roomId !== mediaRoomId || !from || from === socket.id) return;
      if (!socket.id || socket.id <= from) return;

      try {
        const pc = createPeer(from, roomId);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        socket.emit("webrtc-signal", {
          roomId,
          to: from,
          signal: { type: "offer", sdp: offer },
        });
      } catch {
        setMessage("Failed to initiate peer connection.");
      }
    });

    socket.on("webrtc-signal", async ({ roomId, from, signal }: { roomId: string; from: string; signal: { type: string; sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit } }) => {
      if (!liveClassActive || roomId !== mediaRoomId || !from || from === socket.id) return;

      try {
        const pc = createPeer(from, roomId);

        if (signal.type === "offer" && signal.sdp) {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          socket.emit("webrtc-signal", {
            roomId,
            to: from,
            signal: { type: "answer", sdp: answer },
          });
          return;
        }

        if (signal.type === "answer" && signal.sdp) {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
          return;
        }

        if (signal.type === "ice-candidate" && signal.candidate) {
          await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
        }
      } catch {
        setMessage("Realtime media sync failed.");
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, user?.college, liveRoomId, mediaRoomId, liveClassActive]);
  /* eslint-enable react-hooks/exhaustive-deps */

  useEffect(() => {
    if (!activeAttendanceSession?.startTime) {
      setSessionCountdownSeconds(0);
      return;
    }
    const update = () => {
      const startMs = new Date(activeAttendanceSession.startTime || 0).getTime();
      const hardLimitEndMs = startMs + 10 * 60 * 1000;
      const storedEndMs = activeAttendanceSession.endTime
        ? new Date(activeAttendanceSession.endTime || 0).getTime()
        : hardLimitEndMs;
      const effectiveEndMs = Math.min(storedEndMs || hardLimitEndMs, hardLimitEndMs);
      const diffMs = effectiveEndMs - Date.now();
      setSessionCountdownSeconds(Math.max(0, Math.floor(diffMs / 1000)));
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [activeAttendanceSession?.startTime, activeAttendanceSession?.endTime]);


  const getLocation = () =>
    new Promise<{ latitude: number; longitude: number }>((resolve, reject) => {
      const devBypassEnabled = process.env.NEXT_PUBLIC_DEV_BYPASS === "true";
      const fallbackFromCollege = async () => {
        try {
          const res = await api.get("/colleges");
          const firstCollege = (res.data?.colleges || [])[0];
          const latitude = Number(firstCollege?.location?.latitude);
          const longitude = Number(firstCollege?.location?.longitude);
          if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
            setMessage("Live location blocked on this mobile URL. Using college location for dev test.");
            resolve({ latitude, longitude });
            return true;
          }
          return false;
        } catch {
          return false;
        }
      };

      if (!navigator.geolocation) {
        if (devBypassEnabled) {
          void fallbackFromCollege().then((ok) => {
            if (!ok) reject(new Error("Location access denied"));
          });
          return;
        }
        reject(new Error("Location access denied"));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        },
        async () => {
          if (devBypassEnabled) {
            const ok = await fallbackFromCollege();
            if (ok) return;
          }
          reject(new Error("Location access denied"));
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });

  const startAttendance = async () => {
    const attendanceSubjectId = selectedSubjectId || subjects[0]?._id || "";
    if (!attendanceSubjectId) {
      setMessage("No mapped subject found to anchor the daily attendance session.");
      return;
    }

    try {
      const location = await getLocation();

      const res = await api.post("/attendance/start", {
        subjectId: attendanceSubjectId,
        year,
        division,
        latitude: location.latitude,
        longitude: location.longitude
      });

      setMessage(res.data?.message || "Attendance started.");
      pushToast(res.data?.message || "Attendance session started.", "success");
      if (res.data?.session) {
        setClassroomSessions((prev) => [res.data.session, ...prev]);
      }
    } catch (error) {
      const msg = parseApiError(error, "Failed to start attendance session.");
      setMessage(msg);
      pushToast(msg, "error");
    }
  };

  const createInvite = async () => {
    try {
      const res = await api.post("/student-invite", {
        departmentId: user?.department,
        year,
        division,
      });
      setInviteResult({
        inviteLink: res.data?.inviteLink || "",
        inviteCode: res.data?.inviteCode || res.data?.invite?.inviteCode || "",
      });
      setMessage("Student invite generated. Share link or code.");
      pushToast("Student invite generated successfully.", "success");
    } catch (error) {
      const msg = parseApiError(error, "Failed to generate invite.");
      setMessage(msg);
      pushToast(msg, "error");
    }
  };

  const scheduleLecture = async () => {
    if (!user?.department) {
      setMessage("Department context missing.");
      return;
    }
    if (!lectureForm.title || !lectureForm.subjectId || !lectureForm.scheduledAtLocal || !lectureForm.durationMinutes) {
      setMessage("Fill lecture title, subject, date-time and duration.");
      return;
    }

    try {
      const batchId = buildBatchKey(user.department, year, division);
      const scheduledAt = new Date(lectureForm.scheduledAtLocal).toISOString();
      const res = await api.post("/lectures", {
        title: lectureForm.title.trim(),
        subjectId: lectureForm.subjectId,
        batchId,
        scheduledAt,
        durationMinutes: Number(lectureForm.durationMinutes),
        purpose: lectureForm.purpose.trim(),
      });

      const created = res.data?.lecture;
      const subject = subjects.find((item) => item._id === lectureForm.subjectId);
      const meetingLink = created?.meetingLink || "";

      if (socketRef.current && liveRoomId) {
        socketRef.current.emit("chat-message", {
          roomId: liveRoomId,
          message: [
            `Lecture Scheduled: ${lectureForm.title}`,
            `Subject: ${subject?.name || "-"}`,
            `Teacher: ${user?.name || "Teacher"}`,
            `Time: ${new Date(scheduledAt).toLocaleString()}`,
            `Duration: ${lectureForm.durationMinutes} min`,
            `Purpose: ${lectureForm.purpose || "-"}`,
            `Join Link: ${meetingLink || "Will be shared"}`,
          ].join(" | "),
        });
      }

      setLectureForm({ title: "", scheduledAtLocal: "", durationMinutes: 60, subjectId: lectureForm.subjectId, purpose: "" });
      setMessage("Lecture scheduled and shared in classroom chat.");
      pushToast("Lecture scheduled and shared.", "success");
      void loadMyLectures();
    } catch (error) {
      const msg = parseApiError(error, "Failed to schedule lecture.");
      setMessage(msg);
      pushToast(msg, "error");
    }
  };

  const startScheduledLecture = async (lecture: ScheduledLecture) => {
    try {
      const res = await api.patch(`/lectures/${lecture._id}/start`);
      const updated = {
        ...lecture,
        ...res.data?.lecture,
        meetingLink: res.data?.lecture?.meetingLink || lecture.meetingLink,
      };
      setActiveLiveLecture(updated);
      await loadMyLectures();
      await startLiveClass(updated.meetingRoomId ? buildLectureRoomId(updated.meetingRoomId) : liveRoomId);
      setMessage("Lecture started live. Students can join on the same dashboard.");
      pushToast("Lecture started live.", "success");
    } catch (error) {
      const msg = parseApiError(error, "Failed to start live lecture.");
      setMessage(msg);
      pushToast(msg, "error");
    }
  };

  const endScheduledLecture = async (lecture: ScheduledLecture) => {
    try {
      await api.patch(`/lectures/${lecture._id}/end`);
      stopLiveClass();
      setActiveLiveLecture(null);
      await loadMyLectures();
      setMessage("Lecture ended successfully.");
      pushToast("Lecture ended.", "info");
    } catch (error) {
      const msg = parseApiError(error, "Failed to end live lecture.");
      setMessage(msg);
      pushToast(msg, "error");
    }
  };

  const loadReport = async () => {
    if (!selectedSubjectId) {
      setMessage("Select a subject first.");
      return;
    }
    try {
      const res = await api.get(`/reports/subject/${selectedSubjectId}`);
      setReportRows(res.data.records || []);
      setMessage("Detailed subject report loaded.");
      pushToast("Detailed report loaded.", "success");
    } catch (error) {
      const msg = parseApiError(error, "Failed to load report.");
      setMessage(msg);
      pushToast(msg, "error");
    }
  };

  const exportSubjectReport = async (format: "csv" | "pdf") => {
    if (!selectedSubjectId) {
      setMessage("Select a subject first.");
      return;
    }

    try {
      const endpoint = `/reports/subject/${selectedSubjectId}/${format}`;
      const res = await api.get(endpoint, { responseType: "blob" });
      const blobType = format === "pdf" ? "application/pdf" : "text/csv;charset=utf-8;";
      const blob = new Blob([res.data], { type: blobType });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      const selected = subjects.find((item) => item._id === selectedSubjectId);
      const subjectCode = selected?.code || "subject";
      link.href = url;
      link.setAttribute("download", `${subjectCode}_attendance_report.${format}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setMessage(`${format.toUpperCase()} report exported.`);
      pushToast(`${format.toUpperCase()} exported.`, "success");
    } catch (error) {
      const msg = parseApiError(error, `Failed to export ${format.toUpperCase()}.`);
      setMessage(msg);
      pushToast(msg, "error");
    }
  };

  const flagClass = (flag?: "green" | "yellow" | "red") => {
    if (flag === "green") return "bg-green-100 text-green-700";
    if (flag === "yellow") return "bg-yellow-100 text-yellow-700";
    return "bg-red-100 text-red-700";
  };

  const startLiveClass = async (roomIdOverride?: string) => {
    const roomId = roomIdOverride || mediaRoomId;
    if (!roomId) {
      setMessage("Department/year/division context missing.");
      return;
    }

    try {
      await openLiveMedia();
      setLiveClassActive(true);
      broadcastReady(roomId);
      setMessage("Live class started. Students can join in realtime.");
      pushToast("Live class started.", "success");
    } catch (error) {
      const name = (error as { name?: string })?.name || "";
      if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        setMessage("Camera not detected. Please connect a webcam.");
        return;
      }
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setMessage("Camera/Mic permission denied. Allow access in browser settings.");
        pushToast("Camera/Mic permission denied.", "error");
        return;
      }
      setMessage("Unable to start live class media.");
      pushToast("Unable to start live class media.", "error");
    }
  };

  const sendAnnouncement = () => {
    if (!socketRef.current || !liveRoomId || !announcementText.trim()) return;
    socketRef.current.emit("chat-message", {
      roomId: liveRoomId,
      message: announcementText.trim(),
    });
    setAnnouncementText("");
    pushToast("Announcement sent.", "success");
  };
  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      pushToast(`${label} copied.`, "success");
    } catch {
      pushToast(`Failed to copy ${label.toLowerCase()}.`, "error");
    }
  };
  const getLectureStatus = (lecture: ScheduledLecture) => {
    const backendStatus = String(lecture.status || "").toUpperCase();
    if (backendStatus === "CANCELED") return "Canceled";
    if (backendStatus === "LIVE") return "Live";
    if (backendStatus === "ENDED") return "Ended";
    const now = Date.now();
    const start = new Date(lecture.scheduledAt).getTime();
    const end = start + Number(lecture.durationMinutes || 0) * 60 * 1000;
    if (now < start) return "Upcoming";
    if (now >= start && now <= end) return "Live";
    return "Ended";
  };
  const lectureStatusClass = (status: string) => {
    if (status === "Live") return "bg-red-100 text-red-700";
    if (status === "Upcoming") return "bg-amber-100 text-amber-700";
    if (status === "Canceled") return "bg-rose-100 text-rose-700";
    return "bg-slate-100 text-slate-600";
  };

  return (
    <ProtectedRoute allow={["teacher", "coordinator"]}>
      <DashboardLayout title={user?.role === "coordinator" ? "Coordinator Classroom Dashboard" : "Teacher Dashboard"}>
        <ToastStack toasts={toasts} onDismiss={(id) => setToasts((prev) => prev.filter((item) => item.id !== id))} />
        <div className="grid gap-4 xl:grid-cols-2">
          {user?.role === "teacher" && guardrails && !guardrails.hasAssignedSubjects ? (
            <section className="rounded-2xl border border-amber-300 bg-amber-50 p-4 xl:col-span-2">
              <h2 className="text-base font-semibold text-amber-900">Subject Guardrail Active</h2>
              <p className="mt-1 text-sm text-amber-800">
                You are not assigned to any subject. HOD must map at least one subject before starting attendance or scheduling lectures.
              </p>
            </section>
          ) : null}
          <section className="rounded-3xl border border-white/70 bg-white/75 p-4 shadow-[0_12px_35px_rgba(35,70,140,0.08)] backdrop-blur xl:col-span-2">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <article className="rounded-2xl border border-white/80 bg-white/85 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Total Students</p>
                <p className="mt-1 text-3xl font-semibold text-slate-900">{snapshot.totalStudents}</p>
              </article>
              <article className="rounded-2xl border border-white/80 bg-white/85 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Face Registered</p>
                <p className="mt-1 text-3xl font-semibold text-slate-900">{snapshot.faceRegistered}</p>
              </article>
              <article className="rounded-2xl border border-white/80 bg-white/85 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Scheduled Lectures</p>
                <p className="mt-1 text-3xl font-semibold text-slate-900">{scheduledLectures.length}</p>
              </article>
              <article className="rounded-2xl border border-white/80 bg-white/85 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Attendance Session</p>
                <p className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${activeAttendanceSession ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-700"}`}>
                  {activeAttendanceSession ? "LIVE" : "OFFLINE"}
                </p>
              </article>
            </div>
          </section>
          <section className="rounded-3xl border border-white/70 bg-white/75 p-4 shadow-[0_12px_35px_rgba(35,70,140,0.08)] backdrop-blur">
            <h2 className="text-base font-semibold">My Subjects</h2>
            {subjects.length === 0 ? (
              <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700">
                No subject is mapped to this teacher yet. Ask HOD to assign subjects before attendance/lecture actions.
              </p>
            ) : null}
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              {subjects.map((subject) => (
                <li key={subject._id} className="rounded-lg border border-slate-200 px-3 py-2">
                  {subject.name} ({subject.code})
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-3xl border border-white/70 bg-white/75 p-4 shadow-[0_12px_35px_rgba(35,70,140,0.08)] backdrop-blur">
            <h2 className="text-base font-semibold">Today Classroom Snapshot</h2>
            <p className="mt-2 text-sm text-slate-600">{selectedSubjectName} | {year}-{division}</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-slate-200 p-3">
                <p className="text-xs text-slate-500">Students</p>
                <p className="text-lg font-semibold text-slate-900">{snapshot.totalStudents}</p>
              </div>
              <div className="rounded-lg border border-slate-200 p-3">
                <p className="text-xs text-slate-500">Face Registered</p>
                <p className="text-lg font-semibold text-slate-900">{snapshot.faceRegistered}</p>
              </div>
              <div className="rounded-lg border border-green-200 bg-green-50 p-3">
                <p className="text-xs text-green-700">Present</p>
                <p className="text-lg font-semibold text-green-800">{snapshot.present}</p>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs text-amber-700">Remote</p>
                <p className="text-lg font-semibold text-amber-800">{snapshot.remote}</p>
              </div>
            </div>
            <p className="mt-2 text-xs text-slate-600">
              Absent: {snapshot.absent} | Teachers in batch: {classroomTeachers.length} | Coordinators: {classroomCoordinators.length}
            </p>
            <div className="mt-2 rounded-lg border border-[#135ed8]/30 bg-[#135ed8]/5 px-3 py-2 text-xs text-slate-700">
              <p><span className="font-semibold text-slate-900">Department:</span> {classroomBatchInfo?.departmentName || "-"} ({classroomBatchInfo?.departmentCode || "-"})</p>
              <p className="mt-1"><span className="font-semibold text-slate-900">Class:</span> {classroomBatchInfo?.year || year}-{classroomBatchInfo?.division || division}</p>
            </div>
          </section>

          <section className="rounded-3xl border border-white/70 bg-white/75 p-4 shadow-[0_12px_35px_rgba(35,70,140,0.08)] backdrop-blur">
            <h2 className="text-base font-semibold">Pending Actions</h2>
            <p className="mt-2 text-sm text-slate-600">Quick checklist for today.</p>
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              {pendingActions.map((item) => (
                <li key={item} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">{item}</li>
              ))}
              {pendingActions.length === 0 ? <li className="text-slate-500">No urgent teacher action pending.</li> : null}
            </ul>
          </section>

          <section id="invite" className="rounded-3xl border border-white/70 bg-white/75 p-4 shadow-[0_12px_35px_rgba(35,70,140,0.08)] backdrop-blur">
            <h2 className="text-base font-semibold">Virtual Classroom Invite</h2>
            <p className="mt-2 text-sm text-slate-600">Invite students by class year and division.</p>
            <p className="mt-1 text-xs text-emerald-700">Generated link/code stays reusable for long term and can be shared with multiple students.</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <select className="rounded-lg border border-slate-300 px-3 py-2 text-sm" value={year} onChange={(e) => setYear(e.target.value as YearValue)}>
                {years.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <select className="rounded-lg border border-slate-300 px-3 py-2 text-sm" value={division} onChange={(e) => setDivision(e.target.value)}>
                {divisions.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </div>
            <button className="mt-3 rounded-lg bg-[#135ed8] px-4 py-2 text-sm font-semibold text-white" onClick={createInvite} type="button">
              Generate Invite Link
            </button>
            {inviteResult ? (
              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                <p className="font-medium text-slate-800">Invite Code: {inviteResult.inviteCode || "N/A"}</p>
                <p className="mt-1 break-all text-slate-700">{inviteResult.inviteLink}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" className="rounded border border-slate-300 px-2 py-1 text-xs" onClick={() => copyText(inviteResult.inviteCode, "Invite code")}>
                    Copy Code
                  </button>
                  <button type="button" className="rounded border border-slate-300 px-2 py-1 text-xs" onClick={() => copyText(inviteResult.inviteLink, "Invite link")}>
                    Copy Link
                  </button>
                </div>
              </div>
            ) : null}
          </section>

          <section className="rounded-3xl border border-white/70 bg-white/75 p-4 shadow-[0_12px_35px_rgba(35,70,140,0.08)] backdrop-blur">
            <h2 className="text-base font-semibold">Class Coordinator (Highlighted)</h2>
            <p className="mt-2 text-sm text-slate-600">Current coordinators for {classroomBatchInfo?.year || year}-{classroomBatchInfo?.division || division}.</p>
            <div className="mt-3 space-y-2">
              {classroomCoordinators.map((coordinator) => (
                <div key={coordinator._id} className="rounded-lg border border-violet-300 bg-violet-50 px-3 py-2">
                  <p className="text-sm font-semibold text-violet-900">{coordinator.name}</p>
                  <p className="text-xs text-violet-800">{coordinator.email}</p>
                </div>
              ))}
              {classroomCoordinators.length === 0 ? (
                <p className="text-sm text-slate-500">No class coordinator found for this division.</p>
              ) : null}
            </div>
          </section>

          <section className="rounded-3xl border border-white/70 bg-white/75 p-4 shadow-[0_12px_35px_rgba(35,70,140,0.08)] backdrop-blur xl:col-span-2">
            <h2 className="text-base font-semibold">Top 4 Teachers With Full Class Detail</h2>
            <p className="mt-2 text-sm text-slate-600">Department, class division and subject mapping summary.</p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {classroomTeachers.slice(0, 4).map((teacher) => (
                <article key={teacher._id} className="rounded-xl border border-slate-200 p-3">
                  <p className="text-sm font-semibold text-slate-900">{teacher.name}</p>
                  <p className="text-xs text-slate-600">{teacher.email}</p>
                  <p className="mt-2 text-xs text-slate-500">
                    Department: {classroomBatchInfo?.departmentName || "-"} ({classroomBatchInfo?.departmentCode || "-"})
                  </p>
                  <p className="text-xs text-slate-500">
                    Class: {classroomBatchInfo?.year || year}-{classroomBatchInfo?.division || division}
                  </p>
                  <p className="text-xs text-slate-500">
                    Coordinator: {classroomCoordinators[0]?.name || "Not assigned"}
                  </p>
                  <p className="mt-2 text-xs text-slate-700">
                    Subjects: {(teacher.subjects || []).length
                      ? teacher.subjects?.map((subject) => `${subject.name || "-"}${subject.code ? ` (${subject.code})` : ""}`).join(", ")
                      : "No mapped subjects"}
                  </p>
                </article>
              ))}
              {classroomTeachers.length === 0 ? (
                <p className="text-sm text-slate-500">No teachers found for this classroom.</p>
              ) : null}
            </div>
          </section>

          <section className="rounded-3xl border border-white/70 bg-white/75 p-4 shadow-[0_12px_35px_rgba(35,70,140,0.08)] backdrop-blur xl:col-span-2">
            <h2 className="text-base font-semibold">Enrolled Students ({year}-{division})</h2>
            <p className="mt-2 text-sm text-slate-600">Student list is loaded dynamically from backend classroom data.</p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="py-2">Name</th>
                    <th className="py-2">Email</th>
                    <th className="py-2">Roll No</th>
                    <th className="py-2">Parent Email</th>
                    <th className="py-2">Year</th>
                    <th className="py-2">Division</th>
                    <th className="py-2">Face Status</th>
                  </tr>
                </thead>
                <tbody>
                  {classroomStudents.map((student) => (
                    <tr key={student._id} className="border-b border-slate-100">
                      <td className="py-2">{student.name || "-"}</td>
                      <td className="py-2">{student.email || "-"}</td>
                      <td className="py-2">{student.rollNo || "-"}</td>
                      <td className="py-2">{student.parentEmail || "-"}</td>
                      <td className="py-2">{student.year || "-"}</td>
                      <td className="py-2">{student.division || "-"}</td>
                      <td className="py-2">
                        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${student.faceRegisteredAt ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                          {student.faceRegisteredAt ? "Registered" : "Pending"}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {classroomStudents.length === 0 ? (
                    <tr>
                      <td className="py-3 text-slate-500" colSpan={7}>No enrolled students found for this batch.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          <section id="lecture-schedule" className="rounded-3xl border border-white/70 bg-white/75 p-4 shadow-[0_12px_35px_rgba(35,70,140,0.08)] backdrop-blur">
            <h2 className="text-base font-semibold">Schedule Live Lecture</h2>
            <p className="mt-2 text-sm text-slate-600">Create a Google Meet-style session and auto-share details to students in chat.</p>
            <div className="mt-3 space-y-2">
              <input
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="Lecture Title"
                value={lectureForm.title}
                onChange={(e) => setLectureForm((prev) => ({ ...prev, title: e.target.value }))}
              />
              <select
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                value={lectureForm.subjectId}
                onChange={(e) => setLectureForm((prev) => ({ ...prev, subjectId: e.target.value }))}
              >
                <option value="">Select Subject</option>
                {subjects.map((subject) => (
                  <option key={subject._id} value={subject._id}>
                    {subject.name} ({subject.code})
                  </option>
                ))}
              </select>
              <input
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                type="datetime-local"
                value={lectureForm.scheduledAtLocal}
                onChange={(e) => setLectureForm((prev) => ({ ...prev, scheduledAtLocal: e.target.value }))}
              />
              <input
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                type="number"
                min={15}
                step={5}
                placeholder="Duration (minutes)"
                value={lectureForm.durationMinutes}
                onChange={(e) => setLectureForm((prev) => ({ ...prev, durationMinutes: Number(e.target.value) || 60 }))}
              />
              <input
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="Purpose (optional)"
                value={lectureForm.purpose}
                onChange={(e) => setLectureForm((prev) => ({ ...prev, purpose: e.target.value }))}
              />
            </div>
            <button className="mt-3 rounded-lg bg-[#135ed8] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60" type="button" onClick={scheduleLecture} disabled={subjects.length === 0 || (user?.role === "teacher" && guardrails?.canScheduleLecture === false)}>
              Schedule and Share
            </button>
          </section>

          <section id="live-class" className="rounded-3xl border border-white/70 bg-white/75 p-4 shadow-[0_12px_35px_rgba(35,70,140,0.08)] backdrop-blur">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Realtime Audio/Video Class</h2>
              <span className={`rounded-full px-2 py-1 text-xs font-semibold ${liveClassActive ? "animate-pulse bg-red-100 text-red-700" : "bg-slate-100 text-slate-600"}`}>
                {liveClassActive ? "LIVE" : "OFFLINE"}
              </span>
            </div>
            <p className="mt-2 text-sm text-slate-600">
              {activeLiveLecture
                ? `Live lecture room: ${mediaRoomId || "N/A"} | ${activeLiveLecture.title}`
                : `Batch room: ${liveRoomId || "N/A"}`}
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              <button className="rounded-lg bg-[#135ed8] px-3 py-2 text-sm font-semibold text-white" type="button" onClick={() => void startLiveClass()}>
                {activeLiveLecture ? "Resume Live Lecture Room" : "Start Live Class"}
              </button>
              <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm" type="button" onClick={stopLiveClass}>
                End Live Class
              </button>
            </div>

            <div className="mt-3 grid gap-3">
              <video ref={liveLocalVideoRef} autoPlay playsInline muted className="w-full rounded-lg border border-slate-200 bg-slate-100" />
              {remoteStreams.map((item) => (
                <video
                  key={item.socketId}
                  autoPlay
                  playsInline
                  className="w-full rounded-lg border border-slate-200 bg-slate-100"
                  ref={(node) => {
                    if (!node) return;
                    node.srcObject = item.stream;
                  }}
                />
              ))}
            </div>

            <p className="mt-2 text-xs text-slate-500">Connected peers: {remoteStreams.length} | Socket: {socketId || "-"} | Active lecture: {activeLiveLecture?.title || "None"}</p>
          </section>

          <section id="teacher-chat" className="rounded-3xl border border-white/70 bg-white/75 p-4 shadow-[0_12px_35px_rgba(35,70,140,0.08)] backdrop-blur xl:col-span-2">
            <h2 className="text-base font-semibold">Lecture Announcements</h2>
            <p className="mt-2 text-sm text-slate-600">Teachers can send lecture details. Students receive these messages on their dashboard.</p>
            <div className="mt-3 flex gap-2">
              <input
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="Write lecture detail or instruction"
                value={announcementText}
                onChange={(e) => setAnnouncementText(e.target.value)}
              />
              <button className="rounded-lg bg-[#135ed8] px-3 py-2 text-sm font-semibold text-white" type="button" onClick={sendAnnouncement}>
                Send
              </button>
            </div>

            <div className="mt-3 max-h-56 space-y-2 overflow-auto rounded-lg border border-slate-200 p-3">
              {announcements.map((item, index) => (
                <div key={`${item.time || "t"}-${index}`} className="rounded-md bg-slate-50 px-3 py-2 text-sm">
                  <p className="text-slate-800">{item.message}</p>
                  <p className="mt-1 text-xs text-slate-500">{item.sender?.name || "Teacher"} ({item.sender?.role || "teacher"})</p>
                </div>
              ))}
              {announcements.length === 0 ? <p className="text-sm text-slate-500">No announcements yet.</p> : null}
            </div>
          </section>

          <section className="rounded-3xl border border-white/70 bg-white/75 p-4 shadow-[0_12px_35px_rgba(35,70,140,0.08)] backdrop-blur xl:col-span-2">
            <h2 className="text-base font-semibold">My Scheduled Lectures</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="py-2">Title</th>
                    <th className="py-2">Subject</th>
                    <th className="py-2">Time</th>
                    <th className="py-2">Duration</th>
                    <th className="py-2">Purpose</th>
                    <th className="py-2">Status</th>
                    <th className="py-2">Link</th>
                    <th className="py-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {scheduledLectures.map((lecture) => {
                    const status = getLectureStatus(lecture);
                    const rawStatus = String(lecture.status || "").toUpperCase();
                    return (
                    <tr key={lecture._id} className="border-b border-slate-100">
                      <td className="py-2">{lecture.title}</td>
                      <td className="py-2">{lecture.subjectId?.name || "-"}</td>
                      <td className="py-2">{new Date(lecture.scheduledAt).toLocaleString()}</td>
                      <td className="py-2">{lecture.durationMinutes} min</td>
                      <td className="py-2">{lecture.purpose || "-"}</td>
                      <td className="py-2">
                        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${lectureStatusClass(status)}`}>{status}</span>
                      </td>
                      <td className="py-2">
                        {lecture.meetingLink ? (
                          <a className="text-[#135ed8] underline" href={lecture.meetingLink} target="_blank" rel="noreferrer">
                            Open
                          </a>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="py-2">
                        <div className="flex flex-wrap gap-2">
                          {rawStatus !== "LIVE" && rawStatus !== "ENDED" && rawStatus !== "CANCELED" ? (
                            <button
                              type="button"
                              onClick={() => void startScheduledLecture(lecture)}
                              className="rounded-lg bg-[#1459d2] px-3 py-1.5 text-xs font-semibold text-white"
                            >
                              Start Live
                            </button>
                          ) : null}
                          {rawStatus === "LIVE" ? (
                            <button
                              type="button"
                              onClick={() => void endScheduledLecture(lecture)}
                              className="rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700"
                            >
                              End Live
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                  {scheduledLectures.length === 0 ? (
                    <tr>
                      <td className="py-3 text-slate-500" colSpan={8}>No scheduled lectures yet.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          <section id="attendance" className="rounded-3xl border border-white/70 bg-white/75 p-4 shadow-[0_12px_35px_rgba(35,70,140,0.08)] backdrop-blur xl:col-span-2">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Start Daily Attendance Window (10 Minutes)</h2>
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${activeAttendanceSession ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600"}`}>
                <span className={`h-2 w-2 rounded-full ${activeAttendanceSession ? "animate-pulse bg-red-600" : "bg-slate-400"}`} />
                {activeAttendanceSession ? "LIVE" : "OFFLINE"}
              </span>
            </div>
            <p className="mt-2 text-sm text-slate-600">Teacher/coordinator starts one attendance session for the whole batch for the day. It is not subject-wise. Students scan face + geo once and that daily attendance applies across the day.</p>
            {activeAttendanceSession ? (
              <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                <p>
                  Active daily session started at {activeAttendanceSession.startTime ? new Date(activeAttendanceSession.startTime).toLocaleTimeString() : "-"} and follows a fixed 10-minute attendance window.
                </p>
                <p className="mt-2 text-center text-4xl font-extrabold tracking-wide text-red-700">
                  {String(Math.floor(sessionCountdownSeconds / 60)).padStart(2, "0")}:{String(sessionCountdownSeconds % 60).padStart(2, "0")}
                </p>
                <p className="mt-1 text-center text-[11px] font-semibold uppercase">Attendance Window Countdown</p>
              </div>
            ) : (
              <p className="mt-2 text-xs text-slate-500">No active daily attendance session for this batch today.</p>
            )}
            <div className="mt-3 rounded-lg border border-[#135ed8]/25 bg-[#135ed8]/5 px-3 py-2 text-xs text-slate-700">
              Daily attendance is anchored internally to the first mapped subject for compatibility, but students mark attendance only once for the day.
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              <select className="rounded-lg border border-slate-300 px-3 py-2 text-sm" value={year} onChange={(e) => setYear(e.target.value as YearValue)}>
                {years.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <select className="rounded-lg border border-slate-300 px-3 py-2 text-sm" value={division} onChange={(e) => setDivision(e.target.value)}>
                {divisions.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button className="rounded-lg bg-[#135ed8] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60" type="button" onClick={startAttendance} disabled={subjects.length === 0 || (user?.role === "teacher" && guardrails?.canStartAttendance === false)}>Start Attendance</button>
            </div>
          </section>

          <section className="rounded-3xl border border-white/70 bg-white/75 p-4 shadow-[0_12px_35px_rgba(35,70,140,0.08)] backdrop-blur xl:col-span-2">
            <h2 className="text-base font-semibold">Live Attendance Stream (Today)</h2>
            <p className="mt-2 text-sm text-slate-600">Realtime-like rows from backend refresh. Present/Remote/Absent with geo flags.</p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="py-2">Student</th>
                    <th className="py-2">Roll No</th>
                    <th className="py-2">Subject</th>
                    <th className="py-2">Status</th>
                    <th className="py-2">Flag</th>
                    <th className="py-2">Marked At</th>
                  </tr>
                </thead>
                <tbody>
                  {classroomTodayRows.map((row) => (
                    <tr key={row._id} className="border-b border-slate-100">
                      <td className="py-2">{row.student?.name || "-"}</td>
                      <td className="py-2">{row.student?.rollNo || "-"}</td>
                      <td className="py-2">{row.subject?.name || "-"}</td>
                      <td className="py-2 capitalize">{row.status || "-"}</td>
                      <td className="py-2">
                        <span className={`rounded-full px-2 py-1 text-xs font-semibold uppercase ${flagClass(row.locationFlag)}`}>
                          {row.locationFlag || "red"}
                        </span>
                      </td>
                      <td className="py-2">{row.markedAt ? new Date(row.markedAt).toLocaleTimeString() : "-"}</td>
                    </tr>
                  ))}
                  {classroomTodayRows.length === 0 ? (
                    <tr>
                      <td className="py-3 text-slate-500" colSpan={6}>No attendance marks yet for today.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          <div className="xl:col-span-2">
            <AttendanceGeoMap
              points={classroomGeoPoints}
              title="Geo-Map Attendance View"
              description="See who marked attendance from which area. Nearby marks are clustered to keep dense batches readable."
            />
          </div>

          <section id="reports" className="rounded-3xl border border-white/70 bg-white/75 p-4 shadow-[0_12px_35px_rgba(35,70,140,0.08)] backdrop-blur xl:col-span-2">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Reports (Traffic-Light)</h2>
              <div className="flex items-center gap-2">
                <select className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm" value={selectedSubjectId} onChange={(e) => setSelectedSubjectId(e.target.value)}>
                  {subjects.map((subject) => (
                    <option key={subject._id} value={subject._id}>{subject.name} ({subject.code})</option>
                  ))}
                </select>
                <button className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm" onClick={loadReport} type="button">Load Report</button>
                <button className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm" onClick={() => exportSubjectReport("csv")} type="button">Export CSV</button>
                <button className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm" onClick={() => exportSubjectReport("pdf")} type="button">Export PDF</button>
              </div>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="py-2">Student</th>
                    <th className="py-2">Roll No</th>
                    <th className="py-2">Status</th>
                    <th className="py-2">Flag</th>
                    <th className="py-2">College Dist.</th>
                    <th className="py-2">Session Dist.</th>
                    <th className="py-2">Marked At</th>
                  </tr>
                </thead>
                <tbody>
                  {reportRows.map((row, index) => (
                    <tr key={index} className="border-b border-slate-100">
                      <td className="py-2">{row.student?.name || "-"}</td>
                      <td className="py-2">{row.student?.rollNo || "-"}</td>
                      <td className="py-2 capitalize">{row.status}</td>
                      <td className="py-2">
                        <span className={`rounded-full px-2 py-1 text-xs font-semibold uppercase ${flagClass(row.locationFlag)}`}>
                          {row.locationFlag || "red"}
                        </span>
                      </td>
                      <td className="py-2">{typeof row.distanceMeters === "number" ? `${Math.round(row.distanceMeters)} m` : "-"}</td>
                      <td className="py-2">{typeof row.gpsDistance === "number" ? `${Math.round(row.gpsDistance)} m` : "-"}</td>
                      <td className="py-2">{row.markedAt ? new Date(row.markedAt).toLocaleString() : "-"}</td>
                    </tr>
                  ))}
                  {reportRows.length === 0 ? (
                    <tr>
                      <td className="py-3 text-slate-500" colSpan={8}>No rows loaded. Select subject and click Load Report.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <div className="mt-4 rounded-2xl border border-white/70 bg-white/75 p-3 text-sm text-slate-700 shadow-[0_8px_25px_rgba(35,70,140,0.06)]">{message}</div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}

