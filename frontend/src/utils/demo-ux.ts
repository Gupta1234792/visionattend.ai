export const mapFaceErrorMessage = (message: string) => {
  const normalized = String(message || "").toLowerCase();

  if (normalized.includes("no face")) return "Center your face";
  if (normalized.includes("multiple faces")) return "Only one person allowed";
  if (normalized.includes("low confidence") || normalized.includes("confidence")) return "Move closer";
  if (normalized.includes("not clear") || normalized.includes("blur") || normalized.includes("lighting")) return "Improve lighting";
  if (normalized.includes("too large") || normalized.includes("payload")) return "Captured image is too large. Retry once.";
  if (normalized.includes("opencv") || normalized.includes("service unreachable")) return "Face service is temporarily unavailable";
  if (normalized.includes("permission")) return "Camera permission required";

  return message;
};

export const getConfidenceUi = (confidence?: number | null) => {
  const value = Number(confidence || 0);
  if (!Number.isFinite(value) || value <= 0) {
    return {
      label: "Face Verified Successfully",
      progress: 100,
      tone: "bg-emerald-100 text-emerald-700",
      bar: "bg-emerald-500",
    };
  }

  const percent = value <= 1 ? Math.round(value * 100) : Math.round(value);
  if (percent > 90) {
    return {
      label: `Confidence ${percent}%`,
      progress: percent,
      tone: "bg-emerald-100 text-emerald-700",
      bar: "bg-emerald-500",
    };
  }

  return {
    label: `Confidence ${percent}%`,
    progress: percent,
    tone: "bg-amber-100 text-amber-700",
    bar: "bg-amber-500",
  };
};

export const isMobileUnsafeCameraContext = () => {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent || "";
  const isMobile = /android|iphone|ipad|ipod|mobile/i.test(ua);
  return isMobile && !window.isSecureContext;
};
