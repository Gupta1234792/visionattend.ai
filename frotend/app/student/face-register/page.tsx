"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import api from "@/src/services/api";
import { ProtectedRoute } from "@/src/components/protected-route";

export default function StudentFaceRegisterPage() {
  const router = useRouter();
  const [message, setMessage] = useState("Register your face to continue.");
  const [cameraOpen, setCameraOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

const getCameraErrorMessage = (error: unknown) => {
  const name = (error as { name?: string })?.name || "";
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "Camera not detected. Please connect a webcam.";
  }
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "Camera permission denied. Allow camera access in browser settings.";
  }
  return "Unable to access camera.";
};

  const showAlert = (text: string) => {
    setMessage(text);
    if (typeof window !== "undefined") {
      window.alert(text);
    }
  };

  const openCamera = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showAlert("Camera not detected. Please connect a webcam.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCameraOpen(true);
    } catch (error) {
      showAlert(getCameraErrorMessage(error));
    }
  };

  const closeCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraOpen(false);
  };

  const captureImage = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return "";
    if (!cameraOpen || !video.videoWidth || !video.videoHeight) return "";

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85);
  };

  const submitFace = async () => {
    try {
      if (!cameraOpen) {
        showAlert("Camera is required for face registration. Please open camera first.");
        return;
      }

      const image = captureImage();
      if (!image) {
        showAlert("No live face frame detected. Open camera and try again.");
        return;
      }

      const res = await api.post("/students/face-register", { image });

      if (res.data?.faceRegistered) {
        const rawUser = localStorage.getItem("va_user");
        if (rawUser) {
          const parsed = JSON.parse(rawUser);
          parsed.faceRegistered = true;
          localStorage.setItem("va_user", JSON.stringify(parsed));
        }
        setMessage("Face registration completed.");
        closeCamera();
        router.push("/student");
        return;
      }

      setMessage(res.data?.message || "Face submitted. Waiting for OpenCV verification.");
    } catch (error) {
      const apiMessage = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      showAlert(apiMessage || "Face registration failed.");
    }
  };

  return (
    <ProtectedRoute allow={["student"]}>
      <section className="flex min-h-screen items-center justify-center bg-[#eef3ff] p-4">
        <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h1 className="text-lg font-semibold">First-Time Face Registration</h1>
          <p className="mt-1 text-sm text-slate-600">Camera image is sent to backend for registration workflow.</p>

          <div className="mt-3 flex flex-wrap gap-2">
            <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm" type="button" onClick={openCamera}>Open Camera</button>
            <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm" type="button" onClick={closeCamera}>Close Camera</button>
            <button className="rounded-lg bg-[#135ed8] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60" type="button" onClick={submitFace} disabled={!cameraOpen}>Register Face</button>
          </div>

          {cameraOpen && <video ref={videoRef} autoPlay playsInline muted className="mt-3 w-full rounded-lg border border-slate-200" />}
          <canvas ref={canvasRef} className="hidden" />

          <div className="mt-4 rounded-lg bg-slate-100 p-3 text-sm text-slate-700">{message}</div>
        </div>
      </section>
    </ProtectedRoute>
  );
}
