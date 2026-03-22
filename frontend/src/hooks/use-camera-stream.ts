"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type UseCameraStreamOptions = {
  constraints?: MediaStreamConstraints;
};

const defaultConstraints: MediaStreamConstraints = {
  video: {
    facingMode: { ideal: "user" },
    width: { ideal: 960 },
    height: { ideal: 540 },
    frameRate: { ideal: 24, max: 30 },
  },
  audio: false,
};

export const getCameraErrorMessage = (error: unknown) => {
  const name = (error as { name?: string })?.name || "";

  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "Camera stream not available on this device.";
  }
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "Camera permission denied. Allow camera access in browser settings.";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "Camera is busy in another app. Close that app and retry.";
  }
  if (typeof window !== "undefined" && !window.isSecureContext) {
    return "Live camera is blocked on HTTP mobile URL. Open the app on HTTPS.";
  }

  return "Unable to access camera.";
};

export function useCameraStream(options?: UseCameraStreamOptions) {
  const [isOpen, setIsOpen] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mountedRef = useRef(true);
  const openingRef = useRef(false);

  const closeCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsOpen(false);
    setIsReady(false);
  }, []);

  const openCamera = useCallback(async () => {
    if (openingRef.current || isOpen) {
      return { success: true, message: "" };
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return {
        success: false,
        message: "Camera API not available on this device/browser.",
      };
    }

    try {
      openingRef.current = true;
      closeCamera();

      const stream = await navigator.mediaDevices.getUserMedia(
        options?.constraints || defaultConstraints,
      );

      if (!mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return { success: false, message: "Camera closed before ready." };
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => null);
      }

      setIsOpen(true);
      setIsReady(false);
      return { success: true, message: "" };
    } catch (error) {
      closeCamera();
      return { success: false, message: getCameraErrorMessage(error) };
    } finally {
      openingRef.current = false;
    }
  }, [closeCamera, isOpen, options?.constraints]);

  const captureFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas || !isOpen || !video.videoWidth || !video.videoHeight) {
      return "";
    }

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return "";
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85);
  }, [isOpen]);

  const handleReady = useCallback(() => {
    setIsReady(true);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      closeCamera();
    };
  }, [closeCamera]);

  return {
    videoRef,
    canvasRef,
    isOpen,
    isReady,
    openCamera,
    closeCamera,
    captureFrame,
    handleReady,
  };
}
