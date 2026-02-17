"use client";

import { useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import api from "@/src/services/api";
import { ProtectedRoute } from "@/src/components/protected-route";
import { DashboardLayout } from "@/src/layouts/dashboard-layout";
import { useAuth } from "@/src/context/auth-context";
import { buildBatchKey, buildBatchRoomId, connectCollegeSocket } from "@/src/services/socket";

type Subject = { _id: string; name: string; code: string };
type YearValue = "FY" | "SY" | "TY" | "FINAL";
type RemoteStream = { socketId: string; stream: MediaStream };
type ScheduledLecture = {
  _id: string;
  title: string;
  scheduledAt: string;
  durationMinutes: number;
  meetingLink?: string;
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

const years: YearValue[] = ["FY", "SY", "TY", "FINAL"];
const divisions = ["A", "B", "C"];

export default function TeacherPage() {
  const { user, token } = useAuth();

  const [message, setMessage] = useState("Teacher workflow ready.");
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [scheduledLectures, setScheduledLectures] = useState<ScheduledLecture[]>([]);
  const [reportRows, setReportRows] = useState<SubjectAttendanceRow[]>([]);
  const [classroomTeachers, setClassroomTeachers] = useState<Array<{ _id: string; name: string; email: string }>>([]);
  const [inviteResult, setInviteResult] = useState<{ inviteLink: string; inviteCode: string } | null>(null);

  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [year, setYear] = useState<YearValue>((user?.year as YearValue) || "FY");
  const [division, setDivision] = useState(user?.division || "A");
  const [lectureForm, setLectureForm] = useState({
    title: "",
    scheduledAtLocal: "",
    durationMinutes: 60,
    subjectId: "",
  });

  const [cameraOpen, setCameraOpen] = useState(false);
  const attendanceVideoRef = useRef<HTMLVideoElement | null>(null);
  const attendanceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const attendanceStreamRef = useRef<MediaStream | null>(null);

  const [liveClassActive, setLiveClassActive] = useState(false);
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

  const batchKey = user?.department ? buildBatchKey(user.department, year, division) : "";
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

  const broadcastReady = () => {
    if (!socketRef.current || !liveRoomId) return;
    socketRef.current.emit("join-room", { roomId: liveRoomId });
    socketRef.current.emit("webrtc-ready", { roomId: liveRoomId });
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
    } catch {
      setClassroomTeachers([]);
    }
  };

  const loadAnnouncements = async () => {
    if (!liveRoomId) return;
    try {
      const res = await api.get(`/chat/${liveRoomId}`);
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
      setScheduledLectures(res.data?.lectures || []);
    } catch {
      setScheduledLectures([]);
    }
  };

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    const timer = setTimeout(() => {
      void loadSubjects();
      void loadClassroom();
      void loadAnnouncements();
      void loadMyLectures();
    }, 0);
    return () => clearTimeout(timer);
  }, [year, division, liveRoomId]);
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
        setMessage("Failed to initiate peer connection.");
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
        setMessage("Realtime media sync failed.");
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
      if (attendanceVideoRef.current) {
        attendanceVideoRef.current.srcObject = stream;
      }
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
      setMessage("Unable to access camera.");
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
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        },
        () => reject(new Error("Location access denied")),
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });

  const startAttendance = async () => {
    if (!selectedSubjectId) {
      setMessage("Select a subject first.");
      return;
    }

    try {
      if (!cameraOpen) {
        setMessage("Open camera first, then start attendance.");
        return;
      }
      const frame = captureFrame();
      const location = await getLocation();

      const res = await api.post("/attendance/start", {
        subjectId: selectedSubjectId,
        year,
        division,
        latitude: location.latitude,
        longitude: location.longitude,
        image: frame,
      });

      setMessage(res.data?.message || "Attendance started.");
      closeAttendanceCamera();
    } catch (error) {
      setMessage(parseApiError(error, "Failed to start attendance session."));
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
    } catch (error) {
      setMessage(parseApiError(error, "Failed to generate invite."));
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
            `Join Link: ${meetingLink || "Will be shared"}`,
          ].join(" | "),
        });
      }

      setLectureForm({ title: "", scheduledAtLocal: "", durationMinutes: 60, subjectId: lectureForm.subjectId });
      setMessage("Lecture scheduled and shared in classroom chat.");
      void loadMyLectures();
    } catch (error) {
      setMessage(parseApiError(error, "Failed to schedule lecture."));
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
    } catch (error) {
      setMessage(parseApiError(error, "Failed to load report."));
    }
  };

  const flagClass = (flag?: "green" | "yellow" | "red") => {
    if (flag === "green") return "bg-green-100 text-green-700";
    if (flag === "yellow") return "bg-yellow-100 text-yellow-700";
    return "bg-red-100 text-red-700";
  };

  const startLiveClass = async () => {
    if (!liveRoomId) {
      setMessage("Department/year/division context missing.");
      return;
    }

    try {
      await openLiveMedia();
      setLiveClassActive(true);
      broadcastReady();
      setMessage("Live class started. Students can join in realtime.");
    } catch (error) {
      const name = (error as { name?: string })?.name || "";
      if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        setMessage("Camera not detected. Please connect a webcam.");
        return;
      }
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setMessage("Camera/Mic permission denied. Allow access in browser settings.");
        return;
      }
      setMessage("Unable to start live class media.");
    }
  };

  const sendAnnouncement = () => {
    if (!socketRef.current || !liveRoomId || !announcementText.trim()) return;
    socketRef.current.emit("chat-message", {
      roomId: liveRoomId,
      message: announcementText.trim(),
    });
    setAnnouncementText("");
  };

  return (
    <ProtectedRoute allow={["teacher"]}>
      <DashboardLayout title="Teacher Dashboard">
        <div className="grid gap-4 xl:grid-cols-2">
          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-base font-semibold">My Subjects</h2>
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              {subjects.map((subject) => (
                <li key={subject._id} className="rounded-lg border border-slate-200 px-3 py-2">
                  {subject.name} ({subject.code})
                </li>
              ))}
            </ul>
          </section>

          <section id="invite" className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-base font-semibold">Virtual Classroom Invite</h2>
            <p className="mt-2 text-sm text-slate-600">Invite students by class year and division.</p>
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
              </div>
            ) : null}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-base font-semibold">Virtual Classroom</h2>
            <p className="mt-2 text-sm text-slate-600">Teachers in this class context ({year}-{division}).</p>
            <ul className="mt-3 space-y-2 text-sm">
              {classroomTeachers.slice(0, 5).map((teacher) => (
                <li key={teacher._id} className="rounded-lg border border-slate-200 px-3 py-2">
                  {teacher.name} ({teacher.email})
                </li>
              ))}
              {classroomTeachers.length === 0 ? (
                <li className="text-slate-500">No teachers found for this classroom.</li>
              ) : null}
            </ul>
          </section>

          <section id="lecture-schedule" className="rounded-2xl border border-slate-200 bg-white p-4">
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
            </div>
            <button className="mt-3 rounded-lg bg-[#135ed8] px-4 py-2 text-sm font-semibold text-white" type="button" onClick={scheduleLecture}>
              Schedule and Share
            </button>
          </section>

          <section id="live-class" className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Realtime Audio/Video Class</h2>
              <span className="text-xs text-slate-500">Socket + WebRTC</span>
            </div>
            <p className="mt-2 text-sm text-slate-600">Batch room: {liveRoomId || "N/A"}</p>

            <div className="mt-3 flex flex-wrap gap-2">
              <button className="rounded-lg bg-[#135ed8] px-3 py-2 text-sm font-semibold text-white" type="button" onClick={startLiveClass}>
                Start Live Class
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

            <p className="mt-2 text-xs text-slate-500">Connected peers: {remoteStreams.length} | Socket: {socketId || "-"}</p>
          </section>

          <section id="teacher-chat" className="rounded-2xl border border-slate-200 bg-white p-4 xl:col-span-2">
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

          <section className="rounded-2xl border border-slate-200 bg-white p-4 xl:col-span-2">
            <h2 className="text-base font-semibold">My Scheduled Lectures</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="py-2">Title</th>
                    <th className="py-2">Subject</th>
                    <th className="py-2">Time</th>
                    <th className="py-2">Duration</th>
                    <th className="py-2">Link</th>
                  </tr>
                </thead>
                <tbody>
                  {scheduledLectures.map((lecture) => (
                    <tr key={lecture._id} className="border-b border-slate-100">
                      <td className="py-2">{lecture.title}</td>
                      <td className="py-2">{lecture.subjectId?.name || "-"}</td>
                      <td className="py-2">{new Date(lecture.scheduledAt).toLocaleString()}</td>
                      <td className="py-2">{lecture.durationMinutes} min</td>
                      <td className="py-2">
                        {lecture.meetingLink ? (
                          <a className="text-[#135ed8] underline" href={lecture.meetingLink} target="_blank" rel="noreferrer">
                            Open
                          </a>
                        ) : (
                          "-"
                        )}
                      </td>
                    </tr>
                  ))}
                  {scheduledLectures.length === 0 ? (
                    <tr>
                      <td className="py-3 text-slate-500" colSpan={5}>No scheduled lectures yet.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          <section id="attendance" className="rounded-2xl border border-slate-200 bg-white p-4 xl:col-span-2">
            <h2 className="text-base font-semibold">Start Live Attendance</h2>
            <p className="mt-2 text-sm text-slate-600">Camera frame + geolocation is sent to backend. AI matching stays in backend/OpenCV.</p>
            <div className="mt-3 grid gap-2 md:grid-cols-3">
              <select className="rounded-lg border border-slate-300 px-3 py-2 text-sm" value={selectedSubjectId} onChange={(e) => setSelectedSubjectId(e.target.value)}>
                {subjects.map((subject) => (
                  <option key={subject._id} value={subject._id}>{subject.name} ({subject.code})</option>
                ))}
              </select>
              <select className="rounded-lg border border-slate-300 px-3 py-2 text-sm" value={year} onChange={(e) => setYear(e.target.value as YearValue)}>
                {years.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <select className="rounded-lg border border-slate-300 px-3 py-2 text-sm" value={division} onChange={(e) => setDivision(e.target.value)}>
                {divisions.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button className="rounded-lg border border-slate-300 px-4 py-2 text-sm" type="button" onClick={openAttendanceCamera}>Open Camera</button>
              <button className="rounded-lg border border-slate-300 px-4 py-2 text-sm" type="button" onClick={closeAttendanceCamera}>Close Camera</button>
              <button className="rounded-lg bg-[#135ed8] px-4 py-2 text-sm font-semibold text-white" type="button" onClick={startAttendance}>Start Attendance</button>
            </div>

            {cameraOpen && (
              <video ref={attendanceVideoRef} autoPlay playsInline muted className="mt-3 w-full max-w-md rounded-lg border border-slate-200" />
            )}
            <canvas ref={attendanceCanvasRef} className="hidden" />
          </section>

          <section id="reports" className="rounded-2xl border border-slate-200 bg-white p-4 xl:col-span-2">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Reports (Traffic-Light)</h2>
              <div className="flex items-center gap-2">
                <select className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm" value={selectedSubjectId} onChange={(e) => setSelectedSubjectId(e.target.value)}>
                  {subjects.map((subject) => (
                    <option key={subject._id} value={subject._id}>{subject.name} ({subject.code})</option>
                  ))}
                </select>
                <button className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm" onClick={loadReport} type="button">Load Report</button>
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

        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">{message}</div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
