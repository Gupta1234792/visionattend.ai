"use client";

import { useState } from "react";
import { useAppContext } from "@/components/app-context";

type HttpMethod = "GET" | "POST" | "PATCH";

type EndpointTesterProps = {
  title: string;
  method: HttpMethod;
  path: string;
  requiresAuth?: boolean;
  includeOpenCvKey?: boolean;
  bodyTemplate?: Record<string, unknown>;
};

const pretty = (value: unknown) => JSON.stringify(value, null, 2);

export function EndpointTester({
  title,
  method,
  path,
  requiresAuth = true,
  includeOpenCvKey = false,
  bodyTemplate,
}: EndpointTesterProps) {
  const { apiBaseUrl, token, opencvKey } = useAppContext();
  const [endpointPath, setEndpointPath] = useState(path);
  const [bodyText, setBodyText] = useState(bodyTemplate ? pretty(bodyTemplate) : "{}");
  const [responseText, setResponseText] = useState("");
  const [loading, setLoading] = useState(false);

  const onSend = async () => {
    setLoading(true);
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (requiresAuth && token) {
        headers.Authorization = `Bearer ${token}`;
      }
      if (includeOpenCvKey && opencvKey) {
        headers["x-opencv-key"] = opencvKey;
      }

      let body: string | undefined;
      if (method !== "GET") {
        const parsed = JSON.parse(bodyText);
        body = JSON.stringify(parsed);
      }

      const res = await fetch(`${apiBaseUrl}${endpointPath}`, {
        method,
        headers,
        body,
      });

      const data = await res.json();
      setResponseText(pretty({ status: res.status, data }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setResponseText(pretty({ error: message }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="rounded-xl border border-line bg-panel p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-base font-semibold">{title}</h3>
        <span className="rounded-md bg-slate-900 px-2 py-0.5 text-xs text-white">{method}</span>
      </div>
      <input
        className="mt-3 w-full rounded-lg border border-line bg-white px-3 py-2 font-mono text-xs"
        value={endpointPath}
        onChange={(e) => setEndpointPath(e.target.value)}
      />
      {method !== "GET" && (
        <textarea
          className="mt-3 h-28 w-full rounded-lg border border-line bg-white p-3 font-mono text-xs"
          value={bodyText}
          onChange={(e) => setBodyText(e.target.value)}
        />
      )}
      <button
        type="button"
        onClick={onSend}
        disabled={loading}
        className="mt-3 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {loading ? "Sending..." : "Send Request"}
      </button>
      <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">
        {responseText || "Response will appear here"}
      </pre>
    </section>
  );
}
