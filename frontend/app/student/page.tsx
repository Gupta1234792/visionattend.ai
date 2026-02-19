"use client";

import { useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import api from "@/src/services/api";
import { ProtectedRoute } from "@/src/components/protected-route";
import { DashboardLayout } from "@/src/layouts/dashboard-layout";
import { useAuth } from "@/src/context/auth-context";
import { buildBatchKey, buildBatchRoomId, connectCollegeSocket } from "@/src/services/socket";

type Subject = { _id: string; name: string; code: string };
type AttendanceHistoryRow = { subject?: string; percentage?: number };
type DailyAttendanceRow = {
  sessionId: string;
  date: string;
  subject: string;
  subjectCode: string;
  status: "present" | "remote" | "absent";
  locationFlag: "green" | "yellow" | "red";
  distanceMeters?: number | null;
  gpsDistance?: number | null;
  markedAt?: string | null;
};
type BatchLecture = {
  _id: string;
  title: string;
  scheduledAt: string;
  durationMinutes: number;
  meetingLink?: string;
  status?: string;
  teacherId?: { name?: string; email?: string };
  subjectId?: { name?: string; code?: string };
};
type Announcement = {
  roomId?: string;
  message: string;
  sender?: { _id?: string; name?: string; role?: string };
  time?: string;
};
type ClassroomTeacher = {
  _id: string;
  name: string;
  email: string;
  subjects?: Array<{ name?: string; code?: string }>;
};
type ActiveSessionMeta = {
  teacherName?: string;
  teacherEmail?: string;
  remainingMinutes?: number;
};
type BotMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

export default function StudentPage() {
  const { user, token } = useAuth();
  const [message, setMessage] = useState("Student dashboard ready.");
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [activeSessionId, setActiveSessionId] = useState("");
  const [activeSessionMeta, setActiveSessionMeta] = useState<ActiveSessionMeta | null>(null);
  const [history, setHistory] = useState<AttendanceHistoryRow[]>([]);
  const [upcomingLectures, setUpcomingLectures] = useState<BatchLecture[]>([]);
  const [dailyAttendance, setDailyAttendance] = useState<DailyAttendanceRow[]>([]);
  const [classroomTeachers, setClassroomTeachers] = useState<ClassroomTeacher[]>([]);
  const [botMessages, setBotMessages] = useState<BotMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      text: "Hi, I am CampusGenie. Ask me doubts about attendance, lectures, or your daily workflow."
    }
  ]);
  const [botInput, setBotInput] = useState("");
  const [botLoading, setBotLoading] = useState(false);

  const attendanceVideoRef = useRef<HTMLVideoElement | null>(null);
  const attendanceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const attendanceStreamRef = useRef<MediaStream | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);

  const [liveClassActive, setLiveClassActive] = useState(false);
  const [remoteStreams, setRemoteStreams] = useState<Array<{ socketId: string; stream: MediaStream }>>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());

  const parseApiError = (error: unknown, fallback: string) => {
    const maybeMessage = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
    return maybeMessage || fallback;
  };

  const batchKey = user?.department && user?.year && user?.division
    ? buildBatchKey(user.department, user.year, user.division)
    : "";
  const liveRoomId = batchKey ? buildBatchRoomId(batchKey) : "";

  const addRemoteStream = (peerSocketId: string, stream: MediaStream) => {
    setRemoteStreams((prev) => {
      const exists = prev.find((item) => item.socketId === peerSocketId);
      if (exists) {
        return prev.map((item) => (item.socketId === peerSocketId ? { socketId: peerSocketId, stream } : item));
      }
      return [...prev, { socketId: peerSocketId, stream }];
    });
  };

  const closePeer = (peerSocketId: string) => {
    const peer = peersRef.current.get(peerSocketId);
    if (peer) {
      peer.onicecandidate = null;
      peer.ontrack = null;
      peer.close();
      peersRef.current.delete(peerSocketId);
    }
    setRemoteStreams((prev) => prev.filter((item) => item.socketId !== peerSocketId));
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

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current as MediaStream);
      });
    }

    peersRef.current.set(peerSocketId, pc);
    return pc;
  };

  const loadSubjects = async () => {
    try {
      const res = await api.get("/subjects/mine");
      const list = res.data.subjects || [];
      setSubjects(list);
      if (!selectedSubjectId && list[0]) setSelectedSubjectId(list[0]._id);
    } catch (error) {
      setMessage(parseApiError(error, "Failed to load subjects."));
    }
  };

  const loadHistory = async () => {
    try {
      const res = await api.get("/reports/student");
      setHistory(res.data.attendance || []);
    } catch {
      setHistory([]);
    }
  };

  const loadAnnouncements = async () => {
    if (!liveRoomId) return;
    try {
      const res = await api.get(`/chat/${liveRoomId}`);
      const historyRows = (res.data?.messages || []).map((item: { message: string; sender?: { name?: string; role?: string; _id?: string }; createdAt?: string }) => ({
        roomId: liveRoomId,
        message: item.message,
        sender: item.sender,
        time: item.createdAt,
      }));
      setAnnouncements(historyRows);
    } catch {
      setAnnouncements([]);
    }
  };

  const loadBatchLectures = async () => {
    if (!batchKey) return;
    try {
      const res = await api.get(`/lectures/batch/${batchKey}`);
      setUpcomingLectures(res.data?.lectures || []);
    } catch (error) {
      setUpcomingLectures([]);
      setMessage(parseApiError(error, "Unable to load scheduled lectures."));
    }
  };

  const loadDailyAttendance = async () => {
    try {
      const res = await api.get("/reports/student/daily");
      setDailyAttendance(res.data?.records || []);
    } catch (error) {
      setDailyAttendance([]);
      setMessage(parseApiError(error, "Unable to load daily attendance."));
    }
  };

  const loadClassroomTeachers = async () => {
    if (!batchKey) return;
    try {
      const res = await api.get(`/classroom/${batchKey}`);
      setClassroomTeachers(res.data?.teachers || []);
    } catch {
      setClassroomTeachers([]);
    }
  };

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    const timer = setTimeout(() => {
      void loadSubjects();
      void loadHistory();
      void loadAnnouncements();
      void loadBatchLectures();
      void loadDailyAttendance();
      void loadClassroomTeachers();
    }, 0);
    return () => clearTimeout(timer);
  }, [liveRoomId]);
  /* eslint-enable react-hooks/exhaustive-deps */

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    if (!batchKey) return;
    const interval = setInterval(() => {
      void loadBatchLectures();
      void loadClassroomTeachers();
    }, 30000);
    return () => clearInterval(interval);
  }, [batchKey]);
  /* eslint-enable react-hooks/exhaustive-deps */

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    if (!token || !user?.college) return;

    const socket = connectCollegeSocket(token, user.college);
    socketRef.current = socket;

    socket.on("connect", () => {
      if (liveRoomId) socket.emit("join-room", { roomId: liveRoomId });
    });

    socket.on("chat-message", (payload: Announcement) => {
      if (payload?.roomId && payload.roomId !== liveRoomId) return;
      setAnnouncements((prev) => [...prev, payload]);
    });

    socket.on("room-peer-left", ({ roomId, socketId: peerSocketId }: { roomId: string; socketId: string }) => {
      if (roomId !== liveRoomId) return;
      closePeer(peerSocketId);
    });

    socket.on("webrtc-ready", async ({ roomId, from }: { roomId: string; from: string }) => {
      if (!liveClassActive || roomId !== liveRoomId || !from || from === socket.id) return;
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
        setMessage("Failed to connect live class stream.");
      }
    });

    socket.on("webrtc-signal", async ({ roomId, from, signal }: { roomId: string; from: string; signal: { type: string; sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit } }) => {
      if (!liveClassActive || roomId !== liveRoomId || !from || from === socket.id) return;

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
        setMessage("Realtime connection sync failed.");
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, user?.college, liveRoomId, liveClassActive]);
  /* eslint-enable react-hooks/exhaustive-deps */

  const openAttendanceCamera = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setMessage("Camera not detected. Please connect a webcam.");
        return;
      }
      const devices = await navigator.mediaDevices.enumerateDevices();
      const hasVideoInput = devices.some((d) => d.kind === "videoinput");
      if (!hasVideoInput) {
        setMessage("Camera not detected. Please connect a webcam.");
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      attendanceStreamRef.current = stream;
      if (attendanceVideoRef.current) attendanceVideoRef.current.srcObject = stream;
      setCameraOpen(true);
    } catch (error) {
      const name = (error as { name?: string })?.name || "";
      if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        setMessage("Camera not detected. Please connect a webcam.");
        return;
      }
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setMessage("Camera permission denied. Allow camera access in browser settings.");
        return;
      }
      if (name === "NotReadableError" || name === "TrackStartError") {
        setMessage("Camera is busy in another app. Close that app and retry.");
        return;
      }
      setMessage("Unable to open camera.");
    }
  };

  const closeAttendanceCamera = () => {
    if (attendanceStreamRef.current) {
      attendanceStreamRef.current.getTracks().forEach((track) => track.stop());
      attendanceStreamRef.current = null;
    }
    setCameraOpen(false);
  };

  const captureFrame = () => {
    const video = attendanceVideoRef.current;
    const canvas = attendanceCanvasRef.current;
    if (!video || !canvas) return "";

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85);
  };

  const getLocation = () =>
    new Promise<{ latitude: number; longitude: number }>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
        () => reject(new Error("Location denied")),
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });

  const findActiveSession = async () => {
    if (!selectedSubjectId) {
      setMessage("Select a subject first.");
      return;
    }

    try {
      const res = await api.get(`/attendance/active/${selectedSubjectId}`);
      setActiveSessionId(res.data?.session?._id || "");
      setActiveSessionMeta(
        res.data?.session?._id
          ? {
              teacherName: res.data?.session?.teacher?.name,
              teacherEmail: res.data?.session?.teacher?.email,
              remainingMinutes: Number(res.data?.remainingMinutes || 0)
            }
          : null
      );
      setMessage(res.data?.session?._id ? "Active session found." : "No active session.");
    } catch {
      setActiveSessionId("");
      setActiveSessionMeta(null);
      setMessage("No active attendance session.");
    }
  };

  const scanFaceAndMark = async () => {
    if (!activeSessionId) {
      setMessage("Find active session first.");
      return;
    }

    try {
      if (!cameraOpen) {
        setMessage("Open camera first, then scan.");
        return;
      }
      const frame = captureFrame();
      const location = await getLocation();
      const authToken = token || (typeof window !== "undefined" ? (localStorage.getItem("va_token") || localStorage.getItem("token") || "") : "");
      if (!authToken) {
        setMessage("Session expired. Please login again.");
        return;
      }

      await api.post("/attendance/scan-face", {
        sessionId: activeSessionId,
        latitude: location.latitude,
        longitude: location.longitude,
        image: frame,
      }, {
        headers: { Authorization: `Bearer ${authToken}` },
      });

      setMessage("Attendance marked via face scan.");
      closeAttendanceCamera();
      void loadHistory();
    } catch (error) {
      setMessage(parseApiError(error, "Attendance failed: face/location validation failed."));
    }
  };

  const joinLiveClass = async () => {
    if (!liveRoomId) {
      setMessage("Classroom context missing.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;

      if (socketRef.current) {
        socketRef.current.emit("join-room", { roomId: liveRoomId });
        socketRef.current.emit("webrtc-ready", { roomId: liveRoomId });
      }

      setLiveClassActive(true);
      setMessage("Joined live class. Waiting for teacher stream.");
    } catch {
      setMessage("Unable to join live class media. Check camera/mic permissions.");
    }
  };

  const leaveLiveClass = () => {
    peersRef.current.forEach((_, peerSocketId) => closePeer(peerSocketId));
    setRemoteStreams([]);

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    setLiveClassActive(false);
  };

  const joinScheduledLecture = async (lectureId: string, fallbackLink?: string) => {
    try {
      const res = await api.post(`/lectures/${lectureId}/join`);
      const meetingLink = res.data?.meetingLink || fallbackLink;
      if (meetingLink) {
        window.open(meetingLink, "_blank", "noopener,noreferrer");
      }
      setMessage("Lecture join recorded.");
    } catch (error) {
      setMessage(parseApiError(error, "Unable to join lecture."));
    }
  };

  const exportDailyAttendanceCsv = async () => {
    try {
      const res = await api.get("/reports/student/daily/csv", { responseType: "blob" });
      const blob = new Blob([res.data], { type: "text/csv;charset=utf-8;" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", "student_daily_attendance.csv");
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setMessage("Daily attendance CSV exported.");
    } catch (error) {
      setMessage(parseApiError(error, "Failed to export CSV."));
    }
  };

  const askCampusGenie = async () => {
    const prompt = botInput.trim();
    if (!prompt || botLoading) return;

    const userMessage: BotMessage = {
      id: `u_${Date.now()}`,
      role: "user",
      text: prompt
    };
    setBotMessages((prev) => [...prev, userMessage]);
    setBotInput("");
    setBotLoading(true);

    try {
      const res = await api.post("/assistant/chat", { prompt });
      const reply = String(res.data?.reply || "").trim() || "I could not generate a response right now.";
      const botMessage: BotMessage = {
        id: `a_${Date.now()}`,
        role: "assistant",
        text: reply
      };
      setBotMessages((prev) => [...prev, botMessage]);
    } catch (error) {
      const fallback = parseApiError(error, "CampusGenie is unavailable right now.");
      setBotMessages((prev) => [
        ...prev,
        {
          id: `a_${Date.now()}`,
          role: "assistant",
          text: fallback
        }
      ]);
    } finally {
      setBotLoading(false);
    }
  };

  const flagClass = (flag: DailyAttendanceRow["locationFlag"]) => {
    if (flag === "green") return "bg-green-100 text-green-700";
    if (flag === "yellow") return "bg-yellow-100 text-yellow-700";
    return "bg-red-100 text-red-700";
  };

  return (
    <ProtectedRoute allow={["student"]}>
      <DashboardLayout title="Student Dashboard">
        <div className="grid gap-4 xl:grid-cols-2">
          <section id="scan" className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-base font-semibold">Scan Face for Attendance</h2>
            <p className="mt-2 text-sm text-slate-600">Camera + geolocation data is sent to backend for validation.</p>

            <div className="mt-3 flex flex-wrap gap-2">
              <select className="min-w-60 rounded-lg border border-slate-300 px-3 py-2 text-sm" value={selectedSubjectId} onChange={(e) => setSelectedSubjectId(e.target.value)}>
                {subjects.map((subject) => (
                  <option key={subject._id} value={subject._id}>{subject.name} ({subject.code})</option>
                ))}
              </select>
              <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm" type="button" onClick={findActiveSession}>Find Session</button>
            </div>

            {activeSessionMeta ? (
              <div className="mt-3 rounded-lg border border-[#135ed8]/30 bg-[#135ed8]/5 p-3 text-sm text-slate-700">
                <p><span className="font-semibold">Started by:</span> {activeSessionMeta.teacherName || "-"} ({activeSessionMeta.teacherEmail || "-"})</p>
                <p className="mt-1"><span className="font-semibold">Remaining:</span> {activeSessionMeta.remainingMinutes ?? 0} min</p>
              </div>
            ) : null}

            <div className="mt-3 flex flex-wrap gap-2">
              <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm" type="button" onClick={openAttendanceCamera}>Open Camera</button>
              <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm" type="button" onClick={closeAttendanceCamera}>Close Camera</button>
              <button className="rounded-lg bg-[#135ed8] px-3 py-2 text-sm font-semibold text-white" type="button" onClick={scanFaceAndMark}>Scan Face</button>
            </div>

            {cameraOpen && <video ref={attendanceVideoRef} autoPlay playsInline muted className="mt-3 w-full rounded-lg border border-slate-200" />}
            <canvas ref={attendanceCanvasRef} className="hidden" />
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-base font-semibold">Realtime Class (Audio/Video)</h2>
            <p className="mt-2 text-sm text-slate-600">Join your batch live class using WebRTC + sockets.</p>

            <div className="mt-3 flex flex-wrap gap-2">
              <button className="rounded-lg bg-[#135ed8] px-3 py-2 text-sm font-semibold text-white" type="button" onClick={joinLiveClass}>Join Live Class</button>
              <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm" type="button" onClick={leaveLiveClass}>Leave Live Class</button>
            </div>

            <div className="mt-3 grid gap-3">
              <video ref={localVideoRef} autoPlay playsInline muted className="w-full rounded-lg border border-slate-200 bg-slate-100" />
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

            <p className="mt-2 text-xs text-slate-500">Live peers: {remoteStreams.length} | Joined: {liveClassActive ? "Yes" : "No"}</p>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 xl:col-span-2">
            <h2 className="text-base font-semibold">Teacher Lecture Messages</h2>
            <div className="mt-3 max-h-56 space-y-2 overflow-auto rounded-lg border border-slate-200 p-3">
              {announcements.map((item, index) => (
                <div key={`${item.time || "t"}-${index}`} className="rounded-md bg-slate-50 px-3 py-2 text-sm">
                  <p className="text-slate-800">{item.message}</p>
                  <p className="mt-1 text-xs text-slate-500">{item.sender?.name || "Teacher"} ({item.sender?.role || "teacher"})</p>
                </div>
              ))}
              {announcements.length === 0 ? <p className="text-sm text-slate-500">No lecture messages yet.</p> : null}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 xl:col-span-2">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Upcoming Scheduled Lectures</h2>
              <button
                type="button"
                onClick={() => void loadBatchLectures()}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700"
              >
                Refresh
              </button>
            </div>
            <p className="mt-2 text-sm text-slate-600">Track lecture time, subject and teacher details. Join directly when session time starts.</p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="py-2">Title</th>
                    <th className="py-2">Subject</th>
                    <th className="py-2">Teacher</th>
                    <th className="py-2">Scheduled Time</th>
                    <th className="py-2">Duration</th>
                    <th className="py-2">Meeting Link</th>
                    <th className="py-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {upcomingLectures.map((lecture) => (
                    <tr key={lecture._id} className="border-b border-slate-100">
                      <td className="py-2">{lecture.title}</td>
                      <td className="py-2">{lecture.subjectId?.name || "-"}</td>
                      <td className="py-2">{lecture.teacherId?.name || "-"}</td>
                      <td className="py-2">{new Date(lecture.scheduledAt).toLocaleString()}</td>
                      <td className="py-2">{lecture.durationMinutes} min</td>
                      <td className="py-2">
                        {lecture.meetingLink ? (
                          <a
                            className="text-[#135ed8] underline"
                            href={lecture.meetingLink}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open Link
                          </a>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="py-2">
                        <button
                          type="button"
                          onClick={() => joinScheduledLecture(lecture._id, lecture.meetingLink)}
                          className="rounded-lg bg-[#135ed8] px-3 py-1.5 text-xs font-semibold text-white"
                        >
                          Join
                        </button>
                      </td>
                    </tr>
                  ))}
                  {upcomingLectures.length === 0 ? (
                    <tr>
                      <td className="py-3 text-slate-500" colSpan={7}>No scheduled lectures found for your batch.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          <section id="history" className="rounded-2xl border border-slate-200 bg-white p-4 xl:col-span-2">
            <h2 className="text-base font-semibold">Attendance History</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="py-2">Subject</th>
                    <th className="py-2">Percentage</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((row, index) => (
                    <tr key={index} className="border-b border-slate-100">
                      <td className="py-2">{String(row.subject || "-")}</td>
                      <td className="py-2">{typeof row.percentage === "number" ? `${row.percentage}%` : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 xl:col-span-2">
            <h2 className="text-base font-semibold">Virtual Classroom Teachers</h2>
            <p className="mt-2 text-sm text-slate-600">Your classroom faculty list with mapped subjects.</p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="py-2">Teacher</th>
                    <th className="py-2">Email</th>
                    <th className="py-2">Subjects</th>
                  </tr>
                </thead>
                <tbody>
                  {classroomTeachers.slice(0, 5).map((teacher) => (
                    <tr key={teacher._id} className="border-b border-slate-100">
                      <td className="py-2">{teacher.name || "-"}</td>
                      <td className="py-2">{teacher.email || "-"}</td>
                      <td className="py-2">
                        {(teacher.subjects || []).length
                          ? teacher.subjects?.map((s) => `${s.name || "-"}${s.code ? ` (${s.code})` : ""}`).join(", ")
                          : "-"}
                      </td>
                    </tr>
                  ))}
                  {classroomTeachers.length === 0 ? (
                    <tr>
                      <td className="py-3 text-slate-500" colSpan={3}>No classroom teachers available.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-2xl border border-cyan-200 bg-gradient-to-br from-cyan-50 via-white to-sky-50 p-4 xl:col-span-2">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">CampusGenie Doubt Bot</h2>
              <span className="rounded-full bg-cyan-100 px-2 py-1 text-xs font-semibold text-cyan-700">AI Help</span>
            </div>
            <p className="mt-2 text-sm text-slate-600">Ask general questions about your classes, attendance flow, or daily student process.</p>
            <div className="mt-3 max-h-72 space-y-2 overflow-auto rounded-xl border border-cyan-100 bg-white/80 p-3">
              {botMessages.map((item) => (
                <div
                  key={item.id}
                  className={`max-w-[92%] rounded-xl px-3 py-2 text-sm ${item.role === "assistant" ? "bg-slate-100 text-slate-800" : "ml-auto bg-[#135ed8] text-white"}`}
                >
                  {item.text}
                </div>
              ))}
              {botLoading ? <p className="text-xs text-slate-500">CampusGenie is typing...</p> : null}
            </div>
            <div className="mt-3 flex gap-2">
              <input
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                placeholder="Ask your doubt..."
                value={botInput}
                onChange={(e) => setBotInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void askCampusGenie();
                  }
                }}
              />
              <button
                type="button"
                onClick={() => void askCampusGenie()}
                disabled={botLoading || !botInput.trim()}
                className="rounded-lg bg-[#135ed8] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                Ask
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 xl:col-span-2">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Daily Attendance Detail</h2>
              <button
                type="button"
                onClick={exportDailyAttendanceCsv}
                className="rounded-lg bg-[#135ed8] px-3 py-1.5 text-xs font-semibold text-white"
              >
                Export CSV
              </button>
            </div>
            <p className="mt-2 text-sm text-slate-600">Green = near college, Yellow = medium distance, Red = far/absent.</p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="py-2">Date</th>
                    <th className="py-2">Subject</th>
                    <th className="py-2">Status</th>
                    <th className="py-2">Flag</th>
                    <th className="py-2">College Dist.</th>
                    <th className="py-2">Session Dist.</th>
                  </tr>
                </thead>
                <tbody>
                  {dailyAttendance.map((row) => (
                    <tr key={row.sessionId} className="border-b border-slate-100">
                      <td className="py-2">{row.date}</td>
                      <td className="py-2">{row.subject} ({row.subjectCode})</td>
                      <td className="py-2 capitalize">{row.status}</td>
                      <td className="py-2">
                        <span className={`rounded-full px-2 py-1 text-xs font-semibold uppercase ${flagClass(row.locationFlag)}`}>
                          {row.locationFlag}
                        </span>
                      </td>
                      <td className="py-2">{typeof row.distanceMeters === "number" ? `${Math.round(row.distanceMeters)} m` : "-"}</td>
                      <td className="py-2">{typeof row.gpsDistance === "number" ? `${Math.round(row.gpsDistance)} m` : "-"}</td>
                    </tr>
                  ))}
                  {dailyAttendance.length === 0 ? (
                    <tr>
                      <td className="py-3 text-slate-500" colSpan={6}>No daily attendance rows available.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">{message}</div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
