"use client";

import { useMemo } from "react";

export type AttendanceGeoPoint = {
  id: string;
  latitude?: number | null;
  longitude?: number | null;
  flag?: "green" | "yellow" | "red" | null;
  label: string;
  meta?: string;
};

type ClusterPoint = {
  id: string;
  latitude: number;
  longitude: number;
  x: number;
  y: number;
  count: number;
  flag: "green" | "yellow" | "red";
  labels: string[];
};

const flagTone: Record<NonNullable<AttendanceGeoPoint["flag"]>, string> = {
  green: "bg-emerald-500",
  yellow: "bg-amber-500",
  red: "bg-rose-500",
};

const worstFlag = (
  current: AttendanceGeoPoint["flag"],
  next: AttendanceGeoPoint["flag"],
) => {
  const score = { green: 1, yellow: 2, red: 3 };
  const currentFlag = (current || "green") as keyof typeof score;
  const nextFlag = (next || "green") as keyof typeof score;
  return score[nextFlag] >= score[currentFlag] ? nextFlag : currentFlag;
};

export function AttendanceGeoMap({
  points,
  title,
  description,
}: {
  points: AttendanceGeoPoint[];
  title: string;
  description: string;
}) {
  const clusters = useMemo(() => {
    const validPoints = points.filter(
      (point) =>
        Number.isFinite(point.latitude) && Number.isFinite(point.longitude),
    ) as Array<
      AttendanceGeoPoint & { latitude: number; longitude: number }
    >;

    if (!validPoints.length) return [] as ClusterPoint[];

    const grouped = new Map<
      string,
      {
        latitude: number;
        longitude: number;
        count: number;
        flag: "green" | "yellow" | "red";
        labels: string[];
      }
    >();

    validPoints.forEach((point) => {
      const latKey = point.latitude.toFixed(3);
      const lngKey = point.longitude.toFixed(3);
      const key = `${latKey}_${lngKey}`;
      const existing = grouped.get(key);

      if (!existing) {
        grouped.set(key, {
          latitude: point.latitude,
          longitude: point.longitude,
          count: 1,
          flag: (point.flag || "green") as "green" | "yellow" | "red",
          labels: [point.label],
        });
        return;
      }

      existing.count += 1;
      existing.flag = worstFlag(existing.flag, point.flag) as
        | "green"
        | "yellow"
        | "red";
      if (existing.labels.length < 4) {
        existing.labels.push(point.label);
      }
    });

    const groupedPoints = Array.from(grouped.entries()).map(([key, value]) => ({
      id: key,
      ...value,
    }));

    const latitudes = groupedPoints.map((point) => point.latitude);
    const longitudes = groupedPoints.map((point) => point.longitude);
    const minLat = Math.min(...latitudes);
    const maxLat = Math.max(...latitudes);
    const minLng = Math.min(...longitudes);
    const maxLng = Math.max(...longitudes);
    const latRange = Math.max(maxLat - minLat, 0.002);
    const lngRange = Math.max(maxLng - minLng, 0.002);

    return groupedPoints.map((point) => ({
      ...point,
      x: ((point.longitude - minLng) / lngRange) * 84 + 8,
      y: 92 - ((point.latitude - minLat) / latRange) * 84,
    }));
  }, [points]);

  return (
    <section className="rounded-[1.8rem] border border-white/70 bg-white/80 p-5 shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <p className="mt-1 text-sm text-slate-600">{description}</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-slate-600">
          <span className="rounded-full bg-emerald-100 px-3 py-1">Green</span>
          <span className="rounded-full bg-amber-100 px-3 py-1">Yellow</span>
          <span className="rounded-full bg-rose-100 px-3 py-1">Red</span>
        </div>
      </div>

      {clusters.length ? (
        <>
          <div
            className="relative mt-5 h-[20rem] overflow-hidden rounded-[1.6rem] border border-slate-200 bg-slate-950/[0.03]"
            style={{
              backgroundImage:
                "linear-gradient(to right, rgba(148,163,184,0.16) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.16) 1px, transparent 1px)",
              backgroundSize: "48px 48px",
            }}
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.14),transparent_36%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.12),transparent_34%)]" />
            {clusters.map((cluster) => {
              const size = Math.min(18 + cluster.count * 4, 42);
              return (
                <button
                  key={cluster.id}
                  type="button"
                  title={`${cluster.count} mark(s): ${cluster.labels.join(", ")}${cluster.count > cluster.labels.length ? "..." : ""}`}
                  className={`absolute flex items-center justify-center rounded-full border-2 border-white/80 text-[11px] font-bold text-white shadow-[0_10px_20px_rgba(15,23,42,0.25)] ${flagTone[cluster.flag]}`}
                  style={{
                    left: `${cluster.x}%`,
                    top: `${cluster.y}%`,
                    width: `${size}px`,
                    height: `${size}px`,
                    transform: "translate(-50%, -50%)",
                  }}
                >
                  {cluster.count}
                </button>
              );
            })}
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {clusters.slice(0, 6).map((cluster) => (
              <div
                key={`${cluster.id}_summary`}
                className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm"
              >
                <p className="font-semibold text-slate-900">
                  {cluster.count} attendance mark(s)
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {cluster.latitude.toFixed(4)}, {cluster.longitude.toFixed(4)}
                </p>
                <p className="mt-2 text-xs text-slate-600">
                  {cluster.labels.join(", ")}
                  {cluster.count > cluster.labels.length ? "..." : ""}
                </p>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="mt-5 rounded-[1.6rem] border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
          No geolocation attendance points are available yet for this view.
        </div>
      )}
    </section>
  );
}
