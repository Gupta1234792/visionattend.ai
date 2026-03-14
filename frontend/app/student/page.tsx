"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
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

type Subject = { _id: string; name: string; code: string };
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
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [activeSessionId, setActiveSessionId] = useState("");
  const [activeSessionMeta, setActiveSessionMeta] =
    useState<ActiveSessionMeta | null>(null);
  const [history, setHistory] = useState<AttendanceHistoryRow[]>([]);
  const [upcomingLectures, setUpcomingLectures] = useState<BatchLecture[]>([]);
  const [activeLiveLecture, setActiveLiveLecture] = useState<BatchLecture | null>(null);
  const [upcomingHolidays, setUpcomingHolidays] = useState<BatchHoliday[]>([]);
  const [dailyAttendance, setDailyAttendance] = useState<DailyAttendanceRow[]>(
    [],
  );
  const [classroomTeachers, setClassroomTeachers] = useState<
    ClassroomTeacher[]
  >([]);
  const [classroomCoordinators, setClassroomCoordinators] = useState<
    ClassroomCoordinator[]
  >([]);
  const [classroomBatchInfo, setClassroomBatchInfo] =
    useState<ClassroomBatchInfo | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [faceHint, setFaceHint] = useState("");
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

  const [isPolling, setIsPolling] = useState(false);

  const attendanceVideoRef = useRef<HTMLVideoElement | null>(null);
  const attendanceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const attendanceStreamRef = useRef<MediaStream | null>(null);
  const activeSessionIdRef = useRef("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [isLiveScanRunning, setIsLiveScanRunning] = useState(false);

  const [liveClassActive, setLiveClassActive] = useState(false);
  const [remoteStreams, setRemoteStreams] = useState<
    Array<{ socketId: string; stream: MediaStream }>
  >([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const botScrollRef = useRef<HTMLDivElement | null>(null);
  const speechRecognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const liveLectureAlertedRef = useRef("");

  const parseApiError = (error: unknown, fallback: string) => {
    const maybeMessage = (
      error as { response?: { data?: { message?: string } } }
    )?.response?.data?.message;
    const localMessage = (error as { message?: string })?.message;
    return maybeMessage || localMessage || fallback;
  };
  const pushToast = (
    text: string,
    type: "success" | "error" | "info" = "info",
  ) => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 3200);
  };
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
      const AudioContextCtor =
        window.AudioContext ||
        (
          window as Window & {
            webkitAudioContext?: typeof AudioContext;
          }
        ).webkitAudioContext;
      if (!AudioContextCtor) return;

      const context = new AudioContextCtor();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(880, context.currentTime);
      oscillator.frequency.setValueAtTime(660, context.currentTime + 0.2);
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        context.currentTime + 0.45,
      );
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

  const batchKey =
    user?.department && user?.year && user?.division
      ? buildBatchKey(user.department, user.year, user.division)
      : "";
  const liveRoomId = batchKey ? buildBatchRoomId(batchKey) : "";
  const lectureRoomId = activeLiveLecture?.meetingRoomId
    ? buildLectureRoomId(activeLiveLecture.meetingRoomId)
    : "";
  const mediaRoomId = lectureRoomId || liveRoomId;

  const addRemoteStream = (peerSocketId: string, stream: MediaStream) => {
    setRemoteStreams((prev) => {
      const exists = prev.find((item) => item.socketId === peerSocketId);
      if (exists) {
        return prev.map((item) =>
          item.socketId === peerSocketId
            ? { socketId: peerSocketId, stream }
            : item,
        );
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
    setRemoteStreams((prev) =>
      prev.filter((item) => item.socketId !== peerSocketId),
    );
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
      const res = await api.get(`/chat/room/${liveRoomId}`);
      const historyRows = (res.data?.messages || []).map(
        (item: {
          message: string;
          sender?: { name?: string; role?: string; _id?: string };
          createdAt?: string;
        }) => ({
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
  };

  const loadBatchLectures = async () => {
    if (!batchKey) return;
    try {
      const res = await api.get(`/lectures/batch/${batchKey}`);
      const lectures = res.data?.lectures || [];
      setUpcomingLectures(lectures);
      const liveLecture =
        lectures.find(
          (lecture: BatchLecture) =>
            String(lecture.status || "").toUpperCase() === "LIVE",
        ) || null;
      setActiveLiveLecture(liveLecture);
    } catch (error) {
      setUpcomingLectures([]);
      setActiveLiveLecture(null);
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

  const loadMiniAnalytics = async () => {
    try {
      const res = await api.get("/student/analytics");
      setMiniHeatmapData(res.data?.heatmapData || []);
      setMiniAttendanceRate(Number(res.data?.overallAttendance || 0));
    } catch {
      setMiniHeatmapData([]);
      setMiniAttendanceRate(0);
    }
  };

  const clearActiveSession = (nextMessage?: string) => {
    activeSessionIdRef.current = "";
    setActiveSessionId("");
    setActiveSessionMeta(null);
    setRemainingSeconds(0);
    if (nextMessage) {
      setMessage(nextMessage);
    }
  };

  const pollActiveSession = async () => {
    try {
      const res = await api.get("/attendance/active-class");
      const session = res.data?.session;
      const nextRemainingSeconds = Number(res.data?.remainingSeconds || 0);

      if (!session?._id) {
        clearActiveSession("No active attendance session.");
        return;
      }

      if (session._id !== activeSessionIdRef.current) {
        activeSessionIdRef.current = session._id;
        setActiveSessionId(session._id);
        setActiveSessionMeta({
          teacherName: session.teacher?.name,
          teacherEmail: session.teacher?.email,
          remainingSeconds: nextRemainingSeconds,
        });
        setRemainingSeconds(nextRemainingSeconds);
        setMessage("Attendance session started for your batch!");
        pushToast("Attendance session started!", "success");
      } else {
        setRemainingSeconds(nextRemainingSeconds);
        setActiveSessionMeta((current) =>
          current
            ? {
                ...current,
                teacherName: session.teacher?.name,
                teacherEmail: session.teacher?.email,
                remainingSeconds: nextRemainingSeconds,
              }
            : {
                teacherName: session.teacher?.name,
                teacherEmail: session.teacher?.email,
                remainingSeconds: nextRemainingSeconds,
              },
        );
      }
    } catch (error) {
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (status === 404 || status === 403) {
        clearActiveSession("No active attendance session.");
        return;
      }
      console.log("Polling failed:", error);
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
      void loadMiniAnalytics();
      setIsPolling(true);
    }, 0);
    return () => {
      clearTimeout(timer);
      setIsPolling(false);
      clearActiveSession();
    };
  }, [liveRoomId]);
  /* eslint-enable react-hooks/exhaustive-deps */

  useEffect(() => {
    if (!batchKey) return;
    setIsPolling(true);
    void pollActiveSession();
    const interval = window.setInterval(() => {
      void pollActiveSession();
    }, 3000);

    return () => {
      window.clearInterval(interval);
      setIsPolling(false);
    };
  }, [batchKey]);

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
      void loadMiniAnalytics();
    }, 30000);
    return () => clearInterval(interval);
  }, [batchKey]);
  /* eslint-enable react-hooks/exhaustive-deps */

  // NEW: Timer countdown for active session
  useEffect(() => {
    if (!activeSessionId) return;
    const timer = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [activeSessionId]);

  useEffect(() => {
    if (!botScrollRef.current) return;
    botScrollRef.current.scrollTop = botScrollRef.current.scrollHeight;
  }, [botMessages, botLoading]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const ctor = (
      window as Window & {
        SpeechRecognition?: SpeechRecognitionCtor;
        webkitSpeechRecognition?: SpeechRecognitionCtor;
      }
    ).SpeechRecognition ||
      (
        window as Window & {
          webkitSpeechRecognition?: SpeechRecognitionCtor;
        }
      ).webkitSpeechRecognition;
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
      const endsAtMs =
        startedAtMs + Number(activeLiveLecture.durationMinutes || 0) * 60 * 1000;
      setLectureBannerSeconds(Math.max(0, Math.floor((endsAtMs - Date.now()) / 1000)));
    };

    updateLectureCountdown();
    const timer = window.setInterval(updateLectureCountdown, 1000);
    return () => window.clearInterval(timer);
  }, [
    activeLiveLecture?._id,
    activeLiveLecture?.startedAt,
    activeLiveLecture?.scheduledAt,
    activeLiveLecture?.durationMinutes,
  ]);

  useEffect(() => {
    if (!activeLiveLecture?._id) return;
    if (liveLectureAlertedRef.current === activeLiveLecture._id) return;
    liveLectureAlertedRef.current = activeLiveLecture._id;
    playLiveLectureAlert();
    speakText(
      `${activeLiveLecture.teacherId?.name || "Teacher"} started live lecture. Join now.`,
    );
  }, [activeLiveLecture?._id]);

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    if (!token || !user?.college) return;

    const socket = connectCollegeSocket(token, user.college);
    socketRef.current = socket;

    socket.on("connect", () => {
      if (liveRoomId) socket.emit("join-room", { roomId: liveRoomId });
      if (mediaRoomId) socket.emit("join-room", { roomId: mediaRoomId });
    });

    socket.on("chat-message", (payload: Announcement) => {
      if (payload?.roomId && payload.roomId !== liveRoomId) return;
      setAnnouncements((prev) => [...prev, payload]);
      pushToast("New lecture announcement received.", "info");
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
      if (payload?.sessionId) {
        activeSessionIdRef.current = payload.sessionId;
        setActiveSessionId(payload.sessionId);
        const remaining = payload?.endTime
          ? Math.max(
              0,
              Math.floor((new Date(payload.endTime).getTime() - Date.now()) / 1000),
            )
          : 10 * 60;
        setRemainingSeconds(remaining);
        setActiveSessionMeta({
          teacherName: payload?.teacherName || "",
          teacherEmail: payload?.teacherEmail || "",
          remainingSeconds: remaining,
        });
      }
      setMessage("Attendance session started for your batch.");
      void loadDailyAttendance();
      void pollActiveSession();
      pushToast("Attendance session is live now.", "success");
    });

    socket.on("ATTENDANCE_MARKED", () => {
      void loadDailyAttendance();
      void loadHistory();
    });

    socket.on("ATTENDANCE_SESSION_CLOSED", () => {
      void loadDailyAttendance();
      clearActiveSession("Attendance session closed.");
    });

    socket.on("LECTURE_STARTED", () => {
      void loadBatchLectures();
      void loadNotifications();
      pushToast("Teacher started live lecture. Join now.", "success");
    });

    socket.on("LECTURE_ENDED", () => {
      void loadBatchLectures();
      void loadNotifications();
      leaveLiveClass();
      setActiveLiveLecture(null);
      pushToast("Live lecture ended.", "info");
    });

    socket.on(
      "room-peer-left",
      ({
        roomId,
        socketId: peerSocketId,
      }: {
        roomId: string;
        socketId: string;
      }) => {
        if (roomId !== mediaRoomId) return;
        closePeer(peerSocketId);
      },
    );

    socket.on(
      "webrtc-ready",
      async ({ roomId, from }: { roomId: string; from: string }) => {
        if (
          !liveClassActive ||
          roomId !== mediaRoomId ||
          !from ||
          from === socket.id
        )
          return;
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
      },
    );

    socket.on(
      "webrtc-signal",
      async ({
        roomId,
        from,
        signal,
      }: {
        roomId: string;
        from: string;
        signal: {
          type: string;
          sdp?: RTCSessionDescriptionInit;
          candidate?: RTCIceCandidateInit;
        };
      }) => {
        if (
          !liveClassActive ||
          roomId !== mediaRoomId ||
          !from ||
          from === socket.id
        )
          return;

        try {
          const pc = createPeer(from, roomId);

          if (signal.type === "offer" && signal.sdp) {
            await pc.setRemoteDescription(
              new RTCSessionDescription(signal.sdp),
            );
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
            await pc.setRemoteDescription(
              new RTCSessionDescription(signal.sdp),
            );
            return;
          }

          if (signal.type === "ice-candidate" && signal.candidate) {
            await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
          }
        } catch {
          setMessage("Realtime connection sync failed.");
        }
      },
    );

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, user?.college, liveRoomId, mediaRoomId, liveClassActive]);
  /* eslint-enable react-hooks/exhaustive-deps */

  const openAttendanceCamera = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setMessage("Camera API not available on this device/browser.");
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "user" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      attendanceStreamRef.current = stream;
      if (attendanceVideoRef.current)
        attendanceVideoRef.current.srcObject = stream;
      setCameraOpen(true);
    } catch (error) {
      const name = (error as { name?: string })?.name || "";
      if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        setMessage("Live camera stream not found on this device.");
        return;
      }
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setMessage(
          "Camera permission denied. Allow camera access in browser settings.",
        );
        return;
      }
      if (name === "NotReadableError" || name === "TrackStartError") {
        setMessage("Camera is busy in another app. Close that app and retry.");
        return;
      }
      if (typeof window !== "undefined" && !window.isSecureContext) {
        setMessage(
          "Live camera may be blocked on HTTP mobile URL. Run the app on HTTPS.",
        );
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

  const wait = (ms: number) =>
    new Promise((resolve) => {
      window.setTimeout(resolve, ms);
    });

  const captureLiveBlinkFrames = async () => {
    const frames: string[] = [];
    setIsLiveScanRunning(true);
    setMessage("Blink once now. Capturing live frames...");

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
      setMessage(
        `Location locked (${Math.round(location.accuracy)}m accuracy via ${location.source}).`,
      );
      return {
        latitude: location.latitude,
        longitude: location.longitude,
      };
    } catch (error) {
      if (allowManualBypass) {
        const fallback = await getCollegeFallbackLocation();
        if (fallback) {
          setMessage(
            "Live location blocked on this mobile URL. Using college location for dev test.",
          );
          return fallback;
        }
      }

      const details = formatGeolocationError(error);
      throw new Error(details.friendly);
    }
  };

  // REMOVED: findActiveSession function - replaced with automatic polling

  const scanFaceAndMark = async () => {
    if (!activeSessionId) {
      setMessage(
        "No active attendance session. Waiting for teacher to start...",
      );
      return;
    }

    try {
      if (!cameraOpen) {
        setMessage("Open live camera first, then blink once to scan.");
        return;
      }
      const frames = await captureLiveBlinkFrames();
      if (frames.length < 6) {
        setMessage("Live frame capture failed. Keep camera open and retry.");
        return;
      }
      const location = await getLocation();
      const authToken =
        token ||
        (typeof window !== "undefined"
          ? localStorage.getItem("va_token") ||
            localStorage.getItem("token") ||
            ""
          : "");
      if (!authToken) {
        setMessage("Session expired. Please login again.");
        return;
      }

      await api.post(
        "/attendance/scan-face-class",
        {
          sessionId: activeSessionId,
          latitude: location.latitude,
          longitude: location.longitude,
          frames,
        },
        {
          headers: { Authorization: `Bearer ${authToken}` },
        },
      );

      setMessage("Attendance marked via face scan!");
      pushToast("Attendance marked via face scan.", "success");
      setFaceHint("");
      closeAttendanceCamera();
      void loadHistory();
      void loadDailyAttendance();
      clearActiveSession("Attendance marked via face scan!");
    } catch (error) {
      const msg = parseApiError(
        error,
        "Attendance failed: face/location validation failed.",
      );
      setMessage(msg);
      pushToast(msg, "error");
      if (
        msg.toLowerCase().includes("opencv") ||
        msg.toLowerCase().includes("service")
      ) {
        setFaceHint(
          "OpenCV service unreachable. Please retry in a few moments or contact admin.",
        );
      } else if (
        msg.toLowerCase().includes("confidence") ||
        msg.toLowerCase().includes("not recognized") ||
        msg.toLowerCase().includes("blink")
      ) {
        setFaceHint(
          "Keep face centered, improve lighting, and blink once during the live scan.",
        );
      } else if (msg.toLowerCase().includes("permission")) {
        setFaceHint(
          "Camera/Location permission blocked. Enable permissions in browser settings.",
        );
      } else {
        setFaceHint("");
      }
    }
  };

  const markAttendanceManual = async () => {
    if (!activeSessionId) {
      setMessage(
        "No active attendance session. Waiting for teacher to start...",
      );
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
      const flag = String(
        res.data?.attendance?.locationFlag || "",
      ).toLowerCase();
      if (status === "present") {
        setMessage("Attendance marked manually. Status: Present (Green).");
        pushToast("Attendance marked successfully.", "success");
      } else if (status === "remote") {
        setMessage("Attendance marked manually. Status: Remote (Yellow).");
        pushToast("Attendance marked as Remote (Yellow).", "info");
      } else {
        setMessage(
          "Attendance marked manually, but status is Absent (Red) because your location is far from college.",
        );
        pushToast(
          "Marked, but flagged RED due to college-distance rule.",
          "error",
        );
      }
      if (flag === "red") {
        const dist = Number(res.data?.attendance?.distanceMeters);
        if (Number.isFinite(dist)) {
          setFaceHint(
            `Your college distance was ${Math.round(dist)} m. Red flag is expected for far distance.`,
          );
        }
      }
      void loadDailyAttendance();
      void loadHistory();
      clearActiveSession("Attendance marked successfully.");
    } catch (error) {
      const errMsg = parseApiError(error, "Manual attendance failed.");
      setMessage(errMsg);
      pushToast(errMsg, "error");
    }
  };

  const joinLiveClass = async (roomIdOverride?: string) => {
    const roomId = roomIdOverride || mediaRoomId;
    if (!roomId) {
      setMessage("Classroom context missing.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;

      if (socketRef.current) {
        socketRef.current.emit("join-room", { roomId });
        socketRef.current.emit("webrtc-ready", { roomId });
      }

      setLiveClassActive(true);
      setMessage(roomIdOverride || activeLiveLecture ? "Joined live lecture. Waiting for teacher stream." : "Joined live class. Waiting for teacher stream.");
    } catch {
      setMessage(
        "Unable to join live class media. Check camera/mic permissions.",
      );
    }
  };

  const leaveLiveClass = () => {
    if (activeLiveLecture?._id) {
      void api.post(`/lectures/${activeLiveLecture._id}/leave`).catch(() => null);
    }
    peersRef.current.forEach((_, peerSocketId) => closePeer(peerSocketId));
    setRemoteStreams([]);

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    setLiveClassActive(false);
  };

  const joinScheduledLecture = async (
    lectureId: string,
    fallbackLink?: string,
  ) => {
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
      setMessage("Lecture join recorded.");
    } catch (error) {
      setMessage(parseApiError(error, "Unable to join lecture."));
    }
  };

  const exportDailyAttendanceCsv = async () => {
    try {
      const res = await api.get("/reports/student/daily/csv", {
        responseType: "blob",
      });
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

  const getLocalCampusGenieReply = (prompt: string) => {
    const normalized = prompt.trim().toLowerCase();
    const attendedToday = dailyAttendance.filter(
      (row) => row.status === "present" || row.status === "remote",
    ).length;
    const absentToday = dailyAttendance.filter(
      (row) => row.status === "absent",
    ).length;

    if (
      normalized.includes("how many classes attended today") ||
      normalized.includes("classes attended today")
    ) {
      return `Today you have attended **${attendedToday}** class(es).\n- Present: ${dailyAttendance.filter((row) => row.status === "present").length}\n- Remote: ${dailyAttendance.filter((row) => row.status === "remote").length}\n- Absent: ${absentToday}`;
    }

    if (
      normalized.includes("is attendance live right now") ||
      normalized.includes("attendance live")
    ) {
      return activeSessionId
        ? `Yes. Attendance is live right now.\n- Teacher: ${activeSessionMeta?.teacherName || "-"}\n- Remaining time: **${String(Math.floor(remainingSeconds / 60)).padStart(2, "0")}:${String(remainingSeconds % 60).padStart(2, "0")}**`
        : "No. There is no active attendance session right now. The dashboard is polling automatically and will enable attendance as soon as the teacher starts it.";
    }

    if (
      normalized.includes("do i have a live lecture now") ||
      normalized.includes("live lecture now")
    ) {
      return activeLiveLecture
        ? `Yes. **${activeLiveLecture.title}** is live now.\n- Subject: ${activeLiveLecture.subjectId?.name || "-"}\n- Teacher: ${activeLiveLecture.teacherId?.name || "Teacher"}\n- Join from the sticky live lecture banner.`
        : "No live lecture is active at this moment. If a teacher starts one, you will get a sticky reminder banner with a join button.";
    }

    if (
      normalized.includes("green, yellow, and red flags") ||
      normalized.includes("green yellow red flags") ||
      normalized.includes("what do the green")
    ) {
      return `Attendance geo flags mean:\n- **Green**: you are near the expected college area.\n- **Yellow**: you are moderately far, so attendance may be marked remote.\n- **Red**: you are too far from the college area and the mark is risky or absent.`;
    }

    if (
      normalized.includes("mark attendance today") ||
      normalized.includes("how do i mark attendance")
    ) {
      return `To mark attendance today:\n1. Wait for the teacher to start attendance.\n2. Open the live camera.\n3. Blink once during the scan.\n4. Allow location access.\n5. Submit before the 10-minute window closes.`;
    }

    return null;
  };

  const submitCampusGeniePrompt = async (prompt: string) => {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt || botLoading) return;

    const userMessage: BotMessage = {
      id: `u_${Date.now()}`,
      role: "user",
      text: trimmedPrompt,
    };
    setBotMessages((prev) => [...prev, userMessage]);
    setBotInput("");
    setBotLoading(true);

    try {
      const localReply = getLocalCampusGenieReply(trimmedPrompt);
      const reply = localReply
        ? localReply
        : String((await api.post("/assistant/chat", { prompt: trimmedPrompt })).data?.reply || "").trim() ||
          "I could not generate a response right now.";
      const botMessage: BotMessage = {
        id: `a_${Date.now()}`,
        role: "assistant",
        text: reply,
      };
      setBotMessages((prev) => [...prev, botMessage]);
    } catch (error) {
      const fallback = parseApiError(
        error,
        "CampusGenie is unavailable right now.",
      );
      setBotMessages((prev) => [
        ...prev,
        {
          id: `a_${Date.now()}`,
          role: "assistant",
          text: fallback,
        },
      ]);
    } finally {
      setBotLoading(false);
    }
  };

  const askCampusGenie = async () => {
    await submitCampusGeniePrompt(botInput);
  };

  const startVoiceInput = () => {
    if (voiceListening) return;
    const RecognitionCtor = (
      window as Window & {
        SpeechRecognition?: SpeechRecognitionCtor;
        webkitSpeechRecognition?: SpeechRecognitionCtor;
      }
    ).SpeechRecognition ||
      (
        window as Window & {
          webkitSpeechRecognition?: SpeechRecognitionCtor;
        }
      ).webkitSpeechRecognition;

    if (!RecognitionCtor) {
      setMessage("Voice input is not supported in this browser.");
      pushToast("Voice input is not supported in this browser.", "error");
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
      pushToast("Voice capture failed. Try again.", "error");
    };
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result?.[0]?.transcript || "")
        .join(" ")
        .trim();
      setVoiceListening(false);
      if (!transcript) {
        pushToast("No voice transcript detected.", "error");
        return;
      }
      setBotInput(transcript);
      void submitCampusGeniePrompt(transcript);
    };
    recognition.start();
  };

  const stopVoiceInput = () => {
    speechRecognitionRef.current?.stop();
    setVoiceListening(false);
  };

  const flagClass = (flag: DailyAttendanceRow["locationFlag"]) => {
    if (flag === "green") return "bg-green-100 text-green-700";
    if (flag === "yellow") return "bg-yellow-100 text-yellow-700";
    if (!flag) return "bg-slate-100 text-slate-600";
    return "bg-red-100 text-red-700";
  };
  const presentCount = dailyAttendance.filter(
    (row) => row.status === "present",
  ).length;
  const remoteCount = dailyAttendance.filter(
    (row) => row.status === "remote",
  ).length;
  const activeLectureCount = upcomingLectures.filter(
    (row) => String(row.status || "").toUpperCase() === "LIVE",
  ).length;

  return (
    <ProtectedRoute allow={["student"]}>
      <DashboardLayout title="Student Dashboard">
        <ToastStack
          toasts={toasts}
          onDismiss={(id) =>
            setToasts((prev) => prev.filter((item) => item.id !== id))
          }
        />
        <div className="grid gap-4 xl:grid-cols-2">
          <section className="rounded-3xl border border-white/70 bg-white/75 p-4 shadow-[0_12px_35px_rgba(35,70,140,0.08)] backdrop-blur xl:col-span-2">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <article className="rounded-2xl border border-white/80 bg-white/85 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  Scheduled Lectures
                </p>
                <p className="mt-1 text-3xl font-semibold text-slate-900">
                  {upcomingLectures.length}
                </p>
              </article>
              <article className="rounded-2xl border border-white/80 bg-white/85 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  Live Now
                </p>
                <p className="mt-1 text-3xl font-semibold text-slate-900">
                  {activeLectureCount}
                </p>
              </article>
              <article className="rounded-2xl border border-white/80 bg-white/85 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  Present Marks
                </p>
                <p className="mt-1 text-3xl font-semibold text-slate-900">
                  {presentCount}
                </p>
              </article>
              <article className="rounded-2xl border border-white/80 bg-white/85 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  Remote Marks
                </p>
                <p className="mt-1 text-3xl font-semibold text-slate-900">
                  {remoteCount}
                </p>
              </article>
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
              <Link
                href="/student/dashboard"
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
              >
                Open Full Analytics
              </Link>
            </div>
          </div>

          {activeLiveLecture ? (
            <section className="sticky top-3 z-20 rounded-3xl border border-emerald-200 bg-emerald-50/95 p-4 shadow-[0_16px_40px_rgba(16,185,129,0.2)] backdrop-blur xl:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-emerald-900">
                    Teacher started live lecture
                  </h2>
                  <p className="mt-1 text-sm text-emerald-800">
                    {activeLiveLecture.title} - {activeLiveLecture.subjectId?.name || "-"} -{" "}
                    {activeLiveLecture.teacherId?.name || "Teacher"}
                  </p>
                  <p className="mt-1 text-xs text-emerald-700">
                    Join on the same page now. Lecture room: {mediaRoomId || "-"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="rounded-2xl border border-emerald-200 bg-white px-4 py-2 text-right">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">
                      Ends In
                    </p>
                    <p className="text-3xl font-extrabold tracking-wide text-emerald-700">
                      {String(Math.floor(lectureBannerSeconds / 60)).padStart(2, "0")}:
                      {String(lectureBannerSeconds % 60).padStart(2, "0")}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      void joinScheduledLecture(
                        activeLiveLecture._id,
                        activeLiveLecture.meetingLink,
                      )
                    }
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
                  >
                    Join Now
                  </button>
                  <button
                    type="button"
                    onClick={leaveLiveClass}
                    className="rounded-lg border border-emerald-300 bg-white px-4 py-2 text-sm font-semibold text-emerald-700"
                  >
                    Leave Live Lecture
                  </button>
                </div>
              </div>
            </section>
          ) : null}

          {/* NEW: Attendance Start Alert Panel */}
          {activeSessionMeta && (
            <section className="rounded-3xl border border-red-200 bg-red-50 p-4 shadow-[0_12px_35px_rgba(35,70,140,0.08)] backdrop-blur xl:col-span-2">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-red-900">
                    Attendance Session Active!
                  </h2>
                  <p className="text-sm text-red-700">
                    Teacher: {activeSessionMeta.teacherName || "-"} (
                    {activeSessionMeta.teacherEmail || "-"})
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-red-600">Time Remaining</p>
                  <p className="text-5xl font-extrabold tracking-wide text-red-600">
                    {String(Math.floor(remainingSeconds / 60)).padStart(2, "0")}
                    :{String(remainingSeconds % 60).padStart(2, "0")}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                  type="button"
                  onClick={scanFaceAndMark}
                  disabled={!activeSessionId || remainingSeconds <= 0 || !cameraOpen || isLiveScanRunning}
                >
                  {isLiveScanRunning ? "Scanning Live..." : "Mark Attendance (Blink Scan)"}
                </button>
                {allowManualBypass && (
                  <button
                    className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                    type="button"
                    onClick={markAttendanceManual}
                    disabled={!activeSessionId || remainingSeconds <= 0}
                  >
                    Mark Attendance (Manual)
                  </button>
                )}
                <button
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                  type="button"
                  onClick={openAttendanceCamera}
                  disabled={!activeSessionId || remainingSeconds <= 0}
                >
                  Open Camera
                </button>
                <button
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
                  type="button"
                  onClick={closeAttendanceCamera}
                >
                  Close Camera
                </button>
              </div>
            </section>
          )}

          <section
            id="scan"
            className="rounded-3xl border border-white/70 bg-white/75 p-4 shadow-[0_12px_35px_rgba(35,70,140,0.08)] backdrop-blur"
          >
            <h2 className="text-base font-semibold">
              Scan Face for Attendance
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Live camera frames + geolocation are sent to backend. Keep face steady and blink once during scan.
            </p>

            {/* REMOVED: Manual "Find Session" button - replaced with automatic polling */}

            {activeSessionMeta ? (
              <div className="mt-3 rounded-lg border border-[#135ed8]/30 bg-[#135ed8]/5 p-3 text-sm text-slate-700">
                <p>
                  <span className="font-semibold">Started by:</span>{" "}
                  {activeSessionMeta.teacherName || "-"} (
                  {activeSessionMeta.teacherEmail || "-"})
                </p>
                <p className="mt-1">
                  <span className="font-semibold">Remaining:</span>{" "}
                  {Math.ceil((activeSessionMeta.remainingSeconds || 0) / 60)}{" "}
                  min
                </p>
                <p className="mt-3 text-center text-6xl font-extrabold tracking-wide text-red-600">
                  {String(Math.floor(remainingSeconds / 60)).padStart(2, "0")}:
                  {String(remainingSeconds % 60).padStart(2, "0")}
                </p>
                <p className="mt-1 text-center text-xs font-semibold uppercase text-red-700">
                  Attendance Window Countdown
                </p>
              </div>
            ) : (
              <div className="mt-3 rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-700">
                <p className="font-semibold">No Active Session</p>
                <p className="mt-1">
                  Waiting for teacher to start attendance. Monitoring
                  automatically...
                </p>
                <p className="mt-2 text-xs text-green-600">
                  Status: {isPolling ? "Monitoring..." : "Stopped"}
                </p>
              </div>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                type="button"
                onClick={openAttendanceCamera}
                disabled={!activeSessionId || remainingSeconds <= 0}
              >
                Open Camera
              </button>
              <button
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                type="button"
                onClick={closeAttendanceCamera}
              >
                Close Camera
              </button>
              <button
                className="rounded-lg bg-[#135ed8] px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                type="button"
                onClick={scanFaceAndMark}
                disabled={!activeSessionId || remainingSeconds <= 0 || !cameraOpen || isLiveScanRunning}
              >
                {isLiveScanRunning ? "Scanning Live..." : "Scan Face + Blink"}
              </button>
              {allowManualBypass ? (
                <button
                  className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
                  type="button"
                  onClick={markAttendanceManual}
                  disabled={!activeSessionId || remainingSeconds <= 0}
                >
                  Mark Attendance (Manual)
                </button>
              ) : null}
            </div>

            {cameraOpen && (
              <video
                ref={attendanceVideoRef}
                autoPlay
                playsInline
                muted
                className="mt-3 w-full rounded-lg border border-slate-200"
              />
            )}
            <canvas ref={attendanceCanvasRef} className="hidden" />
            {faceHint ? (
              <p className="mt-2 text-xs text-amber-700">{faceHint}</p>
            ) : null}
          </section>

          <section className="rounded-3xl border border-white/70 bg-white/75 p-4 shadow-[0_12px_35px_rgba(35,70,140,0.08)] backdrop-blur">
            <h2 className="text-base font-semibold">
              Realtime Class (Audio/Video)
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              {activeLiveLecture
                ? `Join ${activeLiveLecture.title} on the same dashboard.`
                : "Join your batch live class using WebRTC + sockets."}
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                className="rounded-lg bg-[#135ed8] px-3 py-2 text-sm font-semibold text-white"
                type="button"
                onClick={() =>
                  activeLiveLecture
                    ? void joinScheduledLecture(
                        activeLiveLecture._id,
                        activeLiveLecture.meetingLink,
                      )
                    : void joinLiveClass()
                }
              >
                {activeLiveLecture ? "Join Live Lecture" : "Join Live Class"}
              </button>
              <button
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                type="button"
                onClick={leaveLiveClass}
              >
                Leave Live Class
              </button>
            </div>

            <div className="mt-3 grid gap-3">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full rounded-lg border border-slate-200 bg-slate-100"
              />
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

            <p className="mt-2 text-xs text-slate-500">
              Live peers: {remoteStreams.length} | Joined:{" "}
              {liveClassActive ? "Yes" : "No"} | Room: {mediaRoomId || "-"}
            </p>
          </section>

          <section className="rounded-3xl border border-white/70 bg-white/75 p-4 shadow-[0_12px_35px_rgba(35,70,140,0.08)] backdrop-blur xl:col-span-2">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50 p-3">
              <div>
                <p className="text-sm font-semibold text-red-700">
                  Notification Section
                </p>
                <p className="text-xs text-red-700">
                  Teacher announcements show here with unread alert.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-red-600 px-2.5 py-1 text-xs font-semibold text-white">
                  Unread: {unreadNotifications}
                </span>
                <Link
                  href="/notifications"
                  className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700"
                >
                  Open Notification Center
                </Link>
              </div>
            </div>

            {notifications.length > 0 ? (
              <div className="mb-3 space-y-2 rounded-xl border border-red-100 bg-red-50/40 p-3">
                {notifications.map((item, index) => (
                  <div
                    key={`${item._id || "n"}-${index}`}
                    className="rounded-lg border border-red-100 bg-white px-3 py-2"
                  >
                    <p className="text-sm font-semibold text-slate-800">
                      {item.title || "Notification"}
                    </p>
                    <p className="text-sm text-slate-700">
                      {item.message || "-"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {item.createdAt
                        ? new Date(item.createdAt).toLocaleString()
                        : "-"}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}

            <h2 className="text-base font-semibold">
              Teacher Lecture Messages
            </h2>
            <div className="mt-3 max-h-56 space-y-2 overflow-auto rounded-lg border border-slate-200 p-3">
              {announcements.map((item, index) => (
                <div
                  key={`${item.time || "t"}-${index}`}
                  className="rounded-md bg-slate-50 px-3 py-2 text-sm"
                >
                  <p className="text-slate-800">{item.message}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {item.sender?.name || "Teacher"} (
                    {item.sender?.role || "teacher"})
                  </p>
                </div>
              ))}
              {announcements.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No lecture messages yet.
                </p>
              ) : null}
            </div>
          </section>

          <section className="rounded-3xl border border-white/70 bg-white/75 p-4 shadow-[0_12px_35px_rgba(35,70,140,0.08)] backdrop-blur xl:col-span-2">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">
                Upcoming Scheduled Lectures
              </h2>
              <button
                type="button"
                onClick={() => void loadBatchLectures()}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700"
              >
                Refresh
              </button>
            </div>
            <p className="mt-2 text-sm text-slate-600">
              Track lecture time, subject and teacher details. Join directly
              when session time starts.
            </p>
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
                      <td className="py-2">
                        {new Date(lecture.scheduledAt).toLocaleString()}
                      </td>
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
                          disabled={
                            String(lecture.status || "").toUpperCase() ===
                            "CANCELED"
                          }
                          onClick={() =>
                            joinScheduledLecture(
                              lecture._id,
                              lecture.meetingLink,
                            )
                          }
                          className="rounded-lg bg-[#135ed8] px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Join
                        </button>
                      </td>
                    </tr>
                  ))}
                  {upcomingLectures.length === 0 ? (
                    <tr>
                      <td className="py-3 text-slate-500" colSpan={9}>
                        No scheduled lectures found for your batch.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-3xl border border-white/70 bg-white/75 p-4 shadow-[0_12px_35px_rgba(35,70,140,0.08)] backdrop-blur xl:col-span-2">
            <h2 className="text-base font-semibold">Holiday Announcements</h2>
            <p className="mt-2 text-sm text-slate-600">
              Class coordinator/teacher holiday notices for your batch.
            </p>
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
                      <td className="py-2">
                        {new Date(holiday.fromDate).toLocaleDateString()}
                      </td>
                      <td className="py-2">
                        {new Date(holiday.toDate).toLocaleDateString()}
                      </td>
                      <td className="py-2">{holiday.reason}</td>
                    </tr>
                  ))}
                  {upcomingHolidays.length === 0 ? (
                    <tr>
                      <td className="py-3 text-slate-500" colSpan={3}>
                        No holidays announced.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          <section
            id="history"
            className="rounded-3xl border border-white/70 bg-white/75 p-4 shadow-[0_12px_35px_rgba(35,70,140,0.08)] backdrop-blur xl:col-span-2"
          >
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
                      <td className="py-2">
                        {typeof row.percentage === "number"
                          ? `${row.percentage}%`
                          : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-3xl border border-white/70 bg-white/75 p-4 shadow-[0_12px_35px_rgba(35,70,140,0.08)] backdrop-blur xl:col-span-2">
            <h2 className="text-base font-semibold">
              Virtual Classroom Details
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Department, class division, class coordinator and top 4 teacher
              mappings.
            </p>

            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  Department
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  {classroomBatchInfo?.departmentName || "-"}
                </p>
                <p className="text-xs text-slate-600">
                  {classroomBatchInfo?.departmentCode || "-"}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  Class
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  {classroomBatchInfo?.year || user?.year || "-"}-
                  {classroomBatchInfo?.division || user?.division || "-"}
                </p>
                <p className="text-xs text-slate-600">
                  Batch Key: {batchKey || "-"}
                </p>
              </div>
            </div>

            <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50 p-3">
              <p className="text-xs uppercase tracking-wide text-violet-700">
                Class Coordinator
              </p>
              {classroomCoordinators.length > 0 ? (
                classroomCoordinators.map((coordinator) => (
                  <p
                    key={coordinator._id}
                    className="mt-1 text-sm font-semibold text-violet-900"
                  >
                    {coordinator.name} ({coordinator.email})
                  </p>
                ))
              ) : (
                <p className="mt-1 text-sm text-violet-900">
                  Not assigned yet.
                </p>
              )}
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {classroomTeachers.slice(0, 4).map((teacher) => (
                <article
                  key={teacher._id}
                  className="rounded-xl border border-slate-200 p-3"
                >
                  <p className="text-sm font-semibold text-slate-900">
                    {teacher.name || "-"}
                  </p>
                  <p className="text-xs text-slate-600">
                    {teacher.email || "-"}
                  </p>
                  <p className="mt-2 text-xs text-slate-500">
                    Subjects:{" "}
                    {(teacher.subjects || []).length
                      ? teacher.subjects
                          ?.map(
                            (s) =>
                              `${s.name || "-"}${s.code ? ` (${s.code})` : ""}`,
                          )
                          .join(", ")
                      : "No mapped subjects"}
                  </p>
                </article>
              ))}
              {classroomTeachers.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No classroom teachers available.
                </p>
              ) : null}
            </div>
          </section>

          <section className="overflow-hidden rounded-[1.9rem] border border-slate-200 bg-white shadow-[0_20px_50px_rgba(15,23,42,0.08)] xl:col-span-2">
            <div className="border-b border-slate-200 bg-[linear-gradient(135deg,#ffffff,#f3f7ff)] px-4 py-4 sm:px-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-[10px] font-bold text-white">
                      AI
                    </span>
                    CampusGenie
                  </div>
                  <h2 className="mt-3 text-lg font-semibold text-slate-900">
                    Student Assistant
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Ask about attendance, holidays, classes, or the next thing you need to do.
                  </p>
                </div>
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                  Online
                </span>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {quickBotPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => void submitCampusGeniePrompt(prompt)}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>

            <div
              ref={botScrollRef}
              className="max-h-[30rem] space-y-5 overflow-y-auto bg-[#f8fafc] px-4 py-5 sm:px-5"
            >
              {botMessages.map((item) => (
                <div
                  key={item.id}
                  className={`flex gap-3 ${item.role === "assistant" ? "justify-start" : "justify-end"}`}
                >
                  {item.role === "assistant" ? (
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
                      AI
                    </div>
                  ) : null}

                  <div
                    className={`max-w-[92%] rounded-[1.4rem] px-4 py-3 text-sm leading-6 shadow-sm sm:max-w-[78%] ${
                      item.role === "assistant"
                        ? "rounded-tl-md border border-slate-200 bg-white text-slate-800"
                        : "rounded-tr-md bg-slate-900 text-white"
                    }`}
                  >
                    <p
                      className={`mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${
                        item.role === "assistant"
                          ? "text-slate-400"
                          : "text-slate-300"
                      }`}
                    >
                      {item.role === "assistant" ? "CampusGenie" : "You"}
                    </p>
                    <div className="space-y-3">
                      {renderMessageMarkdown(item.text, item.role)}
                    </div>
                  </div>

                  {item.role === "user" ? (
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#135ed8] text-xs font-bold text-white">
                      You
                    </div>
                  ) : null}
                </div>
              ))}

              {botLoading ? (
                <div className="flex gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
                    AI
                  </div>
                  <div className="rounded-[1.4rem] rounded-tl-md border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 shadow-sm">
                    CampusGenie is typing...
                  </div>
                </div>
              ) : null}
            </div>

            <div className="border-t border-slate-200 bg-white px-4 py-4 sm:px-5">
              <div className="rounded-[1.6rem] border border-slate-200 bg-[#fbfcfe] p-2 shadow-inner">
                <textarea
                  rows={3}
                  className="min-h-[92px] w-full resize-none rounded-[1.2rem] border-0 bg-transparent px-3 py-3 text-sm text-slate-800 outline-none placeholder:text-slate-400"
                  placeholder="Message CampusGenie..."
                  value={botInput}
                  onChange={(e) => setBotInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void askCampusGenie();
                    }
                  }}
                />
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-2 pt-2">
                  <p className="text-xs text-slate-500">
                    Press Enter to send, Shift + Enter for a new line.
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={voiceListening ? stopVoiceInput : startVoiceInput}
                      disabled={!voiceSupported}
                      className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {voiceListening
                        ? "Stop Voice"
                        : voiceSupported
                          ? "Voice Input"
                          : "Voice Unsupported"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void askCampusGenie()}
                      disabled={botLoading || !botInput.trim()}
                      className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Send
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-white/70 bg-white/75 p-4 shadow-[0_12px_35px_rgba(35,70,140,0.08)] backdrop-blur xl:col-span-2">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">
                Daily Attendance Detail
              </h2>
              <button
                type="button"
                onClick={exportDailyAttendanceCsv}
                className="rounded-lg bg-[#135ed8] px-3 py-1.5 text-xs font-semibold text-white"
              >
                Export CSV
              </button>
            </div>
            <p className="mt-2 text-sm text-slate-600">
              Green = near college, Yellow = medium distance, Red = far from
              college location (even if session distance is near).
            </p>
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
                    <tr
                      key={row.sessionId}
                      className="border-b border-slate-100"
                    >
                      <td className="py-2">{row.date}</td>
                      <td className="py-2">
                        {row.subject} ({row.subjectCode})
                      </td>
                      <td className="py-2 capitalize">{row.status}</td>
                      <td className="py-2">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-semibold uppercase ${flagClass(row.locationFlag)}`}
                        >
                          {row.locationFlag || "pending"}
                        </span>
                      </td>
                      <td className="py-2">
                        {typeof row.distanceMeters === "number"
                          ? `${Math.round(row.distanceMeters)} m`
                          : "-"}
                      </td>
                      <td className="py-2">
                        {typeof row.gpsDistance === "number"
                          ? `${Math.round(row.gpsDistance)} m`
                          : "-"}
                      </td>
                    </tr>
                  ))}
                  {dailyAttendance.length === 0 ? (
                    <tr>
                      <td className="py-3 text-slate-500" colSpan={6}>
                        No daily attendance rows available.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <div className="mt-4 rounded-2xl border border-white/70 bg-white/75 p-3 text-sm text-slate-700 shadow-[0_8px_25px_rgba(35,70,140,0.06)]">
          {message}
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
