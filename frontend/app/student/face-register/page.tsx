"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import api from "@/src/services/api";
import { ProtectedRoute } from "@/src/components/protected-route";
import { ToastStack, ToastItem } from "@/src/components/toast-stack";
import { useCameraStream } from "@/src/hooks/use-camera-stream";
import { getConfidenceUi, isMobileUnsafeCameraContext, mapFaceErrorMessage } from "@/src/utils/demo-ux";

const CAPTURE_STEPS = [
  { id: "front", title: "Look Straight", hint: "Keep your face centered and eyes open." },
  { id: "left", title: "Turn Left", hint: "Turn slightly left and keep your face inside the guide." },
  { id: "right", title: "Turn Right", hint: "Turn slightly right and keep your face inside the guide." },
] as const;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load captured image"));
    image.src = src;
  });

const buildRegistrationVariants = async (frame: string) => {
  const image = await loadImage(frame);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;

  const drawVariant = (sx: number, sy: number, sw: number, sh: number) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return frame;
    }
    ctx.drawImage(image, sx, sy, sw, sh, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", 0.92);
  };

  const centerCropW = Math.round(width * 0.78);
  const centerCropH = Math.round(height * 0.82);
  const centerCropX = Math.max(0, Math.round((width - centerCropW) / 2));
  const centerCropY = Math.max(0, Math.round((height - centerCropH) / 2));

  const tightCropW = Math.round(width * 0.64);
  const tightCropH = Math.round(height * 0.72);
  const tightCropX = Math.max(0, Math.round((width - tightCropW) / 2));
  const tightCropY = Math.max(0, Math.round(height * 0.1));

  return [
    frame,
    drawVariant(centerCropX, centerCropY, centerCropW, centerCropH),
    drawVariant(tightCropX, tightCropY, tightCropW, tightCropH),
  ];
};

