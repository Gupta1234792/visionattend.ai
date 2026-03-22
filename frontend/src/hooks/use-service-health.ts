"use client";

import { useCallback, useEffect, useState } from "react";

type HealthState = {
  backend: { ok: boolean; message: string };
  mongo: { ok: boolean; message: string; readyState?: number };
  opencv: { ok: boolean; message: string; healthUrl?: string | null };
};

const defaultState: HealthState = {
  backend: { ok: false, message: "Checking backend..." },
  mongo: { ok: false, message: "Checking MongoDB..." },
  opencv: { ok: false, message: "Checking OpenCV..." },
};

export function useServiceHealth(fetcher: (input: string) => Promise<unknown>) {
  const [health, setHealth] = useState<HealthState>(defaultState);
  const [loading, setLoading] = useState(true);

  const loadHealth = useCallback(async () => {
    try {
      const result = (await fetcher("/health/stack")) as {
        backend?: HealthState["backend"];
        mongo?: HealthState["mongo"];
        opencv?: HealthState["opencv"];
      };

      setHealth({
        backend: result?.backend || defaultState.backend,
        mongo: result?.mongo || defaultState.mongo,
        opencv: result?.opencv || defaultState.opencv,
      });
    } catch {
      setHealth({
        backend: { ok: false, message: "Backend unreachable" },
        mongo: { ok: false, message: "MongoDB unreachable" },
        opencv: { ok: false, message: "OpenCV unreachable" },
      });
    } finally {
      setLoading(false);
    }
  }, [fetcher]);

  useEffect(() => {
    void loadHealth();
    const interval = window.setInterval(() => {
      void loadHealth();
    }, 30000);

    return () => window.clearInterval(interval);
  }, [loadHealth]);

  return { health, loading, refreshHealth: loadHealth };
}
