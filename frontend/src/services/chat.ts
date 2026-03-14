import api from "./api";

export type ChatMessage = {
  _id: string;
  sender: {
    _id: string;
    name: string;
    email: string;
    role?: string;
  } | null;
  senderRole: string;
  receiver: {
    _id: string;
    name: string;
    email: string;
    role?: string;
  } | null;
  message: string;
  seen: boolean;
  delivered: boolean;
  messageType: string;
  createdAt: string;
};

export type ChatUser = {
  _id: string;
  name: string;
  email: string;
  role: string;
  year?: string;
  division?: string;
};

export async function getChatContacts(role?: string) {
  const { data } = await api.get("/chat/contacts", { params: role ? { role } : {} });
  return data as { success: boolean; users: ChatUser[] };
}

export async function sendMessage(payload: { message: string; receiverId: string }) {
  const { data } = await api.post("/chat/send", payload);
  return data as { success: boolean; message: string; chatMessage?: ChatMessage };
}

export async function getMessages(payload: { withUserId?: string; roomId?: string; page?: number; limit?: number }) {
  const { data } = await api.get("/chat/messages", { params: payload });
  return data as {
    success: boolean;
    messages: ChatMessage[];
    pagination: { page: number; limit: number; total: number; pages: number };
  };
}

export async function getRoomMessages(roomId: string) {
  const { data } = await api.get(`/chat/room/${roomId}`);
  return data as { success: boolean; messages: ChatMessage[] };
}

export async function markMessageAsRead(messageId: string) {
  const { data } = await api.patch(`/chat/read/${messageId}`);
  return data as { success: boolean; message: string };
}
