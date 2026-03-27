"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { ProtectedRoute } from "@/src/components/protected-route";
import { DashboardLayout } from "@/src/layouts/dashboard-layout";
import { ToastItem, ToastStack } from "@/src/components/toast-stack";
import { useAuth } from "@/src/context/auth-context";
import {
  getChatContacts,
  getMessages,
  sendMessage,
  type ChatMessage,
  type ChatUser as BaseChatUser,
} from "@/src/services/chat";
import { connectCollegeSocket } from "@/src/services/socket";

type ChatUser = BaseChatUser & {
  lastSeen?: string;
};

const roleFiltersBySender: Record<string, string[]> = {
  admin: ["hod", "coordinator", "teacher", "student", "parent"],
  hod: ["admin", "teacher", "coordinator", "student"],
  coordinator: ["hod", "teacher", "student"],
  teacher: ["hod", "coordinator", "student"],
};

export default function ChatPage() {
  const { user, token } = useAuth();

  const [contacts, setContacts] = useState<ChatUser[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [draft, setDraft] = useState("");

  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [mentionUsers, setMentionUsers] = useState<ChatUser[]>([]);
  const [mentionRole, setMentionRole] = useState("");

  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const [typingUser, setTypingUser] = useState<string | null>(null);

  const [showRoleDropdown, setShowRoleDropdown] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);

  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const listEndRef = useRef<HTMLDivElement | null>(null);
  const socketRef = useRef<Socket | null>(null);

  const allowedRoles = useMemo(
    () => roleFiltersBySender[user?.role || ""] || [],
    [user?.role]
  );

  const pushToast = (text: string, type: ToastItem["type"]) => {
    const id = Date.now().toString();
    setToasts((t) => [...t, { id, text, type }]);
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 3000);
  };

  useEffect(() => {
    getChatContacts().then((res) => {
      setContacts(res.users || []);
      if (res.users?.[0]?._id) setSelectedUserId(res.users[0]._id);
    });
  }, []);

  useEffect(() => {
    if (!selectedUserId) return;
    getMessages({ withUserId: selectedUserId }).then((res) => {
      setMessages(res.messages || []);
    });
  }, [selectedUserId]);

  useEffect(() => {
    if (!token || !user?.college) return;

    const socket = connectCollegeSocket(token, user.college);
    socketRef.current = socket;

    socket.on("direct-message", (msg: ChatMessage) => {
      setMessages((prev) => [...prev, msg]);
    });

    socket.on("online-users", (users: string[]) => {
      setOnlineUsers(users);
    });

    socket.on("user-online", (id: string) => {
      setOnlineUsers((prev) => [...new Set([...prev, id])]);
    });

    socket.on("user-offline", ({ userId }: { userId: string }) => {
      setOnlineUsers((prev) => prev.filter((x) => x !== userId));
    });

    socket.on("typing", ({ from }: { from: string }) => {
      if (from === selectedUserId) {
        setTypingUser(from);
        setTimeout(() => setTypingUser(null), 2000);
      }
    });

    socket.on("message-delivered", ({ messageId }: { messageId: string }) => {
      setMessages((prev) =>
        prev.map((m) =>
          m._id === messageId ? { ...m, delivered: true } : m
        )
      );
    });

    socket.on("direct-message-read", ({ messageId }: { messageId: string }) => {
      setMessages((prev) =>
        prev.map((m) =>
          m._id === messageId ? { ...m, seen: true } : m
        )
      );
    });

    return () => {
      socket.disconnect();
    };
  }, [token, user?.college, selectedUserId]);

  useEffect(() => {
    listEndRef.current?.scrollIntoView();
  }, [messages]);

  const onSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;

    if (selectedUsers.length > 0) {
      await Promise.all(
        selectedUsers.map((id) =>
          sendMessage({ receiverId: id, message: draft })
        )
      );
      setSelectedUsers([]);
    } else {
      await sendMessage({
        receiverId: selectedUserId,
        message: draft,
      });
    }

    setDraft("");
  };

  const onDraftChange = (value: string) => {
    setDraft(value);

    socketRef.current?.emit("typing", {
      to: selectedUserId,
    });

    if (value.endsWith("@")) {
      setShowRoleDropdown(true);
    } else {
      setShowRoleDropdown(false);
    }
  };

  const onSelectRole = async (role: string) => {
    setMentionRole(role);
    setShowRoleDropdown(false);
    setShowUserDropdown(true);

    const res = await getChatContacts(role);
    setMentionUsers(res.users || []);
  };

  const onSelectUser = (id: string) => {
    if (id === "__all__") {
      setSelectedUsers(mentionUsers.map((u) => u._id));
      return;
    }

    setSelectedUsers((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  return (
    <ProtectedRoute allow={["admin", "hod", "coordinator", "teacher"]}>
      <DashboardLayout title="Chat">
        <ToastStack toasts={toasts} onDismiss={() => {}} />

        <div className="grid grid-cols-[300px_1fr] h-[80vh] gap-4">

          {/* LEFT PANEL */}
          <aside className="bg-white p-4 rounded-xl overflow-auto">
            {contacts.map((c) => {
              const isOnline = onlineUsers.includes(c._id);
              return (
                <div
                  key={c._id}
                  onClick={() => setSelectedUserId(c._id)}
                  className="p-3 border rounded mb-2 cursor-pointer hover:bg-gray-50"
                >
                  <div className="flex justify-between items-center">
                    <span className="font-medium">{c.name}</span>
                    <span
                      className={`w-2 h-2 rounded-full inline-block ${
                        isOnline ? "bg-green-500" : "bg-gray-400"
                      }`}
                    />
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {isOnline
                      ? "Active now"
                      : c.lastSeen
                      ? `Last seen ${new Date(c.lastSeen).toLocaleTimeString()}`
                      : "Offline"}
                  </div>
                </div>
              );
            })}
          </aside>

          {/* CHAT PANEL */}
          <section className="flex flex-col bg-gray-100 rounded-xl overflow-hidden">

            <div className="flex-1 overflow-auto p-4">
              {messages.map((m) => {
                const isOwn = m.sender?._id === user?.id;
                return (
                  <div
                    key={m._id}
                    className={`mb-2 flex ${isOwn ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-xs px-3 py-2 rounded-lg text-sm ${
                        isOwn
                          ? "bg-green-500 text-white"
                          : "bg-white text-gray-800"
                      }`}
                    >
                      {m.message}
                      {isOwn && (
                        <div className="text-xs mt-0.5 opacity-75 text-right">
                          {m.seen
                            ? "Seen"
                            : m.delivered
                            ? "Delivered"
                            : "Sent"}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={listEndRef} />
            </div>

            {typingUser && (
              <p className="text-xs px-4 pb-1 text-gray-500 italic">
                typing...
              </p>
            )}

            <form onSubmit={onSend} className="p-3 flex gap-2 relative border-t bg-white">
              <input
                value={draft}
                onChange={(e) => onDraftChange(e.target.value)}
                className="flex-1 border p-2 rounded focus:outline-none focus:ring-2 focus:ring-green-400"
                placeholder="Type a message... (use @ to mention a role)"
              />
              <button
                type="submit"
                className="bg-green-500 text-white px-4 rounded hover:bg-green-600 transition-colors"
              >
                Send
              </button>

              {showRoleDropdown && (
                <div className="absolute bottom-14 left-3 bg-white border rounded w-40 shadow-lg z-10">
                  {allowedRoles.map((r) => (
                    <div
                      key={r}
                      onClick={() => onSelectRole(r)}
                      className="p-2 hover:bg-gray-100 cursor-pointer capitalize text-sm"
                    >
                      {r}
                    </div>
                  ))}
                </div>
              )}

              {showUserDropdown && (
                <div className="absolute bottom-14 left-3 bg-white border rounded w-60 max-h-60 overflow-auto shadow-lg z-10">
                  <div
                    onClick={() => onSelectUser("__all__")}
                    className="p-2 font-bold cursor-pointer hover:bg-gray-100 text-sm border-b"
                  >
                    All Users
                  </div>
                  {mentionUsers.map((u) => (
                    <div
                      key={u._id}
                      onClick={() => onSelectUser(u._id)}
                      className={`p-2 cursor-pointer hover:bg-gray-100 text-sm ${
                        selectedUsers.includes(u._id) ? "bg-blue-100" : ""
                      }`}
                    >
                      {u.name}
                    </div>
                  ))}
                </div>
              )}
            </form>
          </section>
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
} 