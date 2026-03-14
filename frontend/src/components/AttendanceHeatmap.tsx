"use client";

import { useMemo, useState } from "react";

export type HeatmapPoint = {
  date: string;
  count: number;
  status: "present" | "absent" | "late" | "no-class";
  subject: string;
  tooltip: string;
};

type RangeMode = "week" | "month" | "year";

type HeatmapDay = {
  date: string;
  dayNumber: number;
  point: HeatmapPoint | null;
  inRange: boolean;
};

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_MS = 24 * 60 * 60 * 1000;

const startOfDay = (input: Date) => {
  const next = new Date(input);
  next.setHours(0, 0, 0, 0);
  return next;
};

const toDateKey = (input: Date) => startOfDay(input).toISOString().split("T")[0];

const startOfWeek = (input: Date) => {
  const next = startOfDay(input);
  const day = next.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  next.setDate(next.getDate() + diff);
  return next;
};

const endOfWeek = (input: Date) => {
  const next = startOfWeek(input);
  next.setDate(next.getDate() + 6);
  return next;
};

const startOfMonth = (input: Date) => {
  const next = startOfDay(input);
  next.setDate(1);
  return next;
};

const startOfYear = (input: Date) => {
  const next = startOfDay(input);
  next.setMonth(0, 1);
  return next;
};

const isSameMonth = (first: Date, second: Date) =>
  first.getFullYear() === second.getFullYear() && first.getMonth() === second.getMonth();

const getStatusTone = (status: HeatmapPoint["status"] | "out-of-range") => {
  if (status === "present") {
    return "bg-emerald-500 hover:bg-emerald-400";
  }
  if (status === "late") {
    return "bg-amber-400 hover:bg-amber-300";
  }
  if (status === "absent") {
    return "bg-rose-500 hover:bg-rose-400";
  }
  if (status === "no-class") {
    return "bg-slate-200 hover:bg-slate-300";
  }
  return "bg-slate-100";
};

