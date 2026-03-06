import { io, Socket } from "socket.io-client";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  (process.env.NEXT_PUBLIC_API_URL ? `${process.env.NEXT_PUBLIC_API_URL}/api` : "http://localhost:5000/api");
const SOCKET_BASE = process.env.NEXT_PUBLIC_SOCKET_URL || API_BASE.replace(/\/api\/?$/, "");

export const buildBatchKey = (departmentId: string, year: string, division: string) =>
  `${departmentId}_${year}_${division}`;

export const buildBatchRoomId = (batchKey: string) => `batch_${batchKey}`;

export function connectCollegeSocket(token: string, collegeId: string): Socket {
  return io(`${SOCKET_BASE}/college/${collegeId}`, {
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: 10,
    timeout: 10000,
    auth: { token: `Bearer ${token}` },
  });
}
