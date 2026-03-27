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

const fallbackConstraintsList: MediaStreamConstraints[] = [
  defaultConstraints,
  {
    video: {
      facingMode: "user",
      width: { ideal: 720 },
      height: { ideal: 1280 },
    },
    audio: false,
  },
  {
    video: true,
    audio: false,
  },
];

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
      const constraintsToTry = options?.constraints
        ? [options.constraints, ...fallbackConstraintsList]
        : fallbackConstraintsList;

      let stream: MediaStream | null = null;
      let lastError: unknown = null;

      for (const constraints of constraintsToTry) {
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraints);
          if (stream) {
            break;
          }
        } catch (error) {
          lastError = error;
        }
      }

      if (!stream) {
        throw lastError || new Error("Unable to access camera.");
      }

      if (!mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return { success: false, message: "Camera closed before ready." };
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.muted = true;
        videoRef.current.autoplay = true;
        videoRef.current.playsInline = true;
        videoRef.current.setAttribute("playsinline", "true");
        videoRef.current.setAttribute("muted", "true");
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

    const sourceWidth = video.videoWidth || 640;
    const sourceHeight = video.videoHeight || 480;
    const cropWidth = Math.floor(sourceWidth * 0.58);
    const cropHeight = Math.floor(sourceHeight * 0.78);
    const cropX = Math.max(0, Math.floor((sourceWidth - cropWidth) / 2));
    const cropY = Math.max(0, Math.floor((sourceHeight - cropHeight) / 2));

    canvas.width = cropWidth;
    canvas.height = cropHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return "";
    }

    ctx.drawImage(
      video,
      cropX,
      cropY,
      cropWidth,
      cropHeight,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    return canvas.toDataURL("image/jpeg", 0.85);
  }, [isOpen]);

  const handleReady = useCallback(() => {
    setIsReady(true);
  }, []);

  useEffect(() => {
    const attachStream = async () => {
      if (!isOpen || !streamRef.current || !videoRef.current) {
        return;
      }

      const video = videoRef.current;
      if (video.srcObject !== streamRef.current) {
        video.muted = true;
        video.autoplay = true;
        video.playsInline = true;
        video.setAttribute("playsinline", "true");
        video.setAttribute("muted", "true");
        video.srcObject = streamRef.current;
      }

      await video.play().catch(() => null);
    };

    void attachStream();
  }, [isOpen]);

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
