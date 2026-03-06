"use client";

export type DetectLocationResult = {
  latitude: number;
  longitude: number;
  accuracy: number;
  source: "gps-sample" | "gps-watch";
};

type GeolocationErrorDetails = {
  code: number;
  rawMessage: string;
  friendly: string;
};

const GEO_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 15000,
  maximumAge: 0,
};

export function formatGeolocationError(error: unknown): GeolocationErrorDetails {
  const geoError = error as GeolocationPositionError | { code?: number; message?: string };
  const code = Number(geoError?.code || 0);
  const rawMessage = String(geoError?.message || "Unknown geolocation error");
  let friendly = "Unknown location error.";

  if (code === 1) {
    friendly = "Permission denied. Allow Location in browser and Windows settings.";
  } else if (code === 2) {
    friendly = "Location unavailable. Turn on device location services and retry.";
  } else if (code === 3) {
    friendly = "Location request timed out. Move near a window or outdoors and retry.";
  }

  return { code, rawMessage, friendly };
}

function readPositionOnce() {
  return new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, GEO_OPTIONS);
  });
}

function readPositionFromWatch(timeoutMs = 20000) {
  return new Promise<GeolocationPosition>((resolve, reject) => {
    const startedAt = Date.now();
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        if (position.coords.accuracy <= 120 || Date.now() - startedAt > timeoutMs / 2) {
          navigator.geolocation.clearWatch(watchId);
          resolve(position);
        }
      },
      (error) => {
        navigator.geolocation.clearWatch(watchId);
        reject(error);
      },
      GEO_OPTIONS
    );

    setTimeout(() => {
      navigator.geolocation.clearWatch(watchId);
      reject({ code: 3, message: "Watch position timed out" });
    }, timeoutMs);
  });
}

export async function detectPreciseLocation(): Promise<DetectLocationResult> {
  if (!navigator.geolocation) {
    throw new Error("Geolocation is not supported in this browser.");
  }

  const samples: GeolocationPosition[] = [];
  let lastError: unknown = null;

  for (let i = 0; i < 2; i += 1) {
    try {
      const position = await readPositionOnce();
      samples.push(position);
    } catch (error) {
      lastError = error;
      const details = formatGeolocationError(error);
      console.error("Geolocation sample failed:", {
        attempt: i + 1,
        code: details.code,
        message: details.rawMessage,
      });
    }
  }

  if (samples.length) {
    const best = samples.reduce((prev, current) =>
      current.coords.accuracy < prev.coords.accuracy ? current : prev
    );

    if (best.coords.accuracy <= 1500) {
      return {
        latitude: Number(best.coords.latitude),
        longitude: Number(best.coords.longitude),
        accuracy: Number(best.coords.accuracy),
        source: "gps-sample",
      };
    }
  }

  try {
    const watched = await readPositionFromWatch();
    return {
      latitude: Number(watched.coords.latitude),
      longitude: Number(watched.coords.longitude),
      accuracy: Number(watched.coords.accuracy),
      source: "gps-watch",
    };
  } catch (error) {
    const details = formatGeolocationError(error);
    console.error("Geolocation final error:", {
      code: details.code,
      message: details.rawMessage,
      error,
    });
    throw error || lastError || new Error("Unable to detect location");
  }
}
