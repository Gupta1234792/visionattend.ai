"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";

export default function RoomPage() {
  const params = useParams<{ roomId: string }>();
  const roomId = String(params?.roomId || "").trim();

  const jitsiUrl = useMemo(() => {
    const clean = roomId.replace(/[^a-zA-Z0-9_-]/g, "");
    const safeRoom = clean || "visionattend-default-room";
    return `https://meet.jit.si/visionattend-${safeRoom}`;
  }, [roomId]);

  return (
    <section className="flex min-h-screen flex-col bg-slate-950 text-white">
      <header className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-300">VisionAttend Live Room</p>
          <h1 className="text-sm font-semibold sm:text-base">{roomId || "Room"}</h1>
        </div>
        <a
          href={jitsiUrl}
          target="_blank"
          rel="noreferrer"
          className="rounded-md border border-white/30 px-3 py-1 text-xs font-semibold text-white"
        >
          Open External
        </a>
      </header>

      <div className="flex-1">
        <iframe
          title="VisionAttend Meeting"
          src={jitsiUrl}
          allow="camera; microphone; fullscreen; display-capture"
          className="h-[calc(100vh-56px)] w-full border-0"
        />
      </div>
    </section>
  );
}
