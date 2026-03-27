"use client";

import { useEffect, useRef, useState } from "react";
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

// Roles each sender can message
const roleFiltersBySender: Record<string, string[]> = {
  admin: ["hod", "coordinator", "teacher", "student", "parent"],
  hod: ["admin", "teacher", "coordinator", "student"],
  coordinator: ["hod", "teacher", "student"],
  teacher: ["hod", "coordinator", "student"],
};

// ── Skeleton loader for mention user list ────────────────────────────────────
function MentionSkeleton() {
  return (
    <>
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3 animate-pulse">
          <div className="h-8 w-8 rounded-full bg-slate-200 shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-24 rounded bg-slate-200" />
            <div className="h-2.5 w-36 rounded bg-slate-100" />
          </div>
        </div>
      ))}
    </>
  );
}

export default function ChatPage() {
  const { user, token } = useAuth();

  const [contacts, setContacts] = useState<ChatUser[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [draft, setDraft] = useState("");
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const [typingUser, setTypingUser] = useState<string | null>(null);
  const [broadcastTargets, setBroadcastTargets] = useState<string[]>([]);

  // @ mention
  const [showRoleMenu, setShowRoleMenu] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [mentionRole, setMentionRole] = useState("");
  const [mentionUsers, setMentionUsers] = useState<ChatUser[]>([]);
  const [mentionLoading, setMentionLoading] = useState(false);
  const [mentionVisible, setMentionVisible] = useState(false); // for CSS animation

  const listEndRef = useRef<HTMLDivElement | null>(null);
  const socketRef = useRef<Socket | null>(null);

  const allowedRoles = roleFiltersBySender[user?.role || ""] || [];
  const selectedUser = contacts.find((c) => c._id === selectedUserId) || null;

  // ── Toast helper ────────────────────────────────────────────────────────────
  const pushToast = (text: string, type: ToastItem["type"]) => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    setToasts((cur) => [...cur, { id, text, type }]);
    setTimeout(() => setToasts((cur) => cur.filter((t) => t.id !== id)), 3200);
  };

  // ── Data loaders ────────────────────────────────────────────────────────────
  const loadConversation = async (withUserId: string) => {
    if (!withUserId) { setMessages([]); return; }
    try {
      const res = await getMessages({ withUserId, page: 1, limit: 100 });
      setMessages(res.messages || []);
    } catch {
      setMessages([]);
    }
  };

  // Poll conversation every 5 s
  useEffect(() => {
    if (!selectedUserId) return;
    void loadConversation(selectedUserId);
    const iv = window.setInterval(() => void loadConversation(selectedUserId), 5000);
    return () => window.clearInterval(iv);
  }, [selectedUserId]);

  // Auto-scroll on new message
  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Socket ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token || !user?.college) return;
    const socket = connectCollegeSocket(token, user.college);
    socketRef.current = socket;

    socket.on("direct-message", (payload: ChatMessage) => {
      const relevant =
        payload.sender?._id === selectedUserId ||
        payload.receiver?._id === selectedUserId;
      if (!relevant) return;
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
    socket.on("user-online", (id: string) =>
      setOnlineUsers((p) => [...new Set([...p, id])])
    );
    socket.on("user-offline", ({ userId }: { userId: string }) =>
      setOnlineUsers((p) => p.filter((x) => x !== userId))
    );
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

    return () => { socket.disconnect(); socketRef.current = null; };
  }, [token, user?.college, selectedUserId]);

  // ── Send ────────────────────────────────────────────────────────────────────
  const onSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    try {
      const msg = draft.trim();
      if (broadcastTargets.length) {
        await Promise.all(
          broadcastTargets.map((id) => sendMessage({ receiverId: id, message: msg }))
        );
        pushToast("Broadcast sent.", "success");
        setBroadcastTargets([]);
      } else {
        if (!selectedUserId) return;
        const res = await sendMessage({ receiverId: selectedUserId, message: msg });
        if (!res.success) { pushToast(res.message || "Failed.", "error"); return; }
      }
      setDraft("");
      if (selectedUserId) void loadConversation(selectedUserId);
    } catch {
      pushToast("Failed to send message.", "error");
    }
  };

  // ── Draft change — detects @ ─────────────────────────────────────────────
  const onDraftChange = (value: string) => {
    setDraft(value);
    socketRef.current?.emit("typing", { to: selectedUserId });
    const triggered = value.trimEnd().endsWith("@");
    if (triggered) {
      setShowRoleMenu(true);
      setShowUserMenu(false);
      setMentionVisible(false);
      // tiny delay so DOM mounts before opacity transition kicks in
      requestAnimationFrame(() => setMentionVisible(true));
    } else if (!value.includes("@")) {
      closeMention();
    }
  };

  const closeMention = () => {
    setMentionVisible(false);
    setTimeout(() => {
      setShowRoleMenu(false);
      setShowUserMenu(false);
      setMentionRole("");
      setMentionUsers([]);
    }, 180); // wait for fade-out
  };

  // ── Role selected → fetch users with skeleton ────────────────────────────
  const onPickRole = async (role: string) => {
    setMentionRole(role);
    setShowRoleMenu(false);
    setShowUserMenu(true);
    setMentionLoading(true);
    setMentionUsers([]);
    // animate the panel in
    setMentionVisible(false);
    requestAnimationFrame(() => setMentionVisible(true));
    try {
      const res = await getChatContacts(role);
      // stagger — small delay so skeleton shows briefly even on fast networks
      await new Promise((r) => setTimeout(r, 350));
      setMentionUsers(res.users || []);
    } catch {
      setMentionUsers([]);
    } finally {
      setMentionLoading(false);
    }
  };

  // ── User selected ────────────────────────────────────────────────────────
  const onPickUser = (userId: string) => {
    setDraft((t) => t.replace(/@$/, "").trimEnd());
    closeMention();
    if (userId === "__all__") {
      setBroadcastTargets(mentionUsers.map((u) => u._id));
      // keep first user selected so header shows something
      if (mentionUsers[0]) setSelectedUserId(mentionUsers[0]._id);
      pushToast(`Broadcast to all ${mentionRole}.`, "info");
      // load contacts list so future polls work
      void getChatContacts(mentionRole).then((r) => setContacts(r.users || []));
      return;
    }
    setBroadcastTargets([]);
    setSelectedUserId(userId);
    // store full contacts for that role so selectedUser resolves
    setContacts((prev) => {
      const merged = [...prev];
      mentionUsers.forEach((u) => {
        if (!merged.find((x) => x._id === u._id)) merged.push(u);
      });
      return merged;
    });
  };

  // ── Shared popup transition style ────────────────────────────────────────
  const popupStyle: React.CSSProperties = {
    transition: "opacity 180ms ease, transform 180ms ease",
    opacity: mentionVisible ? 1 : 0,
    transform: mentionVisible ? "translateY(0)" : "translateY(10px)",
    pointerEvents: mentionVisible ? "auto" : "none",
  };

  return (
    <ProtectedRoute allow={["admin", "hod", "coordinator", "teacher"]}>
      <DashboardLayout title="Chat">
        <ToastStack
          toasts={toasts}
          onDismiss={(id) => setToasts((cur) => cur.filter((t) => t.id !== id))}
        />

        <section className="flex min-h-[82vh] flex-col rounded-[1.6rem] border border-slate-200 bg-[#e5ddd5] shadow-lg overflow-hidden">

          {/* ── Header ───────────────────────────────────────────────────── */}
          <div className="flex items-center gap-3 bg-[#0b141a] px-5 py-3.5 text-white">
            {/* Avatar */}
            <div className="relative shrink-0">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-600 text-sm font-bold uppercase">
                {selectedUser?.name?.[0] || "?"}
              </div>
              {selectedUser && onlineUsers.includes(selectedUser._id) && (
                <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-green-400 ring-2 ring-[#0b141a]" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold leading-tight">
                {selectedUser
                  ? `${selectedUser.name}`
                  : "No contact selected"}
              </p>
              <p className="text-xs text-slate-400 leading-tight mt-0.5">
                {typingUser
                  ? "typing..."
                  : selectedUser
                  ? onlineUsers.includes(selectedUser._id)
                    ? "Active now"
                    : `${selectedUser.role}`
                  : "Type @ to pick someone"}
              </p>
            </div>

            {broadcastTargets.length > 0 && (
              <span className="rounded-full bg-[#25d366] px-3 py-1 text-xs font-semibold text-white">
                Broadcast: {broadcastTargets.length} users
              </span>
            )}
          </div>

          {/* ── Messages ─────────────────────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {messages.length === 0 ? (
              <div className="flex h-full min-h-[300px] items-center justify-center">
                <div className="rounded-2xl bg-white/80 px-8 py-6 text-center shadow-sm">
                  <p className="text-2xl font-bold text-slate-700">
                    Start a conversation
                  </p>
                  <p className="mt-2 text-sm text-slate-500">
                    Type{" "}
                    <kbd className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[#135ed8]">
                      @
                    </kbd>{" "}
                    in the input below to pick a role and contact.
                  </p>
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
                      className={`max-w-[72%] rounded-2xl px-4 py-2.5 text-sm shadow-sm ${
                        isOwn
                          ? "rounded-br-sm bg-[#d9fdd3] text-slate-900"
                          : "rounded-bl-sm bg-white text-slate-800"
                      }`}
                    >
                      {!isOwn && (
                        <p className="mb-0.5 text-[11px] font-semibold text-[#135ed8]">
                          {chat.sender?.name || ""}
                        </p>
                      )}
                      <p className="whitespace-pre-wrap leading-relaxed">
                        {chat.message}
                      </p>
                      <div className="mt-1 flex items-center justify-end gap-1.5 text-[10px] text-slate-400">
                        <span>
                          {new Date(chat.createdAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        {isOwn && (
                          <span>
                            {chat.seen
                              ? "Read"
                              : (chat as ChatMessage & { delivered?: boolean })
                                  .delivered
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

          {/* ── Input bar ────────────────────────────────────────────────── */}
          <form
            onSubmit={onSend}
            className="relative border-t border-white/40 bg-[#f0f2f5] px-4 py-3"
          >
            <div className="flex items-center gap-2">
              <input
                value={draft}
                onChange={(e) => onDraftChange(e.target.value)}
                placeholder="Message... (type @ to mention)"
                className="flex-1 rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm outline-none transition focus:ring-2 focus:ring-[#25d366]"
              />
              <button
                type="submit"
                disabled={!draft.trim() && broadcastTargets.length === 0}
                className="rounded-full bg-[#25d366] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1ebe58] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Send
              </button>
            </div>

            {/* ── @ Role picker popup ─────────────────────────────────── */}
            {showRoleMenu && (
              <div
                style={popupStyle}
                className="absolute bottom-16 left-4 z-30 w-52 rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden"
              >
                <p className="border-b bg-slate-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                  Mention a role
                </p>
                {allowedRoles.map((role, i) => (
                  <button
                    key={role}
                    type="button"
                    style={{
                      transitionDelay: mentionVisible ? `${i * 40}ms` : "0ms",
                      transition: "opacity 200ms ease, transform 200ms ease",
                      opacity: mentionVisible ? 1 : 0,
                      transform: mentionVisible ? "translateX(0)" : "translateX(-8px)",
                    }}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-sm capitalize text-slate-700 hover:bg-slate-50 last:rounded-b-2xl"
                    onClick={() => void onPickRole(role)}
                  >
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#e3edff] text-[11px] font-bold uppercase text-[#1d63dc]">
                      {role[0]}
                    </span>
                    {role}
                  </button>
                ))}
              </div>
            )}

            {/* ── @ User picker popup ─────────────────────────────────── */}
            {showUserMenu && (
              <div
                style={popupStyle}
                className="absolute bottom-16 left-4 z-30 w-80 rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden"
              >
                <div className="flex items-center justify-between border-b bg-slate-50 px-4 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                    {mentionRole} contacts
                  </p>
                  <button
                    type="button"
                    onClick={closeMention}
                    className="text-xs text-slate-400 hover:text-slate-600"
                  >
                    ESC
                  </button>
                </div>

                <div className="max-h-64 overflow-y-auto">
                  {mentionLoading ? (
                    <MentionSkeleton />
                  ) : (
                    <>
                      {/* Broadcast all */}
                      <button
                        type="button"
                        style={{
                          transitionDelay: "0ms",
                          transition: "opacity 200ms ease, transform 200ms ease",
                          opacity: mentionVisible ? 1 : 0,
                          transform: mentionVisible ? "translateX(0)" : "translateX(-8px)",
                        }}
                        className="flex w-full items-center gap-3 border-b px-4 py-3 text-sm font-semibold text-[#135ed8] hover:bg-blue-50"
                        onClick={() => onPickUser("__all__")}
                      >
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#e3edff] text-xs font-bold text-[#1d63dc]">
                          All
                        </span>
                        Broadcast to all {mentionRole}
                      </button>

                      {mentionUsers.map((u, i) => (
                        <button
                          key={u._id}
                          type="button"
                          style={{
                            transitionDelay: mentionVisible ? `${(i + 1) * 40}ms` : "0ms",
                            transition: "opacity 200ms ease, transform 200ms ease",
                            opacity: mentionVisible ? 1 : 0,
                            transform: mentionVisible
                              ? "translateX(0)"
                              : "translateX(-8px)",
                          }}
                          className="flex w-full items-center gap-3 px-4 py-2.5 text-sm hover:bg-slate-50"
                          onClick={() => onPickUser(u._id)}
                        >
                          <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold uppercase text-slate-600">
                            {u.name?.[0] || "?"}
                            {onlineUsers.includes(u._id) && (
                              <span className="absolute bottom-0 right-0 h-2 w-2 rounded-full bg-green-400 ring-1 ring-white" />
                            )}
                          </span>
                          <div className="min-w-0 text-left">
                            <p className="truncate font-semibold text-slate-900">
                              {u.name}
                            </p>
                            <p className="truncate text-[11px] text-slate-400">
                              {u.email}
                            </p>
                          </div>
                        </button>
                      ))}

                      {mentionUsers.length === 0 && (
                        <p className="px-4 py-4 text-sm text-slate-400">
                          No contacts found for {mentionRole}.
                        </p>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </form>
        </section>
      </DashboardLayout>
    </ProtectedRoute>
  );
}