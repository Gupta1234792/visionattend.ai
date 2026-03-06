"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import api from "@/src/services/api";
import { ProtectedRoute } from "@/src/components/protected-route";
import { ToastItem, ToastStack } from "@/src/components/toast-stack";
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
  purpose?: string;
  scheduledAt: string;
  durationMinutes: number;
  meetingLink?: string;
  status?: string;
  teacherId?: { name?: string; email?: string };
  subjectId?: { name?: string; code?: string };
};
type BatchHoliday = {
  _id: string;
  reason: string;
  fromDate: string;
  toDate: string;
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
type NotificationItem = {
  _id?: string;
  title?: string;
  message?: string;
  isRead?: boolean;
  createdAt?: string;
};

export default function StudentPage() {
  const { user, token } = useAuth();
  const [message, setMessage] = useState("Student dashboard ready.");
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [activeSessionId, setActiveSessionId] = useState("");
  const [activeSessionMeta, setActiveSessionMeta] = useState<ActiveSessionMeta | null>(null);
  const [history, setHistory] = useState<AttendanceHistoryRow[]>([]);
  const [upcomingLectures, setUpcomingLectures] = useState<BatchLecture[]>([]);
  const [upcomingHolidays, setUpcomingHolidays] = useState<BatchHoliday[]>([]);
  const [dailyAttendance, setDailyAttendance] = useState<DailyAttendanceRow[]>([]);
  const [classroomTeachers, setClassroomTeachers] = useState<ClassroomTeacher[]>([]);
  const [classroomCoordinators, setClassroomCoordinators] = useState<ClassroomCoordinator[]>([]);
  const [classroomBatchInfo, setClassroomBatchInfo] = useState<ClassroomBatchInfo | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [faceHint, setFaceHint] = useState("");
  const allowManualBypass = process.env.NEXT_PUBLIC_DEV_BYPASS === "true";
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
  const [capturedAttendanceImage, setCapturedAttendanceImage] = useState("");

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
  const pushToast = (text: string, type: "success" | "error" | "info" = "info") => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 3200);
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

  const loadBatchHolidays = async () => {
    if (!batchKey) return;
    try {
      const res = await api.get(`/holidays/batch/${batchKey}`);
      setUpcomingHolidays(res.data?.holidays || []);
    } catch {
      setUpcomingHolidays([]);
    }
  };

  const loadClassroomTeachers = async () => {
    if (!batchKey) return;
    try {
      const res = await api.get(`/classroom/${batchKey}`);
      setClassroomTeachers(res.data?.teachers || []);
      setClassroomCoordinators(res.data?.coordinators || []);
      setClassroomBatchInfo(res.data?.batchInfo || null);
    } catch {
      setClassroomTeachers([]);
      setClassroomCoordinators([]);
      setClassroomBatchInfo(null);
    }
  };

  const loadNotifications = async () => {
    try {
      const res = await api.get("/notifications/my?isRead=false&limit=5");
      setNotifications(res.data?.notifications || []);
      setUnreadNotifications(Number(res.data?.unread || 0));
    } catch {
      setNotifications([]);
      setUnreadNotifications(0);
    }
  };

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    const timer = setTimeout(() => {
      void loadSubjects();
      void loadHistory();
      void loadAnnouncements();
      void loadBatchLectures();
      void loadBatchHolidays();
      void loadDailyAttendance();
      void loadClassroomTeachers();
      void loadNotifications();
    }, 0);
    return () => clearTimeout(timer);
  }, [liveRoomId]);
  /* eslint-enable react-hooks/exhaustive-deps */

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    if (!batchKey) return;
    const interval = setInterval(() => {
      void loadBatchLectures();
      void loadBatchHolidays();
      void loadClassroomTeachers();
      void loadDailyAttendance();
      void loadHistory();
      void loadNotifications();
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
      pushToast("New lecture announcement received.", "info");
    });

    socket.on("notification:new", (payload: NotificationItem) => {
      setNotifications((prev) => [
        {
          title: payload?.title || "Notification",
          message: payload?.message || "",
          createdAt: payload?.createdAt || new Date().toISOString(),
          isRead: false,
        },
        ...prev,
      ].slice(0, 5));
      setUnreadNotifications((prev) => prev + 1);
    });

    socket.on("ATTENDANCE_SESSION_STARTED", () => {
      setMessage("Attendance session started for your batch.");
      void loadDailyAttendance();
    });

    socket.on("ATTENDANCE_MARKED", () => {
      void loadDailyAttendance();
      void loadHistory();
    });

    socket.on("ATTENDANCE_SESSION_CLOSED", () => {
      setMessage("Attendance session closed.");
      void loadDailyAttendance();
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
        setMessage("Camera API not available. Use 'Capture Photo' for mobile.");
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "user" },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });
      attendanceStreamRef.current = stream;
      if (attendanceVideoRef.current) attendanceVideoRef.current.srcObject = stream;
      setCameraOpen(true);
      setCapturedAttendanceImage("");
    } catch (error) {
      const name = (error as { name?: string })?.name || "";
      if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        setMessage("Live camera stream not found. Use Capture Photo on phone.");
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
      if (typeof window !== "undefined" && !window.isSecureContext) {
        setMessage("Live camera may be blocked on HTTP mobile URL. Use Capture Photo or run HTTPS.");
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

  const onAttendancePhotoCapture = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const value = typeof reader.result === "string" ? reader.result : "";
      if (!value) return;
      closeAttendanceCamera();
      setCapturedAttendanceImage(value);
      setMessage("Photo captured. You can now scan face and mark attendance.");
    };
    reader.readAsDataURL(file);
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

  const getCollegeFallbackLocation = async () => {
    try {
      const res = await api.get("/colleges");
      const firstCollege = (res.data?.colleges || [])[0];
      const latitude = Number(firstCollege?.location?.latitude);
      const longitude = Number(firstCollege?.location?.longitude);
      if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
        return { latitude, longitude };
      }
      return null;
    } catch {
      return null;
    }
  };

  const getLocation = () =>
    new Promise<{ latitude: number; longitude: number }>((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Geolocation not supported"));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
        async () => {
          if (allowManualBypass) {
            const fallback = await getCollegeFallbackLocation();
            if (fallback) {
              setMessage("Live location blocked on this mobile URL. Using college location for dev test.");
              resolve(fallback);
              return;
            }
          }
          reject(new Error("Location denied"));
        },
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
      setRemainingSeconds(Math.max(0, Math.floor(Number(res.data?.remainingMinutes || 0) * 60)));
      setMessage(res.data?.session?._id ? "Active session found." : "No active session.");
    } catch {
      setActiveSessionId("");
      setActiveSessionMeta(null);
      setRemainingSeconds(0);
      setMessage("No active attendance session.");
    }
  };

  useEffect(() => {
    if (!activeSessionId || remainingSeconds <= 0) return;
    const timer = setInterval(() => {
      setRemainingSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [activeSessionId, remainingSeconds]);

  const scanFaceAndMark = async () => {
    if (!activeSessionId) {
      setMessage("Find active session first.");
      return;
    }

    try {
      if (!cameraOpen && !capturedAttendanceImage) {
        setMessage("Open camera or use Capture Photo first, then scan.");
        return;
      }
      const frame = cameraOpen ? captureFrame() : capturedAttendanceImage;
      if (!frame) {
        setMessage("Face image is empty. Retry camera or capture photo again.");
        return;
      }
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
      pushToast("Attendance marked via face scan.", "success");
      setFaceHint("");
      setCapturedAttendanceImage("");
      closeAttendanceCamera();
      void loadHistory();
      void loadDailyAttendance();
    } catch (error) {
      const msg = parseApiError(error, "Attendance failed: face/location validation failed.");
      setMessage(msg);
      pushToast(msg, "error");
      if (msg.toLowerCase().includes("opencv") || msg.toLowerCase().includes("service")) {
        setFaceHint("OpenCV service unreachable. Please retry in a few moments or contact admin.");
      } else if (msg.toLowerCase().includes("confidence") || msg.toLowerCase().includes("not recognized")) {
        setFaceHint("Low confidence: keep face centered, improve lighting, and retry scan.");
      } else if (msg.toLowerCase().includes("permission")) {
        setFaceHint("Camera/Location permission blocked. Enable permissions in browser settings.");
      } else {
        setFaceHint("");
      }
    }
  };

  const markAttendanceManual = async () => {
    if (!activeSessionId) {
      setMessage("Find active session first.");
      return;
    }

    try {
      const location = await getLocation();
      const res = await api.post("/attendance/mark", {
        sessionId: activeSessionId,
        latitude: location.latitude,
        longitude: location.longitude,
        manualBypass: true
      });
      const status = String(res.data?.attendance?.status || "").toLowerCase();
      const flag = String(res.data?.attendance?.locationFlag || "").toLowerCase();
      if (status === "present") {
        setMessage("Attendance marked manually. Status: Present (Green).");
        pushToast("Attendance marked successfully.", "success");
      } else if (status === "remote") {
        setMessage("Attendance marked manually. Status: Remote (Yellow).");
        pushToast("Attendance marked as Remote (Yellow).", "info");
      } else {
        setMessage("Attendance marked manually, but status is Absent (Red) because your location is far from college.");
        pushToast("Marked, but flagged RED due to college-distance rule.", "error");
      }
      if (flag === "red") {
        const dist = Number(res.data?.attendance?.distanceMeters);
        if (Number.isFinite(dist)) {
          setFaceHint(`Your college distance was ${Math.round(dist)} m. Red flag is expected for far distance.`);
        }
      }
      void loadDailyAttendance();
      void loadHistory();
    } catch (error) {
      const errMsg = parseApiError(error, "Manual attendance failed.");
      setMessage(errMsg);
      pushToast(errMsg, "error");
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
  const presentCount = dailyAttendance.filter((row) => row.status === "present").length;
  const remoteCount = dailyAttendance.filter((row) => row.status === "remote").length;
  const activeLectureCount = upcomingLectures.filter((row) => String(row.status || "").toUpperCase() === "LIVE").length;

  return (
    <ProtectedRoute allow={["student"]}>
      <DashboardLayout title="Student Dashboard">
        <ToastStack toasts={toasts} onDismiss={(id) => setToasts((prev) => prev.filter((item) => item.id !== id))} />
        <div className="grid gap-4 xl:grid-cols-2">
          <section className="rounded-3xl border border-white/70 bg-white/75 p-4 shadow-[0_12px_35px_rgba(35,70,140,0.08)] backdrop-blur xl:col-span-2">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <article className="rounded-2xl border border-white/80 bg-white/85 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Scheduled Lectures</p>
                <p className="mt-1 text-3xl font-semibold text-slate-900">{upcomingLectures.length}</p>
              </article>
              <article className="rounded-2xl border border-white/80 bg-white/85 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Live Now</p>
                <p className="mt-1 text-3xl font-semibold text-slate-900">{activeLectureCount}</p>
              </article>
              <article className="rounded-2xl border border-white/80 bg-white/85 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Present Marks</p>
                <p className="mt-1 text-3xl font-semibold text-slate-900">{presentCount}</p>
              </article>
              <article className="rounded-2xl border border-white/80 bg-white/85 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Remote Marks</p>
                <p className="mt-1 text-3xl font-semibold text-slate-900">{remoteCount}</p>
              </article>
            </div>
          </section>
          <section id="scan" className="rounded-3xl border border-white/70 bg-white/75 p-4 shadow-[0_12px_35px_rgba(35,70,140,0.08)] backdrop-blur">
            <h2 className="text-base font-semibold">Scan Face for Attendance</h2>
            <p className="mt-2 text-sm text-slate-600">Camera + geolocation data is sent to backend for validation.</p>

            <div className="mt-3 flex flex-wrap gap-2">
              <select className="w-full min-w-0 rounded-lg border border-slate-300 px-3 py-2 text-sm sm:min-w-60" value={selectedSubjectId} onChange={(e) => setSelectedSubjectId(e.target.value)}>
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
                <p className="mt-3 text-center text-4xl font-extrabold tracking-wide text-red-600">
                  {String(Math.floor(remainingSeconds / 60)).padStart(2, "0")}:{String(remainingSeconds % 60).padStart(2, "0")}
                </p>
                <p className="mt-1 text-center text-xs font-semibold uppercase text-red-700">Attendance Window Countdown</p>
              </div>
            ) : null}

            <div className="mt-3 flex flex-wrap gap-2">
              <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm" type="button" onClick={openAttendanceCamera}>Open Camera</button>
              <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm" type="button" onClick={closeAttendanceCamera}>Close Camera</button>
              <label className="cursor-pointer rounded-lg border border-slate-300 px-3 py-2 text-sm">
                Capture Photo
                <input
                  type="file"
                  accept="image/*"
                  capture="user"
                  className="hidden"
                  onChange={(e) => onAttendancePhotoCapture(e.target.files?.[0] || null)}
                />
              </label>
              <button className="rounded-lg bg-[#135ed8] px-3 py-2 text-sm font-semibold text-white" type="button" onClick={scanFaceAndMark}>Scan Face</button>
              {allowManualBypass ? (
                <button className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700" type="button" onClick={markAttendanceManual}>
                  Mark Attendance (Manual)
                </button>
              ) : null}
            </div>

            {cameraOpen && <video ref={attendanceVideoRef} autoPlay playsInline muted className="mt-3 w-full rounded-lg border border-slate-200" />}
            {!cameraOpen && capturedAttendanceImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={capturedAttendanceImage} alt="Captured attendance face" className="mt-3 w-full rounded-lg border border-slate-200 object-cover" />
            ) : null}
            <canvas ref={attendanceCanvasRef} className="hidden" />
            {faceHint ? <p className="mt-2 text-xs text-amber-700">{faceHint}</p> : null}
          </section>

          <section className="rounded-3xl border border-white/70 bg-white/75 p-4 shadow-[0_12px_35px_rgba(35,70,140,0.08)] backdrop-blur">
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

          <section className="rounded-3xl border border-white/70 bg-white/75 p-4 shadow-[0_12px_35px_rgba(35,70,140,0.08)] backdrop-blur xl:col-span-2">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50 p-3">
              <div>
                <p className="text-sm font-semibold text-red-700">Notification Section</p>
                <p className="text-xs text-red-700">Teacher announcements show here with unread alert.</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-red-600 px-2.5 py-1 text-xs font-semibold text-white">
                  Unread: {unreadNotifications}
                </span>
                <Link href="/notifications" className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700">
                  Open Notification Center
                </Link>
              </div>
            </div>

            {notifications.length > 0 ? (
              <div className="mb-3 space-y-2 rounded-xl border border-red-100 bg-red-50/40 p-3">
                {notifications.map((item, index) => (
                  <div key={`${item._id || "n"}-${index}`} className="rounded-lg border border-red-100 bg-white px-3 py-2">
                    <p className="text-sm font-semibold text-slate-800">{item.title || "Notification"}</p>
                    <p className="text-sm text-slate-700">{item.message || "-"}</p>
                    <p className="mt-1 text-xs text-slate-500">{item.createdAt ? new Date(item.createdAt).toLocaleString() : "-"}</p>
                  </div>
                ))}
              </div>
            ) : null}

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

          <section className="rounded-3xl border border-white/70 bg-white/75 p-4 shadow-[0_12px_35px_rgba(35,70,140,0.08)] backdrop-blur xl:col-span-2">
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
                    <th className="py-2">Purpose</th>
                    <th className="py-2">Teacher</th>
                    <th className="py-2">Scheduled Time</th>
                    <th className="py-2">Duration</th>
                    <th className="py-2">Status</th>
                    <th className="py-2">Meeting Link</th>
                    <th className="py-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {upcomingLectures.map((lecture) => (
                    <tr key={lecture._id} className="border-b border-slate-100">
                      <td className="py-2">{lecture.title}</td>
                      <td className="py-2">{lecture.subjectId?.name || "-"}</td>
                      <td className="py-2">{lecture.purpose || "-"}</td>
                      <td className="py-2">{lecture.teacherId?.name || "-"}</td>
                      <td className="py-2">{new Date(lecture.scheduledAt).toLocaleString()}</td>
                      <td className="py-2">{lecture.durationMinutes} min</td>
                      <td className="py-2">{lecture.status || "-"}</td>
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
                          disabled={String(lecture.status || "").toUpperCase() === "CANCELED"}
                          onClick={() => joinScheduledLecture(lecture._id, lecture.meetingLink)}
                          className="rounded-lg bg-[#135ed8] px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Join
                        </button>
                      </td>
                    </tr>
                  ))}
                  {upcomingLectures.length === 0 ? (
                    <tr>
                      <td className="py-3 text-slate-500" colSpan={9}>No scheduled lectures found for your batch.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-3xl border border-white/70 bg-white/75 p-4 shadow-[0_12px_35px_rgba(35,70,140,0.08)] backdrop-blur xl:col-span-2">
            <h2 className="text-base font-semibold">Holiday Announcements</h2>
            <p className="mt-2 text-sm text-slate-600">Class coordinator/teacher holiday notices for your batch.</p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="py-2">From</th>
                    <th className="py-2">To</th>
                    <th className="py-2">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {upcomingHolidays.map((holiday) => (
                    <tr key={holiday._id} className="border-b border-slate-100">
                      <td className="py-2">{new Date(holiday.fromDate).toLocaleDateString()}</td>
                      <td className="py-2">{new Date(holiday.toDate).toLocaleDateString()}</td>
                      <td className="py-2">{holiday.reason}</td>
                    </tr>
                  ))}
                  {upcomingHolidays.length === 0 ? (
                    <tr>
                      <td className="py-3 text-slate-500" colSpan={3}>No holidays announced.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          <section id="history" className="rounded-3xl border border-white/70 bg-white/75 p-4 shadow-[0_12px_35px_rgba(35,70,140,0.08)] backdrop-blur xl:col-span-2">
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

          <section className="rounded-3xl border border-white/70 bg-white/75 p-4 shadow-[0_12px_35px_rgba(35,70,140,0.08)] backdrop-blur xl:col-span-2">
            <h2 className="text-base font-semibold">Virtual Classroom Details</h2>
            <p className="mt-2 text-sm text-slate-600">Department, class division, class coordinator and top 4 teacher mappings.</p>

            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Department</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{classroomBatchInfo?.departmentName || "-"}</p>
                <p className="text-xs text-slate-600">{classroomBatchInfo?.departmentCode || "-"}</p>
              </div>
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Class</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{classroomBatchInfo?.year || user?.year || "-"}-{classroomBatchInfo?.division || user?.division || "-"}</p>
                <p className="text-xs text-slate-600">Batch Key: {batchKey || "-"}</p>
              </div>
            </div>

            <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50 p-3">
              <p className="text-xs uppercase tracking-wide text-violet-700">Class Coordinator</p>
              {classroomCoordinators.length > 0 ? (
                classroomCoordinators.map((coordinator) => (
                  <p key={coordinator._id} className="mt-1 text-sm font-semibold text-violet-900">
                    {coordinator.name} ({coordinator.email})
                  </p>
                ))
              ) : (
                <p className="mt-1 text-sm text-violet-900">Not assigned yet.</p>
              )}
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {classroomTeachers.slice(0, 4).map((teacher) => (
                <article key={teacher._id} className="rounded-xl border border-slate-200 p-3">
                  <p className="text-sm font-semibold text-slate-900">{teacher.name || "-"}</p>
                  <p className="text-xs text-slate-600">{teacher.email || "-"}</p>
                  <p className="mt-2 text-xs text-slate-500">
                    Subjects: {(teacher.subjects || []).length
                      ? teacher.subjects?.map((s) => `${s.name || "-"}${s.code ? ` (${s.code})` : ""}`).join(", ")
                      : "No mapped subjects"}
                  </p>
                </article>
              ))}
              {classroomTeachers.length === 0 ? (
                <p className="text-sm text-slate-500">No classroom teachers available.</p>
              ) : null}
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

          <section className="rounded-3xl border border-white/70 bg-white/75 p-4 shadow-[0_12px_35px_rgba(35,70,140,0.08)] backdrop-blur xl:col-span-2">
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
            <p className="mt-2 text-sm text-slate-600">Green = near college, Yellow = medium distance, Red = far from college location (even if session distance is near).</p>
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

        <div className="mt-4 rounded-2xl border border-white/70 bg-white/75 p-3 text-sm text-slate-700 shadow-[0_8px_25px_rgba(35,70,140,0.06)]">{message}</div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}

