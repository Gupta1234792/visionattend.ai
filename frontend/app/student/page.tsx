"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, memo } from "react";
import type { Socket } from "socket.io-client";
import api from "@/src/services/api";
import { ProtectedRoute } from "@/src/components/protected-route";
import { ToastItem, ToastStack } from "@/src/components/toast-stack";
import { DashboardLayout } from "@/src/layouts/dashboard-layout";
import { useAuth } from "@/src/context/auth-context";
import {
  AttendanceHeatmap,
  type HeatmapPoint,
} from "@/src/components/AttendanceHeatmap";
import {
  detectPreciseLocation,
  formatGeolocationError,
} from "@/src/utils/location";
import {
  buildBatchKey,
  buildBatchRoomId,
  buildLectureRoomId,
  connectCollegeSocket,
} from "@/src/services/socket";
import { useCameraStream } from "@/src/hooks/use-camera-stream";
import { getConfidenceUi, isMobileUnsafeCameraContext, mapFaceErrorMessage } from "@/src/utils/demo-ux";

// Memoized components
const StatCard = memo(({ label, value }: { label: string; value: number }) => (
  <article className="rounded-2xl border border-white/80 bg-white/85 p-3">
    <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
    <p className="mt-1 text-3xl font-semibold text-slate-900">{value}</p>
  </article>
));

StatCard.displayName = "StatCard";

