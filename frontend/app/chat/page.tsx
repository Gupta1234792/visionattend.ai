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
  type ChatUser,
} from "@/src/services/chat";
import { connectCollegeSocket } from "@/src/services/socket";

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
  const [activeRoleFilter, setActiveRoleFilter] = useState("");
  const [draft, setDraft] = useState("");
  const [statusMessage, setStatusMessage] = useState("Loading chat contacts...");
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const [typingUser, setTypingUser] = useState<string | null>(null);
  const [broadcastTargets, setBroadcastTargets] = useState<string[]>([]);

  // @ mention
  const [showRoleDropdown, setShowRoleDropdown] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [mentionRole, setMentionRole] = useState("");
  const [mentionUsers, setMentionUsers] = useState<ChatUser[]>([]);

  const listEndRef = useRef<HTMLDivElement | null>(null);
  const socketRef = useRef<Socket | null>(null);

  const allowedRoles = useMemo(
    () => roleFiltersBySender[user?.role || ""] || [],
    [user?.role]
  );

  const selectedUser = contacts.find((c) => c._id === selectedUserId) || null;

  const pushToast = (text: string, type: ToastItem["type"]) => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    setToasts((cur) => [...cur, { id, text, type }]);
    setTimeout(() => setToasts((cur) => cur.filter((t) => t.id !== id)), 3200);
  };

  const loadContacts = async (role?: string) => {
    try {
      const res = await getChatContacts(role);
      setContacts(res.users || []);
      setStatusMessage("Contacts loaded.");
      if (!selectedUserId && res.users?.[0]?._id) {
        setSelectedUserId(res.users[0]._id);
      }
    } catch {
      setContacts([]);
      setStatusMessage("Failed to load chat contacts.");
    }
  };

  const loadConversation = async (withUserId: string) => {
    if (!withUserId) { setMessages([]); return; }
    try {
      const res = await getMessages({ withUserId, page: 1, limit: 100 });
      setMessages(res.messages || []);
      setStatusMessage("Conversation loaded.");
    } catch {
      setMessages([]);
      setStatusMessage("Failed to load conversation.");
    }
  };

  useEffect(() => {
    void loadContacts(activeRoleFilter || undefined);
  }, [activeRoleFilter]);

  useEffect(() => {
    if (!selectedUserId) return;
    if (contacts.some((c) => c._id === selectedUserId)) return;
    setSelectedUserId(contacts[0]?._id || "");
  }, [contacts, selectedUserId]);

  useEffect(() => {
    if (!selectedUserId) return;
    void loadConversation(selectedUserId);
    const interval = window.setInterval(() => void loadConversation(selectedUserId), 5000);
    return () => window.clearInterval(interval);
  }, [selectedUserId]);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!token || !user?.college) return;
    const socket = connectCollegeSocket(token, user.college);
    socketRef.current = socket;

    socket.on("direct-message", (payload: ChatMessage) => {
      const isRelevant =
        payload.sender?._id === selectedUserId ||
        payload.receiver?._id === selectedUserId;
      if (!isRelevant) return;
      setMessages((cur) => {
        if (cur.some((m) => m._id === payload._id)) return cur;
        return [...cur, payload];
      });
    });

    socket.on("direct-message-read", ({ messageId }: { messageId: string }) => {
      setMessages((cur) =>
        cur.map((m) => (m._id === messageId ? { ...m, seen: true } : m))
      );
    });

    socket.on("online-users", (users: string[]) => setOnlineUsers(users));

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
      setMessages((cur) =>
        cur.map((m) => (m._id === messageId ? { ...m, delivered: true } : m))
      );
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, user?.college, selectedUserId]);

  const onSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    try {
      const msg = draft.trim();
      if (broadcastTargets.length) {
        await Promise.all(
          broadcastTargets.map((id) => sendMessage({ receiverId: id, message: msg }))
        );
        pushToast("Message sent to selected users.", "success");
        setBroadcastTargets([]);
      } else {
        if (!selectedUserId) return;
        const res = await sendMessage({ receiverId: selectedUserId, message: msg });
        if (!res.success) {
          pushToast(res.message || "Failed to send message.", "error");
          return;
        }
      }
      setDraft("");
      pushToast("Message sent.", "success");
      if (selectedUserId) void loadConversation(selectedUserId);
    } catch {
      pushToast("Failed to send message.", "error");
    }
  };

  const onDraftChange = (value: string) => {
    setDraft(value);
    socketRef.current?.emit("typing", { to: selectedUserId });
    const atTriggered = value.trimEnd().endsWith("@");
    setShowRoleDropdown(atTriggered);
    if (!atTriggered) setShowUserDropdown(false);
  };

  const onSelectRoleMention = async (role: string) => {
    setMentionRole(role);
    setShowRoleDropdown(false);
    setShowUserDropdown(true);
    try {
      const res = await getChatContacts(role);
      setMentionUsers(res.users || []);
    } catch {
      setMentionUsers([]);
    }
  };

  const onSelectUserMention = (userId: string) => {
    setBroadcastTargets([]);
    setShowUserDropdown(false);
    setDraft((t) => t.replace(/@$/, "").trimEnd());
    if (userId === "__all__") {
      setBroadcastTargets(mentionUsers.map((u) => u._id));
      pushToast("Sending to all in role.", "info");
      return;
    }
    setSelectedUserId(userId);
  };

  return (
    <ProtectedRoute allow={["admin", "hod", "coordinator", "teacher"]}>
      <DashboardLayout title="Cross-Role Chat">
        <ToastStack
          toasts={toasts}
          onDismiss={(id) => setToasts((cur) => cur.filter((t) => t.id !== id))}
        />

        {/* FULL WIDTH CHAT */}
        <section className="flex min-h-[80vh] flex-col rounded-[1.8rem] border border-white/70 bg-[#e5ddd5] shadow-[0_18px_45px_rgba(15,23,42,0.1)]">

          {/* Header */}
          <div className="rounded-t-[1.8rem] border-b border-white/70 bg-[#0b141a] px-5 py-4 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">
                  {selectedUser
                    ? `${selectedUser.name} (${selectedUser.role})`
                    : "Select a contact to start chatting"}
                </p>
                <p className="text-xs text-slate-300">
                  {typingUser
                    ? "typing..."
                    : selectedUser
                    ? onlineUsers.includes(selectedUser._id)
                      ? "Active now"
                      : "Offline"
                    : "Use @ in the message box to pick a contact"}
                </p>
              </div>

              {/* Role filter pills in header */}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setActiveRoleFilter("")}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                    !activeRoleFilter
                      ? "border-[#25d366] bg-[#25d366] text-white"
                      : "border-white/30 bg-white/10 text-white/70 hover:bg-white/20"
                  }`}
                >
                  All
                </button>
                {allowedRoles.map((role) => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => setActiveRoleFilter(role)}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold capitalize transition-colors ${
                      activeRoleFilter === role
                        ? "border-[#25d366] bg-[#25d366] text-white"
                        : "border-white/30 bg-white/10 text-white/70 hover:bg-white/20"
                    }`}
                  >
                    {role}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 space-y-3 overflow-y-auto p-5">
            {messages.length === 0 ? (
              <div className="flex h-full items-center justify-center">
                <div className="rounded-2xl bg-white/75 px-6 py-5 text-center text-sm text-slate-500">
                  <p className="text-base font-semibold text-slate-700">No messages yet</p>
                  <p className="mt-1">Type <span className="font-mono font-bold text-[#135ed8]">@</span> in the message box to select a contact and start chatting.</p>
                </div>
              </div>
            ) : (
              messages.map((chat) => {
                const isOwn = chat.sender?._id === user?.id;
                return (
                  <div
                    key={chat._id}
                    className={`flex ${isOwn ? "justify-end" : "justify-start"}`}
                  >
                    <article
                      className={`max-w-[70%] rounded-[1.4rem] px-4 py-3 text-sm shadow-sm ${
                        isOwn
                          ? "rounded-br-md bg-[#d9fdd3] text-slate-900"
                          : "rounded-bl-md bg-white text-slate-800"
                      }`}
                    >
                      {!isOwn && (
                        <p className="mb-1 text-[11px] font-semibold text-[#135ed8]">
                          {chat.sender?.name || ""}
                        </p>
                      )}
                      <p className="whitespace-pre-wrap leading-6">{chat.message}</p>
                      <div className="mt-1 flex items-center justify-end gap-2 text-[11px] text-slate-500">
                        <span>{new Date(chat.createdAt).toLocaleTimeString()}</span>
                        {isOwn && (
                          <span>
                            {chat.seen
                              ? "Read"
                              : (chat as ChatMessage & { delivered?: boolean }).delivered
                              ? "Delivered"
                              : "Sent"}
                          </span>
                        )}
                      </div>
                    </article>
                  </div>
                );
              })
            )}
            <div ref={listEndRef} />
          </div>

          {/* Input */}
          <form
            onSubmit={onSend}
            className="relative rounded-b-[1.8rem] border-t border-white/70 bg-[#f0f2f5] p-4"
          >
            <div className="flex gap-3">
              <input
                value={draft}
                onChange={(e) => onDraftChange(e.target.value)}
                placeholder="Type @ to mention a role and pick a contact..."
                className="w-full rounded-full border border-slate-200 bg-white px-5 py-3 text-sm outline-none transition focus:ring-2 focus:ring-[#25d366]"
              />
              <button
                type="submit"
                disabled={!draft.trim()}
                className="rounded-full bg-[#25d366] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#1ebe58] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Send
              </button>
            </div>

            {/* @ Role picker */}
            {showRoleDropdown && (
              <div className="absolute bottom-20 left-4 z-20 w-56 animate-in fade-in slide-in-from-bottom-2 rounded-2xl border border-slate-200 bg-white shadow-xl duration-150">
                <p className="border-b px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Select a role
                </p>
                {allowedRoles.map((role) => (
                  <button
                    key={role}
                    type="button"
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-sm capitalize text-slate-700 transition-colors hover:bg-slate-50 last:rounded-b-2xl"
                    onClick={() => void onSelectRoleMention(role)}
                  >
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#e3edff] text-[10px] font-bold uppercase text-[#1d63dc]">
                      {role[0]}
                    </span>
                    {role}
                  </button>
                ))}
              </div>
            )}

            {/* @ User picker */}
            {showUserDropdown && (
              <div className="absolute bottom-20 left-4 z-20 max-h-72 w-80 animate-in fade-in slide-in-from-bottom-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl duration-150">
                <div className="border-b px-4 py-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    {mentionRole} contacts
                  </p>
                </div>
                <div className="overflow-auto" style={{ maxHeight: "230px" }}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 border-b px-4 py-3 text-sm font-semibold text-[#135ed8] transition-colors hover:bg-blue-50"
                    onClick={() => onSelectUserMention("__all__")}
                  >
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#e3edff] text-xs font-bold text-[#1d63dc]">
                      All
                    </span>
                    Send to all {mentionRole}
                  </button>
                  {mentionUsers.map((u) => (
                    <button
                      key={u._id}
                      type="button"
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-slate-50"
                      onClick={() => onSelectUserMention(u._id)}
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold uppercase text-slate-600">
                        {u.name?.[0] || "?"}
                      </span>
                      <div className="min-w-0 text-left">
                        <p className="truncate font-semibold text-slate-900">{u.name}</p>
                        <p className="truncate text-xs text-slate-500">{u.email}</p>
                      </div>
                      {onlineUsers.includes(u._id) && (
                        <span className="ml-auto h-2 w-2 shrink-0 rounded-full bg-green-500" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <p className="mt-2 text-xs text-slate-400">{statusMessage}</p>
          </form>
        </section>
      </DashboardLayout>
    </ProtectedRoute>
  );
}