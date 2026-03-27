import { io, Socket } from "socket.io-client";
import { resolveSocketBaseUrl } from "@/src/services/network";

const SOCKET_BASE = resolveSocketBaseUrl();

export const buildBatchKey = (departmentId: string, year: string, division: string) =>
  `${departmentId}_${year}_${division}`;

export const buildBatchRoomId = (batchKey: string) => `batch_${batchKey}`;
export const buildLectureRoomId = (meetingRoomId: string) => `lecture_room_${meetingRoomId}`;

export function connectCollegeSocket(token: string, collegeId: string): Socket {
  return io(`${SOCKET_BASE}/college/${collegeId}`, {
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    randomizationFactor: 0.5,
    timeout: 10000,
    auth: { token: `Bearer ${token}` },
  });
}