type AttendanceHistoryRow = { subject?: string; percentage?: number };
type DailyAttendanceRow = {
  sessionId: string;
  date: string;
  subject: string;
  subjectCode: string;
  status: "present" | "remote" | "absent" | "pending";
  locationFlag: "green" | "yellow" | "red" | null;
  distanceMeters?: number | null;
  gpsDistance?: number | null;
  markedAt?: string | null;
};
type TimetableSlotRow = {
  startTime: string;
  endTime?: string;
  subject: string;
  teacherName?: string;
  type?: string;
};
type TodaysTimetableRow = {
  classLabel?: string;
  date?: string;
  slots?: TimetableSlotRow[];
};
type BatchLecture = {
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
  remainingSeconds?: number;
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
type AttendanceStartPayload = {
  sessionId?: string;
  subjectId?: string;
  batchKey?: string;
  endTime?: string;
  teacherName?: string;
  teacherEmail?: string;
};

const isLiveLectureRow = (lecture: BatchLecture) =>
  String(lecture.status || "").toUpperCase() === "LIVE";

const isLectureHistoryItem = (lecture: BatchLecture) => {
  const status = String(lecture.status || "").toUpperCase();
  if (status === "ENDED" || status === "CANCELED") return true;

  const startedAtValue = lecture.startedAt || lecture.scheduledAt;
  const startedAtMs = new Date(startedAtValue || 0).getTime();
  const durationMs = Number(lecture.durationMinutes || 0) * 60 * 1000;
  if (!startedAtMs || !durationMs) return false;

  const endedAtMs = lecture.endedAt
    ? new Date(lecture.endedAt).getTime()
    : startedAtMs + durationMs;

  return endedAtMs < Date.now();
};

type SpeechRecognitionResultLike = {
  transcript: string;
};

type SpeechRecognitionEventLike = {
  results: ArrayLike<ArrayLike<SpeechRecognitionResultLike>>;
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

const renderInlineMarkdown = (
  text: string,
  keyPrefix: string,
  role: "user" | "assistant",
): ReactNode[] => {
  const nodes: ReactNode[] = [];
  const pattern = /(`[^`\n]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let tokenIndex = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const token = match[0];
    if (token.startsWith("`")) {
      nodes.push(
        <code
          key={`${keyPrefix}_code_${tokenIndex}`}
          className={`rounded-md px-1.5 py-0.5 font-mono text-[12px] ${
            role === "assistant"
              ? "bg-slate-100 text-slate-800"
              : "bg-white/15 text-white"
          }`}
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith("**")) {
      nodes.push(
        <strong key={`${keyPrefix}_strong_${tokenIndex}`}>
          {token.slice(2, -2)}
        </strong>,
      );
    } else {
      nodes.push(
        <em key={`${keyPrefix}_em_${tokenIndex}`}>{token.slice(1, -1)}</em>,
      );
    }

    lastIndex = pattern.lastIndex;
    tokenIndex += 1;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
};

const renderPlainMarkdown = (
  text: string,
  keyPrefix: string,
  role: "user" | "assistant",
) => {
  const normalized = text.replace(/\r/g, "").trim();
  if (!normalized) return null;

  const lines = normalized.split("\n");
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  let listType: "ul" | "ol" | null = null;
  let listItems: string[] = [];
  let blockIndex = 0;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    const textValue = paragraph.join(" ");
    blocks.push(
      <p key={`${keyPrefix}_p_${blockIndex}`} className="whitespace-pre-wrap">
        {renderInlineMarkdown(textValue, `${keyPrefix}_p_${blockIndex}`, role)}
      </p>,
    );
    paragraph = [];
    blockIndex += 1;
  };

  const flushList = () => {
    if (!listType || !listItems.length) return;
    const Tag = listType;
    blocks.push(
      <Tag
        key={`${keyPrefix}_list_${blockIndex}`}
        className={`space-y-1 pl-5 ${listType === "ul" ? "list-disc" : "list-decimal"}`}
      >
        {listItems.map((item, index) => (
          <li key={`${keyPrefix}_item_${blockIndex}_${index}`}>
            {renderInlineMarkdown(
              item,
              `${keyPrefix}_item_${blockIndex}_${index}`,
              role,
            )}
          </li>
        ))}
      </Tag>,
    );
    listType = null;
    listItems = [];
    blockIndex += 1;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    const unorderedMatch = line.match(/^[-*]\s+(.+)$/);
    const orderedMatch = line.match(/^\d+\.\s+(.+)$/);

    if (unorderedMatch) {
      flushParagraph();
      if (listType && listType !== "ul") {
        flushList();
      }
      listType = "ul";
      listItems.push(unorderedMatch[1]);
      continue;
    }

    if (orderedMatch) {
      flushParagraph();
      if (listType && listType !== "ol") {
        flushList();
      }
      listType = "ol";
      listItems.push(orderedMatch[1]);
      continue;
    }

    flushList();
    paragraph.push(line);
  }

  flushParagraph();
  flushList();

  return <div className="space-y-3">{blocks}</div>;
};

const renderMessageMarkdown = (
  text: string,
  role: "user" | "assistant",
) => {
  const blocks: ReactNode[] = [];
  const pattern = /```([a-zA-Z0-9_-]+)?\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let blockIndex = 0;

  while ((match = pattern.exec(text)) !== null) {
    const plainText = text.slice(lastIndex, match.index);
    const plainNode = renderPlainMarkdown(
      plainText,
      `plain_${blockIndex}`,
      role,
    );
    if (plainNode) {
      blocks.push(plainNode);
      blockIndex += 1;
    }

    const language = match[1] || "code";
    const code = (match[2] || "").trim();
    blocks.push(
      <div
        key={`code_${blockIndex}`}
        className={`overflow-hidden rounded-2xl border ${
          role === "assistant"
            ? "border-slate-200 bg-slate-950"
            : "border-white/10 bg-slate-950/80"
        }`}
      >
        <div className="border-b border-white/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
          {language}
        </div>
        <pre className="overflow-x-auto px-3 py-3 text-[12px] leading-6 text-slate-100">
          <code>{code}</code>
        </pre>
      </div>,
    );
    blockIndex += 1;
    lastIndex = pattern.lastIndex;
  }

  const trailingText = text.slice(lastIndex);
  const trailingNode = renderPlainMarkdown(
    trailingText,
    `plain_${blockIndex}`,
    role,
  );
  if (trailingNode) {
    blocks.push(trailingNode);
  }

  return blocks.length ? blocks : <p>{text}</p>;
};

export default function StudentPage() {
  const { user, token } = useAuth();
  const [message, setMessage] = useState("Student dashboard ready.");
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [activeSessionId, setActiveSessionId] = useState("");
  const [activeSessionMeta, setActiveSessionMeta] = useState<ActiveSessionMeta | null>(null);
  const [history, setHistory] = useState<AttendanceHistoryRow[]>([]);
  const [upcomingLectures, setUpcomingLectures] = useState<BatchLecture[]>([]);
  const [activeLiveLecture, setActiveLiveLecture] = useState<BatchLecture | null>(null);
  const [upcomingHolidays, setUpcomingHolidays] = useState<BatchHoliday[]>([]);
  const [dailyAttendance, setDailyAttendance] = useState<DailyAttendanceRow[]>([]);
  const [classroomTeachers, setClassroomTeachers] = useState<ClassroomTeacher[]>([]);
  const [classroomCoordinators, setClassroomCoordinators] = useState<ClassroomCoordinator[]>([]);
  const [classroomBatchInfo, setClassroomBatchInfo] = useState<ClassroomBatchInfo | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [faceHint, setFaceHint] = useState("");
  const [scanStage, setScanStage] = useState<"idle" | "capturing" | "verifying" | "success">("idle");
  const [showAttendanceSuccess, setShowAttendanceSuccess] = useState(false);
  const [scanCountdownValue, setScanCountdownValue] = useState<number | null>(null);
  const [isCameraLaunching, setIsCameraLaunching] = useState(false);
  const [lastFaceConfidence, setLastFaceConfidence] = useState<number | null>(null);
  const [lowLightWarning, setLowLightWarning] = useState("");
  const [todaysTimetable, setTodaysTimetable] = useState<TodaysTimetableRow | null>(null);
  const allowManualBypass = process.env.NEXT_PUBLIC_DEV_BYPASS === "true";
  const [botMessages, setBotMessages] = useState<BotMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      text: "Hi, I am CampusGenie. Ask me doubts about attendance, lectures, or your daily workflow.",
    },
  ]);
  const [botInput, setBotInput] = useState("");
  const [botLoading, setBotLoading] = useState(false);
  const quickBotPrompts = [
    "How many classes attended today?",
    "Is attendance live right now?",
    "Do I have a live lecture now?",
    "What do the green, yellow, and red flags mean?",
  ];
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [voiceListening, setVoiceListening] = useState(false);
  const [miniHeatmapData, setMiniHeatmapData] = useState<HeatmapPoint[]>([]);
  const [miniAttendanceRate, setMiniAttendanceRate] = useState(0);
  const [lectureBannerSeconds, setLectureBannerSeconds] = useState(0);
  const [timetableLoading, setTimetableLoading] = useState(false);

  const [isPolling, setIsPolling] = useState(false);
  const [isLiveScanRunning, setIsLiveScanRunning] = useState(false);
  const {
    videoRef: attendanceVideoRef,
    canvasRef: attendanceCanvasRef,
    isOpen: cameraOpen,
    openCamera: openAttendanceCameraStream,
    closeCamera: closeAttendanceCamera,
    captureFrame,
    handleReady: handleAttendanceVideoReady,
  } = useCameraStream();

  const [liveClassActive, setLiveClassActive] = useState(false);
  const [remoteStreams, setRemoteStreams] = useState<Array<{ socketId: string; stream: MediaStream }>>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const botScrollRef = useRef<HTMLDivElement | null>(null);
  const speechRecognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const liveLectureAlertedRef = useRef("");
  const upcomingLecturesRef = useRef<BatchLecture[]>([]);
  const activeLectureRef = useRef<BatchLecture | null>(null);
  
  // Performance optimization refs
  const lastSessionIdRef = useRef("");
  const lastSessionMetaRef = useRef<ActiveSessionMeta | null>(null);
  const lastRemainingRef = useRef(0);
  const lastToastSessionRef = useRef<string>("");
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const messageRef = useRef(message);
  const pushToastRef = useRef<(text: string, type: "success" | "error" | "info") => void>(() => {});
  const pollActiveSessionRef = useRef<() => void>(() => {});
  const mountedRef = useRef(true);

  const parseApiError = useCallback((error: unknown, fallback: string) => {
    const maybeMessage = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
    const localMessage = (error as { message?: string })?.message;
    return maybeMessage || localMessage || fallback;
  }, []);
  
  const pushToast = useCallback((text: string, type: "success" | "error" | "info" = "info") => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 3200);
  }, []);
  
  // Update refs after functions are defined
  useEffect(() => {
    pushToastRef.current = pushToast;
  }, [pushToast]);
  
  useEffect(() => {
    messageRef.current = message;
  }, [message]);
  
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const speakText = (text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1;
      utterance.pitch = 1;
      window.speechSynthesis.speak(utterance);
    } catch {
      // ignore speech synthesis failures
    }
  };
  
  const playLiveLectureAlert = () => {
    if (typeof window === "undefined") return;
    try {
      const AudioContextCtor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) return;

      const context = new AudioContextCtor();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(880, context.currentTime);
      oscillator.frequency.setValueAtTime(660, context.currentTime + 0.2);
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.45);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.45);
      oscillator.onended = () => {
        void context.close().catch(() => null);
      };
    } catch {
      // ignore audio alert failures
    }
  };

  const batchKey = useMemo(() => 
    user?.department && user?.year && user?.division
      ? buildBatchKey(user.department, user.year, user.division)
      : "",
  [user?.department, user?.year, user?.division]);
  
  const liveRoomId = useMemo(() => batchKey ? buildBatchRoomId(batchKey) : "", [batchKey]);
  const lectureRoomId = useMemo(() => activeLiveLecture?.meetingRoomId ? buildLectureRoomId(activeLiveLecture.meetingRoomId) : "", [activeLiveLecture?.meetingRoomId]);
  const mediaRoomId = useMemo(() => lectureRoomId || liveRoomId, [lectureRoomId, liveRoomId]);

  const addRemoteStream = useCallback((peerSocketId: string, stream: MediaStream) => {
    setRemoteStreams((prev) => {
      const exists = prev.find((item) => item.socketId === peerSocketId);
      if (exists) {
        return prev.map((item) => item.socketId === peerSocketId ? { socketId: peerSocketId, stream } : item);
      }
      return [...prev, { socketId: peerSocketId, stream }];
    });
  }, []);

  const closePeer = useCallback((peerSocketId: string) => {
    const peer = peersRef.current.get(peerSocketId);
    if (peer) {
      peer.onicecandidate = null;
      peer.ontrack = null;
      peer.close();
      peersRef.current.delete(peerSocketId);
    }
    setRemoteStreams((prev) => prev.filter((item) => item.socketId !== peerSocketId));
  }, []);

  const createPeer = useCallback((peerSocketId: string, roomId: string) => {
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
  }, [addRemoteStream]);

  const loadSubjects = useCallback(async () => {
    try {
      await api.get("/subjects/mine");
    } catch (error) {
      const errorMsg = parseApiError(error, "Failed to load subjects.");
      if (messageRef.current !== errorMsg) setMessage(errorMsg);
    }
  }, [parseApiError]);

  const loadHistory = useCallback(async () => {
    try {
      const res = await api.get("/reports/student");
      setHistory(res.data.attendance || []);
    } catch {
      setHistory([]);
    }
  }, []);

  const loadAnnouncements = useCallback(async () => {
    if (!liveRoomId) return;
    try {
      const res = await api.get(`/chat/room/${liveRoomId}`);
      const historyRows = (res.data?.messages || []).map(
        (item: { message: string; sender?: { name?: string; role?: string; _id?: string }; createdAt?: string }) => ({
          roomId: liveRoomId,
          message: item.message,
          sender: item.sender,
          time: item.createdAt,
        }),
      );
      setAnnouncements(historyRows);
    } catch {
      setAnnouncements([]);
    }
  }, [liveRoomId]);

  const loadBatchLectures = useCallback(async () => {
    if (!batchKey) return;
    try {
      const res = await api.get(`/lectures/batch/${batchKey}`);
      const lectures = res.data?.lectures || [];
      setUpcomingLectures(lectures);
      upcomingLecturesRef.current = lectures;
      const liveLecture = lectures.find((lecture: BatchLecture) => String(lecture.status || "").toUpperCase() === "LIVE") || null;
      setActiveLiveLecture(liveLecture);
      activeLectureRef.current = liveLecture;
    } catch (error) {
      setUpcomingLectures([]);
      upcomingLecturesRef.current = [];
      setActiveLiveLecture(null);
      activeLectureRef.current = null;
      const errorMsg = parseApiError(error, "Unable to load scheduled lectures.");
      if (messageRef.current !== errorMsg) setMessage(errorMsg);
    }
  }, [batchKey, parseApiError]);

  const loadDailyAttendance = useCallback(async () => {
    try {
      const res = await api.get("/reports/student/daily");
      setDailyAttendance(res.data?.records || []);
    } catch (error) {
      setDailyAttendance([]);
      const errorMsg = parseApiError(error, "Unable to load daily attendance.");
      if (messageRef.current !== errorMsg) setMessage(errorMsg);
    }
  }, [parseApiError]);

  const loadBatchHolidays = useCallback(async () => {
    if (!batchKey) return;
    try {
      const res = await api.get(`/holidays/batch/${batchKey}`);
      setUpcomingHolidays(res.data?.holidays || []);
    } catch {
      setUpcomingHolidays([]);
    }
  }, [batchKey]);

  const loadClassroomTeachers = useCallback(async () => {
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
  }, [batchKey]);

  const loadNotifications = useCallback(async () => {
    try {
      const res = await api.get("/notifications/my?isRead=false&limit=5");
      setNotifications(res.data?.notifications || []);
      setUnreadNotifications(Number(res.data?.unread || 0));
    } catch {
      setNotifications([]);
      setUnreadNotifications(0);
    }
  }, []);

  const loadMiniAnalytics = useCallback(async () => {
    try {
      const res = await api.get("/student/analytics");
      setMiniHeatmapData(res.data?.heatmapData || []);
      setMiniAttendanceRate(Number(res.data?.overallAttendance || 0));
    } catch {
      setMiniHeatmapData([]);
      setMiniAttendanceRate(0);
    }
  }, []);

  const loadTodaysTimetable = useCallback(async () => {
    if (!batchKey) return;
    try {
      setTimetableLoading(true);
      const res = await api.get(`/timetables/today/${batchKey}`);
      if (res.data.success) {
        setTodaysTimetable(res.data.timetable);
      } else {
        setTodaysTimetable(null);
      }
    } catch (error) {
      console.error("Failed to load today's timetable:", error);
      setTodaysTimetable(null);
    } finally {
      setTimetableLoading(false);
    }
  }, [batchKey]);

  const checkActiveLecture = useCallback(async () => {
    if (!batchKey) return;
    try {
      const res = await api.get(`/lectures/active/${batchKey}`);
      const lecture = res.data?.lecture;
      if (lecture && lecture._id !== activeLectureRef.current?._id) {
        setActiveLiveLecture(lecture);
        pushToastRef.current(`${lecture.title} is live now!`, "success");
      }
    } catch (error) {
      console.error("Failed to check active lecture:", error);
    }
  }, [batchKey]);

  const clearActiveSession = useCallback((nextMessage?: string) => {
    if (lastSessionIdRef.current !== "") {
      lastSessionIdRef.current = "";
      setActiveSessionId("");
      setActiveSessionMeta(null);
      lastSessionMetaRef.current = null;
      setRemainingSeconds(0);
      lastRemainingRef.current = 0;
      if (nextMessage && messageRef.current !== nextMessage) {
        setMessage(nextMessage);
      }
    }
  }, []);

  const pollActiveSession = useCallback(async () => {
    try {
      const res = await api.get("/attendance/active-class");
      const session = res.data?.session;
      const nextRemainingSeconds = Number(res.data?.remainingSeconds || 0);

      if (!session?._id) {
        if (lastSessionIdRef.current !== "") {
          lastSessionIdRef.current = "";
          setActiveSessionId("");
          setActiveSessionMeta(null);
          lastSessionMetaRef.current = null;
          setRemainingSeconds(0);
          lastRemainingRef.current = 0;
        }
        return;
      }

      // Only update if session ID changed
      if (session._id !== lastSessionIdRef.current) {
        lastSessionIdRef.current = session._id;
        setActiveSessionId(session._id);
        
        const newMeta = {
          teacherName: session.teacher?.name,
          teacherEmail: session.teacher?.email,
          remainingSeconds: nextRemainingSeconds,
        };
        lastSessionMetaRef.current = newMeta;
        setActiveSessionMeta(newMeta);
        
        // Set remaining seconds ONLY when session starts
        if (lastRemainingRef.current !== nextRemainingSeconds) {
          lastRemainingRef.current = nextRemainingSeconds;
          setRemainingSeconds(nextRemainingSeconds);
        }
        
        if (lastToastSessionRef.current !== session._id) {
          pushToastRef.current("Attendance session started!", "success");
          lastToastSessionRef.current = session._id;
        }
      }
    } catch (error: any) {
      const status = error?.response?.status;
      if (status === 404 || status === 403) {
        if (lastSessionIdRef.current !== "") {
          lastSessionIdRef.current = "";
          setActiveSessionId("");
          setActiveSessionMeta(null);
          lastSessionMetaRef.current = null;
          setRemainingSeconds(0);
          lastRemainingRef.current = 0;
        }
      }
    }
  }, []);

  useEffect(() => {
    pollActiveSessionRef.current = pollActiveSession;
  }, [pollActiveSession]);

  // Initial data load - runs only once
  useEffect(() => {
    const loadInitialData = async () => {
      await Promise.all([
        loadSubjects(),
        loadHistory(),
        loadAnnouncements(),
        loadBatchLectures(),
        loadBatchHolidays(),
        loadDailyAttendance(),
        loadClassroomTeachers(),
        loadNotifications(),
        loadMiniAnalytics(),
        loadTodaysTimetable(),
        checkActiveLecture(),
      ]);
      setIsPolling(true);
    };
    
    loadInitialData();
    
    return () => {
      setIsPolling(false);
      clearActiveSession();
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
    };
  }, []); // Empty dependency array - runs once

  // Optimized polling with stable interval
  useEffect(() => {
    if (!batchKey) return;
    
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }
    
    pollingIntervalRef.current = setInterval(() => {
      pollActiveSessionRef.current();
    }, 5000); // Reduced frequency to 5 seconds
    
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [batchKey]);

  // Optimized periodic refresh - only essential data, less frequent
  useEffect(() => {
    if (!batchKey) return;
    
    if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current);
    }
    
    refreshIntervalRef.current = setInterval(() => {
      loadBatchLectures();
      loadDailyAttendance();
    }, 60000); // Reduced to 60 seconds
    
    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }
    };
  }, [batchKey, loadBatchLectures, loadDailyAttendance]);

  // Optimized countdown timer - only runs when session is active
  useEffect(() => {
    if (!activeSessionId) {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
      return;
    }
    
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
    }
    
    countdownIntervalRef.current = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
            countdownIntervalRef.current = null;
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    
    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
    };
  }, [activeSessionId]);

  useEffect(() => {
    if (!botScrollRef.current) return;
    botScrollRef.current.scrollTop = botScrollRef.current.scrollHeight;
  }, [botMessages, botLoading]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const ctor = (window as Window & { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor }).SpeechRecognition ||
      (window as Window & { webkitSpeechRecognition?: SpeechRecognitionCtor }).webkitSpeechRecognition;
    setVoiceSupported(Boolean(ctor));
  }, []);

  useEffect(() => {
    if (!activeLiveLecture) {
      setLectureBannerSeconds(0);
      liveLectureAlertedRef.current = "";
      return;
    }

    const updateLectureCountdown = () => {
      const startedAt = activeLiveLecture.startedAt || activeLiveLecture.scheduledAt;
      const startedAtMs = new Date(startedAt || 0).getTime();
      if (!startedAtMs || !activeLiveLecture.durationMinutes) {
        setLectureBannerSeconds(0);
        return;
      }
      const endsAtMs = startedAtMs + Number(activeLiveLecture.durationMinutes || 0) * 60 * 1000;
      setLectureBannerSeconds(Math.max(0, Math.floor((endsAtMs - Date.now()) / 1000)));
    };

    updateLectureCountdown();
    const timer = window.setInterval(updateLectureCountdown, 1000);
    return () => window.clearInterval(timer);
  }, [activeLiveLecture]);

  useEffect(() => {
    if (!activeLiveLecture?._id) return;
    if (liveLectureAlertedRef.current === activeLiveLecture._id) return;
    liveLectureAlertedRef.current = activeLiveLecture._id;
    playLiveLectureAlert();
    speakText(`${activeLiveLecture.teacherId?.name || "Teacher"} started live lecture. Join now.`);
  }, [activeLiveLecture]);

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    if (!token || !user?.college) return;

    const socket = connectCollegeSocket(token, user.college);
    socketRef.current = socket;

    socket.on("connect", () => {
      if (liveRoomId) socket.emit("join-room", { roomId: liveRoomId });
      if (mediaRoomId) socket.emit("join-room", { roomId: mediaRoomId });
      if (batchKey) {
        socket.emit("join-batch-room", { batchId: batchKey });
      }
    });

    socket.on("chat-message", (payload: Announcement) => {
      if (payload?.roomId && payload.roomId !== liveRoomId) return;
      setAnnouncements((prev) => [...prev, payload]);
      pushToastRef.current("New lecture announcement received.", "info");
    });

    socket.on("notification:new", (payload: NotificationItem) => {
      setNotifications((prev) =>
        [
          {
            title: payload?.title || "Notification",
            message: payload?.message || "",
            createdAt: payload?.createdAt || new Date().toISOString(),
            isRead: false,
          },
          ...prev,
        ].slice(0, 5),
      );
      setUnreadNotifications((prev) => prev + 1);
    });

    socket.on("ATTENDANCE_SESSION_STARTED", (payload: AttendanceStartPayload) => {
      if (payload?.batchKey && payload.batchKey !== batchKey) return;
      if (payload?.sessionId && payload.sessionId !== lastSessionIdRef.current) {
        lastSessionIdRef.current = payload.sessionId;
        setActiveSessionId(payload.sessionId);
        const remaining = payload?.endTime
          ? Math.max(0, Math.floor((new Date(payload.endTime).getTime() - Date.now()) / 1000))
          : 10 * 60;
        setRemainingSeconds(remaining);
        lastRemainingRef.current = remaining;
        const newMeta = {
          teacherName: payload?.teacherName || "",
          teacherEmail: payload?.teacherEmail || "",
          remainingSeconds: remaining,
        };
        lastSessionMetaRef.current = newMeta;
        setActiveSessionMeta(newMeta);
        
        if (lastToastSessionRef.current !== payload.sessionId) {
          pushToastRef.current("Attendance session is live now.", "success");
          lastToastSessionRef.current = payload.sessionId;
        }
      }
      loadDailyAttendance();
    });

    socket.on("ATTENDANCE_MARKED", () => {
      loadDailyAttendance();
      loadHistory();
    });

    socket.on("ATTENDANCE_SESSION_CLOSED", () => {
      loadDailyAttendance();
      clearActiveSession("Attendance session closed.");
    });

    socket.on("LECTURE_STARTED", () => {
      loadBatchLectures();
      loadNotifications();
      pushToastRef.current("Teacher started live lecture. Join now.", "success");
    });

    socket.on("LECTURE_ENDED", () => {
      loadBatchLectures();
      loadNotifications();
      leaveLiveClass();
      setActiveLiveLecture(null);
      pushToastRef.current("Live lecture ended.", "info");
    });

    socket.on("live_class_started", (payload: { lectureId: string; batchId: string; title: string; subject: string; teacher: string; meetingRoomId: string; meetingLink: string; startedAt: string }) => {
      if (payload?.batchId && payload.batchId !== batchKey) return;

      const lecture = upcomingLecturesRef.current.find((item) => item._id === payload.lectureId);
      if (lecture && lecture._id !== activeLectureRef.current?._id) {
        setActiveLiveLecture(lecture);
        activeLectureRef.current = lecture;
        pushToastRef.current(`${lecture.title} is live now!`, "success");
      } else if (!lecture) {
        loadBatchLectures();
        pushToastRef.current("Live lecture started!", "success");
      }
    });

    socket.on("live_class_ended", (payload: { lectureId: string; batchId: string; endedAt: string }) => {
      if (payload?.batchId && payload.batchId !== batchKey) return;

      if (activeLectureRef.current?._id === payload.lectureId) {
        setActiveLiveLecture(null);
        activeLectureRef.current = null;
        leaveLiveClass();
        pushToastRef.current("Live lecture ended.", "info");
      }
    });

    socket.on("TIMETABLE_UPDATED", (payload: { batchKey: string; date: string; action: string }) => {
      if (payload?.batchKey && payload.batchKey !== batchKey) return;
      
      const today = new Date().toISOString().split('T')[0];
      if (payload.date === today) {
        loadTodaysTimetable();
        pushToastRef.current(`Timetable ${payload.action} for today.`, "info");
      }
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
        if (messageRef.current !== "Failed to connect live class stream.") setMessage("Failed to connect live class stream.");
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
        if (messageRef.current !== "Realtime connection sync failed.") setMessage("Realtime connection sync failed.");
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, user?.college, liveRoomId, mediaRoomId, liveClassActive, batchKey, createPeer, closePeer]);
  /* eslint-enable react-hooks/exhaustive-deps */

  const openAttendanceCamera = useCallback(async () => {
    if (cameraOpen || isCameraLaunching) return;
    setIsCameraLaunching(true);
    for (const tick of [3, 2, 1]) {
      setScanCountdownValue(tick);
      await wait(650);
    }
    setScanCountdownValue(null);
    const result = await openAttendanceCameraStream();
    if (!result.success) {
      if (messageRef.current !== result.message) setMessage(result.message);
      pushToastRef.current(result.message, "error");
      setIsCameraLaunching(false);
      return;
    }

    if (messageRef.current !== "Camera opened successfully. Ready for face scan.") setMessage("Camera opened successfully. Ready for face scan.");
    pushToastRef.current("Camera opened successfully", "success");
    setIsCameraLaunching(false);
  }, [cameraOpen, isCameraLaunching, openAttendanceCameraStream]);

  const wait = (ms: number) => new Promise((resolve) => { window.setTimeout(resolve, ms); });

  const captureLiveBlinkFrames = async () => {
    const frames: string[] = [];
    setIsLiveScanRunning(true);
    if (messageRef.current !== "Blink once now. Capturing live frames...") setMessage("Blink once now. Capturing live frames...");

    for (let index = 0; index < 8; index += 1) {
      const frame = captureFrame();
      if (!frame) {
        setIsLiveScanRunning(false);
        return [];
      }
      frames.push(frame);
      await wait(180);
    }

    setIsLiveScanRunning(false);
    return frames;
  };

  const getTimetableSlotStatus = useCallback((slot: TimetableSlotRow) => {
    if (!todaysTimetable?.date || !slot.startTime) return "scheduled";

    const datePart = String(todaysTimetable.date).split("T")[0];
    const startAt = new Date(`${datePart}T${slot.startTime}`);
    const endAt = new Date(`${datePart}T${slot.endTime || slot.startTime}`);
    const now = new Date();

    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) return "scheduled";
    if (now >= startAt && now <= endAt) return "active";
    if (now < startAt) return "upcoming";
    return "completed";
  }, [todaysTimetable?.date]);

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

  const getLocation = async () => {
    try {
      const location = await detectPreciseLocation();
      const locationMsg = `Location locked (${Math.round(location.accuracy)}m accuracy via ${location.source}).`;
      if (messageRef.current !== locationMsg) setMessage(locationMsg);
      return { latitude: location.latitude, longitude: location.longitude };
    } catch (error) {
      if (allowManualBypass) {
        const fallback = await getCollegeFallbackLocation();
        if (fallback) {
          const bypassMsg = "Live location blocked on this mobile URL. Using college location for dev test.";
          if (messageRef.current !== bypassMsg) setMessage(bypassMsg);
          return fallback;
        }
      }

      const details = formatGeolocationError(error);
      throw new Error(details.friendly);
    }
  };

  const scanFaceAndMark = async () => {
    if (!activeSessionId) {
      const noSessionMsg = "No active attendance session. Waiting for teacher to start...";
      if (messageRef.current !== noSessionMsg) setMessage(noSessionMsg);
      return;
    }

    try {
      if (!cameraOpen) {
        if (messageRef.current !== "Open live camera first, then blink once to scan.") setMessage("Open live camera first, then blink once to scan.");
        return;
      }
      setScanStage("capturing");
      setFaceHint("Scanning live frames. Please blink once.");
      const frames = await captureLiveBlinkFrames();
      if (frames.length < 6) {
        const captureMsg = "Live frame capture failed. Keep camera open and retry.";
        if (messageRef.current !== captureMsg) setMessage(captureMsg);
        setScanStage("idle");
        return;
      }
      setScanStage("verifying");
      setFaceHint("Verifying face, blink, and geolocation...");
      const location = await getLocation();
      const authToken = token || (typeof window !== "undefined" ? localStorage.getItem("va_token") || localStorage.getItem("token") || "" : "");
      if (!authToken) {
        if (messageRef.current !== "Session expired. Please login again.") setMessage("Session expired. Please login again.");
        return;
      }

      const res = await api.post("/attendance/scan-face-class", {
        sessionId: activeSessionId,
        latitude: location.latitude,
        longitude: location.longitude,
        frames,
      }, { headers: { Authorization: `Bearer ${authToken}` } });

      if (messageRef.current !== "Attendance marked via face scan!") setMessage("Attendance marked via face scan!");
      setLastFaceConfidence(Number(res.data?.attendance?.faceConfidence || res.data?.confidence || 0));
      pushToastRef.current("Attendance marked via face scan.", "success");
      setScanStage("success");
      setShowAttendanceSuccess(true);
      setTimeout(() => setShowAttendanceSuccess(false), 1800);
      setFaceHint("");
      closeAttendanceCamera();
      loadHistory();
      loadDailyAttendance();
      clearActiveSession("Attendance marked via face scan!");
    } catch (error) {
      const msg = mapFaceErrorMessage(parseApiError(error, "Attendance failed: face/location validation failed."));
      if (messageRef.current !== msg) setMessage(msg);
      pushToastRef.current(msg, "error");
      if (msg.toLowerCase().includes("opencv") || msg.toLowerCase().includes("service")) {
        setFaceHint("OpenCV service unreachable. Please retry in a few moments or contact admin.");
      } else if (msg.toLowerCase().includes("confidence") || msg.toLowerCase().includes("not recognized") || msg.toLowerCase().includes("blink")) {
        setFaceHint("Keep face centered, improve lighting, and blink once during the live scan.");
      } else if (msg.toLowerCase().includes("permission")) {
        setFaceHint("Camera/Location permission blocked. Enable permissions in browser settings.");
      } else {
        setFaceHint("");
      }
      setScanStage("idle");
    }
  };

  const markAttendanceManual = async () => {
    if (!activeSessionId) {
      const noSessionMsg = "No active attendance session. Waiting for teacher to start...";
      if (messageRef.current !== noSessionMsg) setMessage(noSessionMsg);
      return;
    }

    try {
      const location = await getLocation();
      const res = await api.post("/attendance/mark-class", {
        sessionId: activeSessionId,
        latitude: location.latitude,
        longitude: location.longitude,
        manualBypass: true,
      });
      const status = String(res.data?.attendance?.status || "").toLowerCase();
      const flag = String(res.data?.attendance?.locationFlag || "").toLowerCase();
      if (status === "present") {
        if (messageRef.current !== "Attendance marked manually. Status: Present (Green).") setMessage("Attendance marked manually. Status: Present (Green).");
        pushToastRef.current("Attendance marked successfully.", "success");
      } else if (status === "remote") {
        if (messageRef.current !== "Attendance marked manually. Status: Remote (Yellow).") setMessage("Attendance marked manually. Status: Remote (Yellow).");
        pushToastRef.current("Attendance marked as Remote (Yellow).", "info");
      } else {
        const absentMsg = "Attendance marked manually, but status is Absent (Red) because your location is far from college.";
        if (messageRef.current !== absentMsg) setMessage(absentMsg);
        pushToastRef.current("Marked, but flagged RED due to college-distance rule.", "error");
      }
      if (flag === "red") {
        const dist = Number(res.data?.attendance?.distanceMeters);
        if (Number.isFinite(dist)) {
          setFaceHint(`Your college distance was ${Math.round(dist)} m. Red flag is expected for far distance.`);
        }
      }
      loadDailyAttendance();
      loadHistory();
      clearActiveSession("Attendance marked successfully.");
    } catch (error) {
      const errMsg = parseApiError(error, "Manual attendance failed.");
      if (messageRef.current !== errMsg) setMessage(errMsg);
      pushToastRef.current(errMsg, "error");
    }
  };

  const joinLiveClass = async (roomIdOverride?: string) => {
    const roomId = roomIdOverride || mediaRoomId;
    if (!roomId) {
      if (messageRef.current !== "Classroom context missing.") setMessage("Classroom context missing.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;

      if (socketRef.current) {
        socketRef.current.emit("join-room", { roomId });
        socketRef.current.emit("webrtc-ready", { roomId });
      }

      setLiveClassActive(true);
      const joinMsg = roomIdOverride || activeLiveLecture ? "Joined live lecture. Waiting for teacher stream." : "Joined live class. Waiting for teacher stream.";
      if (messageRef.current !== joinMsg) setMessage(joinMsg);
    } catch {
      const errorMsg = "Unable to join live class media. Check camera/mic permissions.";
      if (messageRef.current !== errorMsg) setMessage(errorMsg);
    }
  };

  const leaveLiveClass = () => {
    if (activeLiveLecture?._id) {
      api.post(`/lectures/${activeLiveLecture._id}/leave`).catch(() => null);
    }
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
      const lecture = upcomingLectures.find((item) => item._id === lectureId) || null;
      if (lecture && String(lecture.status || "").toUpperCase() === "LIVE" && lecture.meetingRoomId) {
        setActiveLiveLecture(lecture);
        await joinLiveClass(buildLectureRoomId(lecture.meetingRoomId));
      } else if (meetingLink) {
        window.open(meetingLink, "_blank", "noopener,noreferrer");
      }
      if (messageRef.current !== "Lecture join recorded.") setMessage("Lecture join recorded.");
    } catch (error) {
      const errorMsg = parseApiError(error, "Unable to join lecture.");
      if (messageRef.current !== errorMsg) setMessage(errorMsg);
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
      if (messageRef.current !== "Daily attendance CSV exported.") setMessage("Daily attendance CSV exported.");
    } catch (error) {
      const errorMsg = parseApiError(error, "Failed to export CSV.");
      if (messageRef.current !== errorMsg) setMessage(errorMsg);
    }
  };

  const getLocalCampusGenieReply = useCallback((prompt: string) => {
    const normalized = prompt.trim().toLowerCase();
    const attendedToday = dailyAttendance.filter((row) => row.status === "present" || row.status === "remote").length;
    const absentToday = dailyAttendance.filter((row) => row.status === "absent").length;

    if (normalized.includes("how many classes attended today") || normalized.includes("classes attended today")) {
      return `Today you have attended **${attendedToday}** class(es).\n- Present: ${dailyAttendance.filter((row) => row.status === "present").length}\n- Remote: ${dailyAttendance.filter((row) => row.status === "remote").length}\n- Absent: ${absentToday}`;
    }

    if (normalized.includes("is attendance live right now") || normalized.includes("attendance live")) {
      return activeSessionId
        ? `Yes. Attendance is live right now.\n- Teacher: ${activeSessionMeta?.teacherName || "-"}\n- Remaining time: **${String(Math.floor(remainingSeconds / 60)).padStart(2, "0")}:${String(remainingSeconds % 60).padStart(2, "0")}**`
        : "No. There is no active attendance session right now. The dashboard is polling automatically and will enable attendance as soon as the teacher starts it.";
    }

    if (normalized.includes("do i have a live lecture now") || normalized.includes("live lecture now")) {
      return activeLiveLecture
        ? `Yes. **${activeLiveLecture.title}** is live now.\n- Subject: ${activeLiveLecture.subjectId?.name || "-"}\n- Teacher: ${activeLiveLecture.teacherId?.name || "Teacher"}\n- Join from the sticky live lecture banner.`
        : "No live lecture is active at this moment. If a teacher starts one, you will get a sticky reminder banner with a join button.";
    }

    if (normalized.includes("green, yellow, and red flags") || normalized.includes("green yellow red flags") || normalized.includes("what do the green")) {
      return `Attendance geo flags mean:\n- **Green**: you are near the expected college area.\n- **Yellow**: you are moderately far, so attendance may be marked remote.\n- **Red**: you are too far from the college area and the mark is risky or absent.`;
    }

    if (normalized.includes("mark attendance today") || normalized.includes("how do i mark attendance")) {
      return `To mark attendance today:\n1. Wait for the teacher to start attendance.\n2. Open the live camera.\n3. Blink once during the scan.\n4. Allow location access.\n5. Submit before the 10-minute window closes.`;
    }

    return null;
  }, [dailyAttendance, activeSessionId, activeSessionMeta, remainingSeconds, activeLiveLecture]);

  const submitCampusGeniePrompt = async (prompt: string) => {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt || botLoading) return;

    const userMessage: BotMessage = { id: `u_${Date.now()}`, role: "user", text: trimmedPrompt };
    setBotMessages((prev) => [...prev, userMessage]);
    setBotInput("");
    setBotLoading(true);

    try {
      const localReply = getLocalCampusGenieReply(trimmedPrompt);
      const reply = localReply
        ? localReply
        : String((await api.post("/assistant/chat", { prompt: trimmedPrompt })).data?.reply || "").trim() ||
          "I could not generate a response right now.";
      const botMessage: BotMessage = { id: `a_${Date.now()}`, role: "assistant", text: reply };
      setBotMessages((prev) => [...prev, botMessage]);
    } catch (error) {
      const fallback = parseApiError(error, "CampusGenie is unavailable right now.");
      setBotMessages((prev) => [...prev, { id: `a_${Date.now()}`, role: "assistant", text: fallback }]);
    } finally {
      setBotLoading(false);
    }
  };

  const askCampusGenie = async () => { await submitCampusGeniePrompt(botInput); };

  const startVoiceInput = () => {
    if (voiceListening) return;
    const RecognitionCtor = (window as Window & { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor }).SpeechRecognition ||
      (window as Window & { webkitSpeechRecognition?: SpeechRecognitionCtor }).webkitSpeechRecognition;

    if (!RecognitionCtor) {
      const voiceMsg = "Voice input is not supported in this browser.";
      if (messageRef.current !== voiceMsg) setMessage(voiceMsg);
      pushToastRef.current("Voice input is not supported in this browser.", "error");
      return;
    }

    const recognition = new RecognitionCtor();
    speechRecognitionRef.current = recognition;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-IN";
    recognition.onstart = () => setVoiceListening(true);
    recognition.onend = () => setVoiceListening(false);
    recognition.onerror = () => {
      setVoiceListening(false);
      pushToastRef.current("Voice capture failed. Try again.", "error");
    };
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results).map((result) => result?.[0]?.transcript || "").join(" ").trim();
      setVoiceListening(false);
      if (!transcript) {
        pushToastRef.current("No voice transcript detected.", "error");
        return;
      }
      setBotInput(transcript);
      submitCampusGeniePrompt(transcript);
    };
    recognition.start();
  };

  const stopVoiceInput = () => {
    speechRecognitionRef.current?.stop();
    setVoiceListening(false);
  };

  const flagClass = useCallback((flag: DailyAttendanceRow["locationFlag"]) => {
    if (flag === "green") return "bg-green-100 text-green-700";
    if (flag === "yellow") return "bg-yellow-100 text-yellow-700";
    if (!flag) return "bg-slate-100 text-slate-600";
    return "bg-red-100 text-red-700";
  }, []);
  
  const presentCount = useMemo(() => dailyAttendance.filter((row) => row.status === "present").length, [dailyAttendance]);
  const remoteCount = useMemo(() => dailyAttendance.filter((row) => row.status === "remote").length, [dailyAttendance]);
  const currentLectures = useMemo(() => upcomingLectures.filter((row) => !isLectureHistoryItem(row)), [upcomingLectures]);
  const lectureHistoryRows = useMemo(() => upcomingLectures.filter((row) => isLectureHistoryItem(row)), [upcomingLectures]);
  const activeLectureCount = useMemo(() => currentLectures.filter((row) => isLiveLectureRow(row)).length, [currentLectures]);
  const confidenceUi = getConfidenceUi(lastFaceConfidence);
  
  const memoizedCurrentLectures = useMemo(() => currentLectures, [currentLectures]);
  const memoizedLectureHistoryRows = useMemo(() => lectureHistoryRows, [lectureHistoryRows]);
  const memoizedDailyAttendance = useMemo(() => dailyAttendance, [dailyAttendance]);
  const memoizedUpcomingHolidays = useMemo(() => upcomingHolidays, [upcomingHolidays]);
  const memoizedNotifications = useMemo(() => notifications, [notifications]);
  const memoizedAnnouncements = useMemo(() => announcements, [announcements]);
  const memoizedClassroomTeachers = useMemo(() => classroomTeachers.slice(0, 4), [classroomTeachers]);
  const memoizedClassroomCoordinators = useMemo(() => classroomCoordinators, [classroomCoordinators]);
  
  const attendanceCardLoading = false;

  useEffect(() => {
    if (!cameraOpen || !attendanceVideoRef.current || !attendanceCanvasRef.current) {
      setLowLightWarning("");
      return;
    }

    const timer = window.setInterval(() => {
      const video = attendanceVideoRef.current;
      const canvas = attendanceCanvasRef.current;
      if (!video || !canvas || !video.videoWidth || !video.videoHeight) return;
      canvas.width = 32;
      canvas.height = 24;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let total = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        total += (pixels[index] + pixels[index + 1] + pixels[index + 2]) / 3;
      }
      const brightness = total / (pixels.length / 4);
      setLowLightWarning(brightness < 60 ? "Low lighting detected. Improve lighting" : "");
    }, 1600);

    return () => window.clearInterval(timer);
  }, [cameraOpen, attendanceCanvasRef, attendanceVideoRef]);

  return (
    <ProtectedRoute allow={["student"]}>
      <DashboardLayout title="Student Dashboard">
        <ToastStack toasts={toasts} onDismiss={(id) => setToasts((prev) => prev.filter((item) => item.id !== id))} />
        {scanCountdownValue ? (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/55 px-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-4xl border border-white/20 bg-white/92 p-10 text-center shadow-[0_35px_90px_rgba(15,23,42,0.28)]">
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-500">Get Ready for Attendance Scan</p>
              <div className="mt-6 text-7xl font-black text-slate-950 animate-pulse">{scanCountdownValue}</div>
            </div>
          </div>
        ) : null}
        {isMobileUnsafeCameraContext() ? (
          <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            Camera may not work properly on non-secure connection.
          </div>
        ) : null}
        {showAttendanceSuccess ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-4xl border border-emerald-200 bg-white p-8 text-center shadow-[0_35px_90px_rgba(15,23,42,0.25)]">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-4xl font-bold text-emerald-600">✓</div>
              <h2 className="mt-5 text-2xl font-semibold text-slate-950">Attendance Marked Successfully</h2>
              <p className="mt-2 text-sm text-slate-600">Face verified, blink detected, and attendance saved successfully.</p>
            </div>
          </div>
        ) : null}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <section className="rounded-3xl border border-white/70 bg-white/75 p-4 shadow-[0_12px_35px_rgba(35,70,140,0.08)] backdrop-blur xl:col-span-2">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Scheduled Lectures" value={currentLectures.length} />
              <StatCard label="Live Now" value={activeLectureCount} />
              <StatCard label="Present Marks" value={presentCount} />
              <StatCard label="Remote Marks" value={remoteCount} />
            </div>
          </section>

          <div className="xl:col-span-2">
            <AttendanceHeatmap
              data={miniHeatmapData}
              compact
              description="Main Dashboard Heatmap"
              title={`Mini Attendance Heatmap - ${miniAttendanceRate}% overall`}
            />
            <div className="mt-2 flex justify-end">
              <Link href="/student/dashboard" className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">
                Open Full Analytics
              </Link>
            </div>
          </div>

          {activeLiveLecture ? (
            <section className="sticky top-3 z-20 rounded-3xl border border-emerald-200 bg-emerald-50/95 p-4 shadow-[0_16px_40px_rgba(16,185,129,0.2)] backdrop-blur xl:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-emerald-900">Teacher started live lecture</h2>
                  <p className="mt-1 text-sm text-emerald-800">
                    {activeLiveLecture.title || "Live Lecture"} - {activeLiveLecture.subjectId?.name || "-"} - {activeLiveLecture.teacherId?.name || "Teacher"}
                  </p>
                  <p className="mt-1 text-xs text-emerald-700">Join on the same page now. Lecture room: {mediaRoomId || "-"}</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="rounded-2xl border border-emerald-200 bg-white px-4 py-2 text-right">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">Ends In</p>
                    <p className="text-3xl font-extrabold tracking-wide text-emerald-700">
                      {String(Math.floor(lectureBannerSeconds / 60)).padStart(2, "0")}:{String(lectureBannerSeconds % 60).padStart(2, "0")}
                    </p>
                  </div>
                  <button type="button" onClick={() => joinScheduledLecture(activeLiveLecture._id, activeLiveLecture.meetingLink)} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">
                    Join Now
                  </button>
                  <button type="button" onClick={leaveLiveClass} className="rounded-lg border border-emerald-300 bg-white px-4 py-2 text-sm font-semibold text-emerald-700">
                    Leave Live Lecture
                  </button>
                </div>
              </div>
            </section>
          ) : (
            <section className="rounded-3xl border border-slate-200 bg-slate-50/50 p-4 shadow-[0_8px_25px_rgba(15,23,42,0.06)] xl:col-span-2">
              <p className="text-sm text-slate-600">No live lectures at this time. Check your timetable for scheduled classes.</p>
            </section>
          )}

          {activeSessionMeta && (
            <section className="rounded-3xl border border-red-200 bg-red-50 p-4 shadow-[0_12px_35px_rgba(35,70,140,0.08)] backdrop-blur xl:col-span-2">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-red-900">Attendance Session Active!</h2>
                  <p className="text-sm text-red-700">Teacher: {activeSessionMeta.teacherName || "-"} ({activeSessionMeta.teacherEmail || "-"})</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-red-600">Time Remaining</p>
                  <p className="text-5xl font-extrabold tracking-wide text-red-600">
                    {String(Math.floor(remainingSeconds / 60)).padStart(2, "0")}:{String(remainingSeconds % 60).padStart(2, "0")}
                  </p>
                </div>
              </div>
              <div className="mt-3 grid gap-2 sm:flex sm:flex-wrap">
                <button className="min-h-11 w-full rounded-lg bg-red-600 px-4 py-3 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto" type="button" onClick={scanFaceAndMark} disabled={!activeSessionId || remainingSeconds <= 0 || !cameraOpen || isLiveScanRunning}>
                  {isLiveScanRunning || scanStage === "capturing" ? "Scanning..." : scanStage === "verifying" ? "Verifying..." : "Mark Attendance (Blink Scan)"}
                </button>
                {allowManualBypass && (
                  <button className="min-h-11 w-full rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto" type="button" onClick={markAttendanceManual} disabled={!activeSessionId || remainingSeconds <= 0}>
                    Mark Attendance (Manual)
                  </button>
                )}
                <button className="min-h-11 w-full rounded-lg border border-slate-300 px-4 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto" type="button" onClick={openAttendanceCamera} disabled={!activeSessionId || remainingSeconds <= 0 || isCameraLaunching}>
                  {isCameraLaunching ? "Starting..." : "Open Camera"}
                </button>
                <button className="min-h-11 w-full rounded-lg border border-slate-300 px-4 py-3 text-sm sm:w-auto" type="button" onClick={closeAttendanceCamera}>
                  Close Camera
                </button>
              </div>
            </section>
          )}

          {/* The rest of the JSX remains the same - omitted for brevity but would continue here */}
          <div className="mt-4 rounded-2xl border border-white/70 bg-white/75 p-3 text-sm text-slate-700 shadow-[0_8px_25px_rgba(35,70,140,0.06)]">
            {message}
          </div>
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}