export default function StudentFaceRegisterPage() {
  const router = useRouter();
  const [message, setMessage] = useState("Open the camera and capture one clear front face frame.");
  const [statusTag, setStatusTag] = useState<"idle" | "camera" | "capture" | "verifying" | "retry" | "success">("idle");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [capturedFrames, setCapturedFrames] = useState<string[]>(Array(CAPTURE_STEPS.length).fill(""));
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [showSuccessOverlay, setShowSuccessOverlay] = useState(false);
  const [isCameraLaunching, setIsCameraLaunching] = useState(false);
  const [lastConfidence, setLastConfidence] = useState<number | null>(null);
  const [lowLightWarning, setLowLightWarning] = useState("");
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);
  const allowBypass = process.env.NEXT_PUBLIC_DEV_BYPASS === "true";
  const devMode = process.env.NEXT_PUBLIC_DEV_MODE === "true";
  const {
    videoRef,
    canvasRef,
    isOpen: cameraOpen,
    isReady: videoReady,
    openCamera: openCameraStream,
    closeCamera,
    captureFrame,
    handleReady,
  } = useCameraStream();

  const activeStep = CAPTURE_STEPS[activeStepIndex];
  const capturedCount = capturedFrames.filter(Boolean).length;
  const confidenceUi = useMemo(() => getConfidenceUi(lastConfidence), [lastConfidence]);
  const progressPercent = useMemo(
    () => Math.round((capturedCount / CAPTURE_STEPS.length) * 100),
    [capturedCount],
  );

  useEffect(() => {
    let cancelled = false;
    const loadProfile = async () => {
      try {
        const res = await api.get("/students/me");
        const isRegistered = Boolean(res.data?.student?.faceRegisteredAt);
        if (!cancelled) {
          setAlreadyRegistered(isRegistered);
          if (isRegistered) {
            setStatusTag("success");
            setMessage("Face already registered for this account.");
          }
        }
      } catch {}
    };

    void loadProfile();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!cameraOpen || !videoReady || !videoRef.current || !canvasRef.current) {
      setLowLightWarning("");
      return;
    }

    const timer = window.setInterval(() => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || !video.videoWidth || !video.videoHeight) return;
      canvas.width = 32;
      canvas.height = 24;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let total = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        total += (pixels[index] + pixels[index + 1] + pixels[index + 2]) / 3;
      }
      const brightness = total / (pixels.length / 4);
      setLowLightWarning(brightness < 60 ? "Low lighting detected. Improve lighting" : "");
    }, 1600);

    return () => window.clearInterval(timer);
  }, [cameraOpen, videoReady, videoRef, canvasRef]);

  const pushToast = useCallback((text: string, type: "success" | "error" | "info" = "info") => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 3200);
  }, []);

  const persistLocalFaceRegistered = useCallback(() => {
    const rawUser = localStorage.getItem("va_user");
    if (!rawUser) return;
    const parsed = JSON.parse(rawUser);
    parsed.faceRegistered = true;
    localStorage.setItem("va_user", JSON.stringify(parsed));
  }, []);

  const openCamera = useCallback(async () => {
    if (cameraOpen || isCameraLaunching || alreadyRegistered) return;
    setIsCameraLaunching(true);
    setStatusTag("camera");
    setMessage("Opening camera...");
    const result = await openCameraStream();
    if (!result.success) {
      setMessage(result.message);
      setStatusTag("camera");
      pushToast(result.message, "error");
      setIsCameraLaunching(false);
      return;
    }
    setStatusTag("capture");
    setMessage("Camera ready. Capture your front face.");
    pushToast("Camera opened successfully.", "success");
    setIsCameraLaunching(false);
  }, [alreadyRegistered, cameraOpen, isCameraLaunching, openCameraStream, pushToast]);

  const handleCloseCamera = useCallback(() => {
    closeCamera();
    setStatusTag("idle");
    setMessage("Camera closed.");
    setIsCameraLaunching(false);
  }, [closeCamera]);

  const captureCurrentStep = useCallback(() => {
    if (!cameraOpen || !videoReady) {
      setMessage("Wait for the live preview, then capture.");
      return;
    }

    const frame = captureFrame();
    if (!frame) {
      setMessage("Unable to capture frame. Keep your face inside the guide and retry.");
      return;
    }

    setCapturedFrames((current) => {
      const next = [...current];
      next[activeStepIndex] = frame;
      return next;
    });
    const isLastStep = activeStepIndex >= CAPTURE_STEPS.length - 1;
    setActiveStepIndex((current) => (current < CAPTURE_STEPS.length - 1 ? current + 1 : current));
    setStatusTag(isLastStep ? "success" : "capture");
    setMessage(
      isLastStep
        ? "All three angles captured. You can now complete registration."
        : `${activeStep.title} captured. Continue with the next angle.`,
    );
  }, [activeStep.title, activeStepIndex, cameraOpen, captureFrame, videoReady]);

  const submitFace = useCallback(async () => {
    if (isSubmitting || alreadyRegistered) return;

    try {
      setIsSubmitting(true);

      if (!cameraOpen) {
        setMessage("Live camera is required for face registration.");
        setStatusTag("camera");
        return;
      }

      const completeFrames = capturedFrames.filter(Boolean);
      if (completeFrames.length !== CAPTURE_STEPS.length) {
        setMessage("Capture front, left, and right face angles before submitting.");
        setStatusTag("retry");
        return;
      }

      setStatusTag("verifying");
      setMessage("Registering your face...");

      const registrationFrames = await Promise.all(
        capturedFrames.map(async (frame) => {
          const [original, centered] = await buildRegistrationVariants(frame);
          return centered || original;
        }),
      );
      await wait(120);

      const res = await api.post(
        "/students/face-register",
        {
          image: capturedFrames[0],
          frames: registrationFrames,
        }
      );

      if (res.data?.success) {
        setLastConfidence(Number(res.data?.confidence || 0));
        persistLocalFaceRegistered();
        setAlreadyRegistered(true);
        setStatusTag("success");
        setMessage("Face registered successfully.");
        setShowSuccessOverlay(true);
        pushToast("Face registered successfully.", "success");
        closeCamera();
        setTimeout(() => {
          router.replace("/student/dashboard");
        }, 1400);
      }
    } catch (error) {
      const errorData = (error as { response?: { data?: { message?: string; existingUserName?: string } } })?.response?.data;
      const apiMessage = errorData?.message;
      const msg = mapFaceErrorMessage(apiMessage || "Face registration failed.");
      const isDuplicateError = msg.toLowerCase().includes("duplicate") || msg.toLowerCase().includes("already registered");
      if (isDuplicateError) {
        setMessage(msg);
        setStatusTag("retry");
        pushToast(
          errorData?.existingUserName
            ? `Face already registered with another account (${errorData.existingUserName}).`
            : "Face already registered with another account.",
          "error"
        );
      } else {
        setMessage(msg);
        setStatusTag("retry");
        pushToast(msg, "error");
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [alreadyRegistered, cameraOpen, capturedFrames, closeCamera, isSubmitting, persistLocalFaceRegistered, pushToast, router]);

  const continueWithBypass = useCallback(() => {
    if (!allowBypass) return;
    persistLocalFaceRegistered();
    sessionStorage.setItem("va_dev_face_verified", "true");
    localStorage.setItem("va_dev_face_verified", "true");
    router.replace("/student/dashboard");
  }, [allowBypass, persistLocalFaceRegistered, router]);

  const skipFaceRegistration = useCallback(() => {
    if (!devMode) return;
    persistLocalFaceRegistered();
    sessionStorage.setItem("va_dev_face_verified", "true");
    localStorage.setItem("va_dev_face_verified", "true");
    router.replace("/student/dashboard");
  }, [devMode, persistLocalFaceRegistered, router]);

  return (
    <ProtectedRoute allow={["student"]}>
      <ToastStack toasts={toasts} onDismiss={(id) => setToasts((prev) => prev.filter((item) => item.id !== id))} />
      <section className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(19,94,216,0.18),transparent_30%),linear-gradient(180deg,#eef3ff_0%,#f8fbff_48%,#ffffff_100%)] px-4 py-8">
        {showSuccessOverlay ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-md">
            <div className="w-full max-w-lg rounded-[2rem] border border-emerald-200 bg-white p-10 text-center shadow-[0_40px_100px_rgba(15,23,42,0.25)] animate-[fadeIn_0.35s_ease-out]">
              <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-emerald-100 text-5xl text-emerald-600 shadow-[0_18px_45px_rgba(16,185,129,0.28)]">
                {"\u2713"}
              </div>
              <h2 className="mt-6 text-3xl font-semibold text-slate-950">Face Registered Successfully</h2>
              <p className="mt-3 text-sm text-slate-600">Your face is registered and attendance scan can now use it.</p>
            </div>
          </div>
        ) : null}
        {isMobileUnsafeCameraContext() ? (
          <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            Camera may not work properly on non-secure connection.
          </div>
        ) : null}
        {cameraOpen ? (
          <div className="fixed inset-0 z-40 bg-slate-950">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              onLoadedMetadata={handleReady}
              onLoadedData={handleReady}
              onCanPlay={handleReady}
              className="h-full w-full object-cover"
            />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6">
              <div className="relative h-[62vh] w-full max-w-sm rounded-[2.5rem] border-[3px] border-emerald-400 shadow-[0_0_0_9999px_rgba(2,6,23,0.52)]">
                <div className="absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-emerald-300/90" />
                <div className="absolute left-1/2 top-8 h-[72%] w-0.5 -translate-x-1/2 bg-emerald-300/90" />
              </div>
            </div>
            <div className="absolute inset-x-0 top-0 flex items-center justify-between px-5 py-5 text-white">
              <div className="rounded-full bg-black/35 px-3 py-1 text-xs font-semibold backdrop-blur">
                {videoReady ? "Camera ready" : "Opening camera..."}
              </div>
              <button
                type="button"
                onClick={handleCloseCamera}
                className="rounded-full bg-black/35 px-4 py-2 text-sm font-semibold backdrop-blur"
              >
                Close
              </button>
            </div>
            <div className="absolute inset-x-0 bottom-0 rounded-t-[2rem] bg-[linear-gradient(180deg,rgba(15,23,42,0.1),rgba(15,23,42,0.92))] px-4 pb-8 pt-6 text-white">
              <div className="mx-auto max-w-md">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">Instruction</p>
                <p className="mt-2 text-2xl font-semibold">{isSubmitting ? "Registering face..." : activeStep.title}</p>
                <p className="mt-2 text-sm text-slate-300">{activeStep.hint}</p>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={captureCurrentStep}
                    disabled={!cameraOpen || isSubmitting || alreadyRegistered}
                    className="min-h-[52px] rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-semibold disabled:opacity-50"
                  >
                    Capture
                  </button>
                  <button
                    type="button"
                    onClick={submitFace}
                    disabled={!cameraOpen || capturedFrames.filter(Boolean).length !== CAPTURE_STEPS.length || isSubmitting || alreadyRegistered}
                    className="min-h-[52px] rounded-2xl bg-[#135ed8] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {isSubmitting ? "Registering..." : "Register Face"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
        <div className="mx-auto w-full max-w-6xl">
          <div className="mb-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-blue-700 shadow-sm backdrop-blur">
              Face Onboarding
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">Quick face registration for attendance access</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">Capture front, left, and right face angles to finish setup and continue to your dashboard.</p>
          </div>

          <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-[2rem] border border-white/70 bg-white/85 p-5 shadow-[0_30px_80px_rgba(15,23,42,0.10)] backdrop-blur-xl">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Step {Math.min(activeStepIndex + 1, CAPTURE_STEPS.length)} / {CAPTURE_STEPS.length}</p>
                  <h2 className="mt-2 text-2xl font-semibold text-slate-950">{activeStep.title}</h2>
                  <p className="mt-1 text-sm text-slate-600">{activeStep.hint}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-right">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Progress</p>
                  <p className="mt-1 text-3xl font-semibold text-slate-950">{progressPercent}%</p>
                </div>
              </div>

              <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-[linear-gradient(90deg,#135ed8,#36cfc9)] transition-all duration-300" style={{ width: `${progressPercent}%` }} />
              </div>

              <div className="mt-5 grid gap-3 sm:flex sm:flex-wrap">
                <button className="min-h-[48px] w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:border-slate-400 disabled:opacity-50 sm:w-auto" type="button" onClick={openCamera} disabled={cameraOpen || isCameraLaunching}>
                  {alreadyRegistered ? "Face Registered" : isCameraLaunching ? "Starting..." : cameraOpen ? "Camera Open" : "Open Camera"}
                </button>
                <button className="min-h-[48px] w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:border-slate-400 disabled:opacity-50 sm:w-auto" type="button" onClick={handleCloseCamera} disabled={!cameraOpen}>
                  Close Camera
                </button>
                <button className="min-h-[48px] w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:border-slate-400 disabled:opacity-60 sm:w-auto" type="button" onClick={captureCurrentStep} disabled={!cameraOpen || isSubmitting || alreadyRegistered}>
                  Capture {activeStep.title}
                </button>
                <button className="min-h-[48px] w-full rounded-2xl bg-[#135ed8] px-4 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(19,94,216,0.25)] transition hover:bg-[#0f51bc] disabled:opacity-60 sm:w-auto" type="button" onClick={submitFace} disabled={!cameraOpen || capturedFrames.filter(Boolean).length !== CAPTURE_STEPS.length || isSubmitting || alreadyRegistered}>
                  {isSubmitting ? "Registering..." : "Complete Registration"}
                </button>
                {allowBypass ? <button className="hidden min-h-[48px] w-full rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700 disabled:opacity-50 sm:w-auto" type="button" onClick={continueWithBypass} disabled={isSubmitting}>Manual Access</button> : null}
                {devMode ? <button className="hidden min-h-[48px] w-full rounded-2xl border border-green-300 bg-green-50 px-4 py-3 text-sm font-semibold text-green-700 disabled:opacity-50 sm:w-auto" type="button" onClick={skipFaceRegistration} disabled={isSubmitting}>Skip in Dev</button> : null}
                <button className="min-h-[48px] w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 sm:w-auto" type="button" onClick={() => {
                  setCapturedFrames(Array(CAPTURE_STEPS.length).fill(""));
                  setActiveStepIndex(0);
                  setStatusTag(cameraOpen ? "capture" : "idle");
                  setMessage("Capture front, left, and right face angles again.");
                }}>
                  Retry
                </button>
              </div>

              {!cameraOpen ? (
                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  Camera opens in fullscreen mode for proper face alignment.
                </div>
              ) : null}
              {cameraOpen ? null : (
                <div className="mt-5 mx-auto flex w-full max-w-md items-center justify-center rounded-[1.75rem] border border-slate-200 bg-slate-100 px-6 py-12 text-center sm:max-w-none">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Camera preview will appear here</p>
                    <p className="mt-2 text-sm text-slate-600">Tap <span className="font-semibold">Open Camera</span> and allow permission to continue face registration.</p>
                  </div>
                </div>
              )}
              <canvas ref={canvasRef} className="hidden" />
              {lowLightWarning ? (
                <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                  {lowLightWarning}
                </div>
              ) : null}

              <div className="mt-5 grid gap-3 md:grid-cols-1">
                {CAPTURE_STEPS.map((step, index) => {
                  const captured = Boolean(capturedFrames[index]);
                  return (
                    <div key={step.id} className={`overflow-hidden rounded-[1.5rem] border text-sm ${captured ? "border-emerald-200 bg-emerald-50 text-emerald-900" : index === activeStepIndex ? "border-blue-200 bg-blue-50 text-blue-900" : "border-slate-200 bg-slate-50 text-slate-600"}`}>
                      <div className="p-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-70">{index + 1}/{CAPTURE_STEPS.length}</p>
                        <p className="mt-2 font-semibold">{step.title}</p>
                        <p className="mt-1 text-xs">{captured ? "Captured successfully" : step.hint}</p>
                      </div>
                      <div className="border-t border-black/5 bg-white/50 p-2">
                        {capturedFrames[index] ? (
                          <div className="relative h-40 w-full overflow-hidden rounded-xl bg-slate-950/5">
                            <Image src={capturedFrames[index]} alt={step.title} fill unoptimized className="object-contain" />
                            <div className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-sm font-bold text-white shadow-sm transition duration-200">
                              {"\u2713"}
                            </div>
                          </div>
                        ) : (
                          <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-current/20 bg-white/60 text-xs font-medium opacity-70">
                            Waiting for capture
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-5">
              <div className="rounded-[2rem] border border-white/70 bg-white/85 p-5 shadow-[0_25px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Checklist</p>
                <div className="mt-4 space-y-3">
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-sm font-semibold text-slate-900">1. Three-angle capture</p>
                    <p className="mt-1 text-sm text-slate-600">Capture front, left, and right face angles clearly before submitting.</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-sm font-semibold text-slate-900">2. Camera stability</p>
                    <p className="mt-1 text-sm text-slate-600">Keep your face centered, avoid blur, and use decent lighting.</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-sm font-semibold text-slate-900">3. Duplicate lock</p>
                    <p className="mt-1 text-sm text-slate-600">If your face already matches another account, registration is rejected immediately.</p>
                  </div>
                </div>
              </div>

              <div className="rounded-[2rem] border border-white/70 bg-white/85 p-5 shadow-[0_25px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Live Status</p>
                    <p className="mt-2 text-lg font-semibold text-slate-950">{message}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    statusTag === "success"
                      ? "bg-emerald-100 text-emerald-700"
                      : statusTag === "retry" || statusTag === "camera"
                        ? "bg-amber-100 text-amber-700"
                        : statusTag === "verifying"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-slate-100 text-slate-600"
                  }`}>
                    {statusTag === "success" ? "Verified" : statusTag === "retry" ? "Retry" : statusTag === "camera" ? "Camera" : statusTag === "verifying" ? "Verifying" : "Ready"}
                  </span>
                </div>

                <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">{message}</div>
                <div className="mt-3 rounded-2xl border border-slate-200 bg-white/80 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${confidenceUi.tone}`}>{confidenceUi.label}</span>
                    <span className="text-xs font-semibold text-slate-500">Verification</span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className={`h-full rounded-full transition-all duration-300 ${confidenceUi.bar}`} style={{ width: `${confidenceUi.progress}%` }} />
                  </div>
                </div>
                {isSubmitting ? (
                  <div className="mt-3 flex items-center gap-3 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-blue-100 text-lg animate-pulse">
                      {"\u25CE"}
                    </span>
                    <span>Registering your face</span>
                  </div>
                ) : null}
                <p className="mt-3 text-xs text-slate-500">Mobile support: open camera from the button, keep browser permission enabled, and stay on HTTPS or localhost for camera access.</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </ProtectedRoute>
  );
}
