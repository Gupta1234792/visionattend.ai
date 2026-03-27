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

// ✅ EXTENDED TYPE FIX (lastSeen error solved)
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

  // ✅ FAST CONTACT LOAD
  useEffect(() => {
    getChatContacts().then((res) => {
      setContacts(res.users || []);
      if (res.users?.[0]?._id) setSelectedUserId(res.users[0]._id);
    });
  }, []);

  // ✅ LOAD MESSAGES
  useEffect(() => {
    if (!selectedUserId) return;
    getMessages({ withUserId: selectedUserId }).then((res) => {
      setMessages(res.messages || []);
    });
  }, [selectedUserId]);

  // ✅ SOCKET FIX (TS ERROR SOLVED HERE)
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

    socket.on("user-offline", ({ userId }) => {
      setOnlineUsers((prev) => prev.filter((x) => x !== userId));
    });

    socket.on("typing", ({ from }) => {
      if (from === selectedUserId) {
        setTypingUser(from);
        setTimeout(() => setTypingUser(null), 2000);
      }
    });

    socket.on("message-delivered", ({ messageId }) => {
      setMessages((prev) =>
        prev.map((m) =>
          m._id === messageId ? { ...m, delivered: true } : m
        )
      );
    });

    socket.on("direct-message-read", ({ messageId }) => {
      setMessages((prev) =>
        prev.map((m) =>
          m._id === messageId ? { ...m, seen: true } : m
        )
      );
    });

    // ✅ CORRECT CLEANUP (IMPORTANT FIX)
    return () => {
      socket.disconnect();
    };
  }, [token, user?.college, selectedUserId]);

  useEffect(() => {
    listEndRef.current?.scrollIntoView();
  }, [messages]);

  // SEND MESSAGE
  const onSend = async (e: any) => {
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

  // INPUT
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

  // ROLE SELECT
  const onSelectRole = async (role: string) => {
    setMentionRole(role);
    setShowRoleDropdown(false);
    setShowUserDropdown(true);

    const res = await getChatContacts(role);
    setMentionUsers(res.users || []);
  };

  // USER SELECT
  const onSelectUser = (id: string) => {
    if (id === "__all__") {
      setSelectedUsers(mentionUsers.map((u) => u._id));
      return;
    }

    setSelectedUsers((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : [...prev, id]
    );
  };

  return (
    <ProtectedRoute allow={["admin", "hod", "coordinator", "teacher"]}>
      <DashboardLayout title="Chat">
        <ToastStack toasts={toasts} onDismiss={() => {}} />

        <div className="grid grid-cols-[300px_1fr] h-[80vh] gap-4">

          {/* LEFT PANEL */}
          <aside className="bg-white p-4 rounded-xl overflow-auto">
            {contacts.map((c) => (
              <div
                key={c._id}
                onClick={() => setSelectedUserId(c._id)}
                className="p-3 border rounded mb-2 cursor-pointer"
              >
                <div className="flex justify-between">
                  {c.name}
                  <span className="text-xs">
                    {onlineUsers.includes(c._id) ? "🟢" : "⚫"}
                  </span>
                </div>

                <div className="text-xs text-gray-500">
                  {onlineUsers.includes(c._id)
                    ? "Active now"
                    : c.lastSeen
                    ? `Last seen ${new Date(c.lastSeen).toLocaleTimeString()}`
                    : "Offline"}
                </div>
              </div>
            ))}
          </aside>

          {/* CHAT PANEL */}
          <section className="flex flex-col bg-gray-100 rounded-xl">

            <div className="flex-1 overflow-auto p-4">
              {messages.map((m) => {
                const isOwn = m.sender?._id === user?.id;
                return (
                  <div key={m._id} className="mb-2">
                    <div className={isOwn ? "text-right" : ""}>
                      {m.message}
                      {isOwn && (
                        <div className="text-xs">
                          {m.seen
                            ? "✔✔ Seen"
                            : m.delivered
                            ? "✔✔ Delivered"
                            : "✔ Sent"}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={listEndRef} />
            </div>

            {typingUser && (
              <p className="text-xs px-4 pb-1">typing...</p>
            )}

            <form onSubmit={onSend} className="p-3 flex gap-2 relative">
              <input
                value={draft}
                onChange={(e) => onDraftChange(e.target.value)}
                className="flex-1 border p-2 rounded"
                placeholder="@role select users..."
              />
              <button className="bg-green-500 text-white px-4 rounded">
                Send
              </button>

              {showRoleDropdown && (
                <div className="absolute bottom-12 bg-white border rounded w-40">
                  {allowedRoles.map((r) => (
                    <div
                      key={r}
                      onClick={() => onSelectRole(r)}
                      className="p-2 hover:bg-gray-100"
                    >
                      {r}
                    </div>
                  ))}
                </div>
              )}

              {showUserDropdown && (
                <div className="absolute bottom-12 bg-white border rounded w-60 max-h-60 overflow-auto">
                  <div
                    onClick={() => onSelectUser("__all__")}
                    className="p-2 font-bold"
                  >
                    ALL USERS
                  </div>

                  {mentionUsers.map((u) => (
                    <div
                      key={u._id}
                      onClick={() => onSelectUser(u._id)}
                      className={`p-2 ${
                        selectedUsers.includes(u._id)
                          ? "bg-blue-200"
                          : ""
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