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
  const [message, setMessage] = useState("Loading chat contacts...");
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const listEndRef = useRef<HTMLDivElement | null>(null);
  const socketRef = useRef<Socket | null>(null);

  const allowedRoles = useMemo(
    () => roleFiltersBySender[user?.role || ""] || [],
    [user?.role],
  );
  const selectedUser = contacts.find((item) => item._id === selectedUserId) || null;

  const pushToast = (text: string, type: ToastItem["type"]) => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    setToasts((current) => [...current, { id, text, type }]);
    setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 3200);
  };

  const loadContacts = async (role?: string) => {
    try {
      const res = await getChatContacts(role);
      setContacts(res.users || []);
      setMessage("Contacts loaded.");
      if (!selectedUserId && res.users?.[0]?._id) {
        setSelectedUserId(res.users[0]._id);
      }
    } catch {
      setContacts([]);
      setMessage("Failed to load chat contacts.");
    }
  };

  const loadConversation = async (withUserId: string) => {
    if (!withUserId) {
      setMessages([]);
      return;
    }
    try {
      const res = await getMessages({ withUserId, page: 1, limit: 100 });
      setMessages(res.messages || []);
      setMessage("Conversation loaded.");
    } catch {
      setMessages([]);
      setMessage("Failed to load conversation.");
    }
  };

  useEffect(() => {
    void loadContacts(activeRoleFilter || undefined);
  }, [activeRoleFilter]);

  useEffect(() => {
    if (!selectedUserId) return;
    if (contacts.some((contact) => contact._id === selectedUserId)) return;
    setSelectedUserId(contacts[0]?._id || "");
  }, [contacts, selectedUserId]);

  useEffect(() => {
    if (!selectedUserId) return;
    void loadConversation(selectedUserId);
    const interval = window.setInterval(() => {
      void loadConversation(selectedUserId);
    }, 5000);
    return () => window.clearInterval(interval);
  }, [selectedUserId]);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!token || !user?.college) return;
    const socket = connectCollegeSocket(token, user.college);
    socketRef.current = socket;

    socket.on("direct-message", (payload: ChatMessage & { roomId?: string }) => {
      const isRelevant =
        payload.sender?._id === selectedUserId || payload.receiver?._id === selectedUserId;
      if (!isRelevant) return;

      setMessages((current) => {
        if (current.some((item) => item._id === payload._id)) return current;
        return [...current, payload];
      });
    });

    socket.on("direct-message-read", (payload: { messageId: string }) => {
      setMessages((current) =>
        current.map((item) =>
          item._id === payload.messageId ? { ...item, seen: true } : item,
        ),
      );
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, user?.college, selectedUserId]);

  const onSend = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedUserId || !draft.trim()) return;

    try {
      const res = await sendMessage({
        receiverId: selectedUserId,
        message: draft.trim(),
      });

      if (!res.success) {
        pushToast(res.message || "Failed to send message.", "error");
        return;
      }

      setDraft("");
      pushToast("Message sent.", "success");
      await loadConversation(selectedUserId);
    } catch {
      pushToast("Failed to send message.", "error");
    }
  };

  return (
    <ProtectedRoute allow={["admin", "hod", "coordinator", "teacher"]}>
      <DashboardLayout title="Cross-Role Chat">
        <ToastStack
          toasts={toasts}
          onDismiss={(id) =>
            setToasts((current) => current.filter((toast) => toast.id !== id))
          }
        />

        <div className="grid min-h-[70vh] gap-4 xl:grid-cols-[320px_1fr]">
          <aside className="rounded-[1.8rem] border border-white/70 bg-white/80 p-4 shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
            <h2 className="text-lg font-semibold text-slate-900">Chats</h2>
            <p className="mt-1 text-sm text-slate-600">
              Direct role-based conversations in a WhatsApp-style layout.
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setActiveRoleFilter("")}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                  !activeRoleFilter
                    ? "border-[#1d63dc] bg-[#e3edff] text-[#1d63dc]"
                    : "border-slate-200 bg-white text-slate-600"
                }`}
              >
                All
              </button>
              {allowedRoles.map((role) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => setActiveRoleFilter(role)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                    activeRoleFilter === role
                      ? "border-[#1d63dc] bg-[#e3edff] text-[#1d63dc]"
                      : "border-slate-200 bg-white text-slate-600"
                  }`}
                >
                  {role}
                </button>
              ))}
            </div>

            <div className="mt-4 space-y-2">
              {contacts.map((contact) => (
                <button
                  key={contact._id}
                  type="button"
                  onClick={() => setSelectedUserId(contact._id)}
                  className={`w-full rounded-[1.3rem] border px-4 py-3 text-left transition ${
                    selectedUserId === contact._id
                      ? "border-[#1d63dc] bg-[#e8f0ff]"
                      : "border-slate-200 bg-white hover:bg-slate-50"
                  }`}
                >
                  <p className="text-sm font-semibold text-slate-900">
                    {contact.name}
                  </p>
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-500">
                    {contact.role}
                    {contact.year && contact.division
                      ? ` • ${contact.year}-${contact.division}`
                      : ""}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">{contact.email}</p>
                </button>
              ))}
              {contacts.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-5 text-sm text-slate-500">
                  No contacts available for this role filter.
                </div>
              ) : null}
            </div>
          </aside>

          <section className="flex min-h-[70vh] flex-col rounded-[1.8rem] border border-white/70 bg-[#e5ddd5] shadow-[0_18px_45px_rgba(15,23,42,0.1)]">
            <div className="rounded-t-[1.8rem] border-b border-white/70 bg-[#0b141a] px-5 py-4 text-white">
              <p className="text-sm font-semibold">
                {selectedUser
                  ? `${selectedUser.name} (${selectedUser.role})`
                  : "Select a contact"}
              </p>
              <p className="text-xs text-slate-300">
                {selectedUser?.email || "Choose a role contact from the left panel."}
              </p>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto bg-[linear-gradient(180deg,rgba(255,255,255,0.3),rgba(255,255,255,0.15)),url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2232%22 height=%2232%22 viewBox=%220 0 32 32%22%3E%3Cg fill=%22none%22 fill-rule=%22evenodd%22%3E%3Cg fill=%22%23d1d7db%22 fill-opacity=%220.32%22%3E%3Cpath d=%22M0 0h1v1H0zM16 16h1v1h-1zM8 24h1v1H8zM24 8h1v1h-1z%22/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')] p-5">
              {messages.map((chat) => {
                const isOwn = chat.sender?._id === user?.id;
                return (
                  <div
                    key={chat._id}
                    className={`flex ${isOwn ? "justify-end" : "justify-start"}`}
                  >
                    <article
                      className={`max-w-[88%] rounded-[1.4rem] px-4 py-3 text-sm shadow-sm ${
                        isOwn
                          ? "rounded-br-md bg-[#d9fdd3] text-slate-900"
                          : "rounded-bl-md bg-white text-slate-800"
                      }`}
                    >
                      <p className="whitespace-pre-wrap leading-6">{chat.message}</p>
                      <div className="mt-2 flex items-center justify-end gap-2 text-[11px] text-slate-500">
                        <span>{new Date(chat.createdAt).toLocaleTimeString()}</span>
                        {isOwn ? <span>{chat.seen ? "Read" : "Sent"}</span> : null}
                      </div>
                    </article>
                  </div>
                );
              })}
              {messages.length === 0 ? (
                <div className="rounded-2xl bg-white/75 px-4 py-5 text-sm text-slate-500">
                  No messages yet. Start the conversation.
                </div>
              ) : null}
              <div ref={listEndRef} />
            </div>

            <form
              onSubmit={onSend}
              className="rounded-b-[1.8rem] border-t border-white/70 bg-[#f0f2f5] p-4"
            >
              <div className="flex gap-3">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  disabled={!selectedUserId}
                  placeholder={
                    selectedUserId
                      ? "Type your message..."
                      : "Select a contact first..."
                  }
                  className="w-full rounded-full border border-slate-200 bg-white px-4 py-3 text-sm outline-none disabled:bg-slate-100"
                />
                <button
                  type="submit"
                  disabled={!selectedUserId || !draft.trim()}
                  className="rounded-full bg-[#25d366] px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Send
                </button>
              </div>
              <p className="mt-2 text-xs text-slate-500">{message}</p>
            </form>
          </section>
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