export function AttendanceHeatmap({
  data,
  compact = false,
  title = "Yearly Presence Pattern",
  description = "Attendance Heatmap",
}: {
  data: HeatmapPoint[];
  compact?: boolean;
  title?: string;
  description?: string;
}) {
  const [range, setRange] = useState<RangeMode>(compact ? "month" : "year");
  const today = useMemo(() => startOfDay(new Date()), []);
  const pointMap = useMemo(
    () => new Map(data.map((point) => [point.date, point])),
    [data],
  );

  const { rangeStart, rangeEnd, days, columns, monthMarkers } =
    useMemo(() => {
      const activeEnd = today;
      let activeStart = today;

      if (range === "week") activeStart = startOfWeek(today);
      if (range === "month") activeStart = startOfMonth(today);
      if (range === "year") activeStart = startOfYear(today);

      const paddedStart = startOfWeek(activeStart);
      const paddedEnd = endOfWeek(activeEnd);
      const nextDays: HeatmapDay[] = [];

      for (
        let cursor = new Date(paddedStart);
        cursor.getTime() <= paddedEnd.getTime();
        cursor = new Date(cursor.getTime() + DAY_MS)
      ) {
        const key = toDateKey(cursor);
        const inRange =
          cursor.getTime() >= activeStart.getTime() &&
          cursor.getTime() <= activeEnd.getTime();

        nextDays.push({
          date: key,
          dayNumber: cursor.getDate(),
          point: inRange ? pointMap.get(key) || null : null,
          inRange,
        });
      }

      const nextColumns: HeatmapDay[][] = [];
      for (let index = 0; index < nextDays.length; index += 7) {
        nextColumns.push(nextDays.slice(index, index + 7));
      }

      const nextMonthMarkers = nextColumns.map((column, index) => {
        const anchor = column.find((entry) => entry.inRange) || column[0];
        const anchorDate = new Date(anchor.date);
        const previousAnchor = index > 0
          ? nextColumns[index - 1].find((entry) => entry.inRange) || nextColumns[index - 1][0]
          : null;
        const previousDate = previousAnchor ? new Date(previousAnchor.date) : null;

        const shouldShow = index === 0 || !previousDate || !isSameMonth(anchorDate, previousDate);
        return shouldShow ? MONTH_LABELS[anchorDate.getMonth()] : "";
      });

      return {
        rangeStart: activeStart,
        rangeEnd: activeEnd,
        days: nextDays,
        columns: nextColumns,
        monthMarkers: nextMonthMarkers,
      };
    }, [pointMap, range, today]);

  const cellSize = compact ? 10 : 12;
  const gapSize = compact ? 4 : 5;
  const gridStyle = {
    gridTemplateColumns: `repeat(${columns.length}, ${cellSize}px)`,
    columnGap: `${gapSize}px`,
  } as const;
  const rangeLabel =
    range === "week"
      ? "This Week"
      : range === "month"
        ? "This Month"
        : "This Year";
  const dateSpanLabel = `${rangeStart.toLocaleDateString("en-GB")} - ${rangeEnd.toLocaleDateString("en-GB")}`;

  return (
    <section
      className={`rounded-[1.8rem] border border-white/60 bg-white/60 shadow-[0_20px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl ${compact ? "p-4" : "p-5"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
            {description}
          </p>
          <h2 className={`mt-2 font-semibold text-slate-900 ${compact ? "text-lg" : "text-2xl"}`}>
            {title}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {rangeLabel} GitHub-style attendance view
          </p>
          <p className="mt-1 text-xs text-slate-400">{dateSpanLabel}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap rounded-full border border-slate-200 bg-slate-50 p-1">
            {(["week", "month", "year"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setRange(option)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  range === option
                    ? "bg-slate-900 text-white shadow-[0_6px_18px_rgba(15,23,42,0.18)]"
                    : "text-slate-600 hover:bg-white"
                }`}
              >
                {option === "week" ? "Weekly" : option === "month" ? "Monthly" : "Yearly"}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-2.5 py-1">
              <span className="h-2.5 w-2.5 rounded-[3px] bg-emerald-500" />
              Present
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-2.5 py-1">
              <span className="h-2.5 w-2.5 rounded-[3px] bg-amber-400" />
              Late / Remote
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-2.5 py-1">
              <span className="h-2.5 w-2.5 rounded-[3px] bg-rose-500" />
              Absent
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-2.5 py-1">
              <span className="h-2.5 w-2.5 rounded-[3px] bg-slate-200" />
              No Class
            </span>
          </div>
        </div>
      </div>

      <div className={`${compact ? "mt-4" : "mt-6"} overflow-x-auto`}>
        <div className={`inline-flex min-w-full ${compact ? "justify-start" : "justify-center"}`}>
          <div className="rounded-[1.5rem] border border-white/70 bg-slate-950/[0.03] p-3 md:p-4">
            <div className="flex items-start gap-2">
              {!compact ? (
                <div className="mt-6 grid grid-rows-7 gap-[5px] pr-2 text-[10px] font-medium text-slate-500">
                  {WEEKDAY_LABELS.map((label, index) => (
                    <span key={label} className={index % 2 === 0 ? "" : "opacity-0"}>
                      {label}
                    </span>
                  ))}
                </div>
              ) : null}

              <div>
                {range !== "week" ? (
                  <div className="mb-2 grid text-[10px] font-medium text-slate-500" style={gridStyle}>
                    {monthMarkers.map((label, index) => (
                      <span key={`${label || "blank"}-${index}`} className="truncate">
                        {label}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="mb-2 text-[10px] font-medium text-slate-500">
                    {MONTH_LABELS[rangeStart.getMonth()]}
                  </div>
                )}

                <div className="grid" style={gridStyle}>
                  {columns.map((column, columnIndex) => (
                    <div
                      key={`column-${columnIndex}`}
                      className="grid grid-rows-7"
                      style={{ rowGap: `${gapSize}px` }}
                    >
                      {column.map((day) => {
                        const tone = day.inRange
                          ? getStatusTone(day.point?.status || "no-class")
                          : getStatusTone("out-of-range");
                        const tooltip = day.inRange
                          ? day.point?.tooltip || `${day.date}: No class`
                          : `${day.date}: Outside selected range`;

                        return (
                          <div
                            key={day.date}
                            title={tooltip}
                            aria-label={tooltip}
                            className={`rounded-[3px] transition ${tone} ${day.inRange ? "ring-1 ring-black/4 hover:ring-black/10" : "opacity-45"}`}
                            style={{ width: `${cellSize}px`, height: `${cellSize}px` }}
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>

                <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-slate-500">
                  <p>
                    {days.filter((day) => day.inRange && day.point && day.point.status !== "no-class").length} marked days in selected range
                  </p>
                  <div className="flex items-center gap-1.5">
                    <span>Less</span>
                    <span className="h-2.5 w-2.5 rounded-[3px] bg-slate-200" />
                    <span className="h-2.5 w-2.5 rounded-[3px] bg-emerald-200" />
                    <span className="h-2.5 w-2.5 rounded-[3px] bg-emerald-400" />
                    <span className="h-2.5 w-2.5 rounded-[3px] bg-emerald-500" />
                    <span>More</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
