"use client";

type ToastType = "success" | "error" | "info";

export type ToastItem = {
  id: string;
  text: string;
  type: ToastType;
};

const toneClass: Record<ToastType, string> = {
  success: "border-green-200 bg-green-50 text-green-800",
  error: "border-red-200 bg-red-50 text-red-800",
  info: "border-slate-200 bg-white text-slate-800",
};

export function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}) {
  if (!toasts.length) return null;

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-50 space-y-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto min-w-[260px] max-w-sm rounded-lg border px-3 py-2 text-sm shadow ${toneClass[toast.type]}`}
        >
          <div className="flex items-start justify-between gap-3">
            <p>{toast.text}</p>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              className="text-xs font-semibold opacity-70 hover:opacity-100"
            >
              Close
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

