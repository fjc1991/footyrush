"use client";

import { useCallback, useEffect, useRef } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type RunMode = "minileague" | "invincible" | "exhibition";
type RunEvent = "run_started" | "draft_completed" | "match_completed" | "run_completed" | "run_abandoned";

async function bearerHeaders(): Promise<Record<string, string>> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return {};
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {};
}

async function postActivity(body: Record<string, unknown>) {
  try {
    await fetch("/api/account/activity", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await bearerHeaders()) },
      body: JSON.stringify(body),
      keepalive: true
    });
  } catch {
    // Account activity is durable telemetry but must never interrupt gameplay.
  }
}

export function useAccountActivity(
  profileId: string | null,
  locale: string
) {
  const visitRef = useRef<{ id: string; activeSeconds: number; lastSentAt: number } | null>(null);
  const lastInteractionRef = useRef(0);

  useEffect(() => {
    if (!profileId) return;
    const tabId = crypto.randomUUID();
    const visitKey = `footyrush.visit.v1.${profileId}`;
    const leaderKey = `footyrush.activityLeader.v1.${profileId}`;
    const now = Date.now();
    lastInteractionRef.current = now;
    let stored: { id: string; lastActivity: number; activeSeconds: number } | null = null;
    try {
      stored = JSON.parse(localStorage.getItem(visitKey) ?? "null");
    } catch {
      stored = null;
    }
    if (!stored?.id || now - Number(stored.lastActivity) > 30 * 60_000) {
      stored = { id: crypto.randomUUID(), lastActivity: now, activeSeconds: 0 };
    }
    visitRef.current = { id: stored.id, activeSeconds: Number(stored.activeSeconds) || 0, lastSentAt: now };
    localStorage.setItem(visitKey, JSON.stringify(stored));

    const deviceClass = window.innerWidth < 640 ? "mobile" : window.innerWidth < 1024 ? "tablet" : "desktop";
    const interact = () => {
      lastInteractionRef.current = Date.now();
      const visit = visitRef.current;
      if (visit) {
        localStorage.setItem(visitKey, JSON.stringify({
          id: visit.id,
          lastActivity: Date.now(),
          activeSeconds: visit.activeSeconds
        }));
      }
    };
    const isLeader = () => {
      let leader: { tabId?: string; expiresAt?: number } | null = null;
      try {
        leader = JSON.parse(localStorage.getItem(leaderKey) ?? "null");
      } catch {
        leader = null;
      }
      if (!leader?.tabId || Number(leader.expiresAt) < Date.now() || leader.tabId === tabId) {
        localStorage.setItem(leaderKey, JSON.stringify({ tabId, expiresAt: Date.now() + 75_000 }));
        return true;
      }
      return false;
    };
    const heartbeat = () => {
      const visit = visitRef.current;
      if (!visit || !isLeader()) return;
      const heartbeatAt = Date.now();
      if (document.visibilityState === "visible" && heartbeatAt - lastInteractionRef.current <= 5 * 60_000) {
        visit.activeSeconds += Math.min(60, Math.max(0, Math.round((heartbeatAt - visit.lastSentAt) / 1000)));
      }
      visit.lastSentAt = heartbeatAt;
      localStorage.setItem(visitKey, JSON.stringify({
        id: visit.id,
        lastActivity: heartbeatAt,
        activeSeconds: visit.activeSeconds
      }));
      void postActivity({
        kind: "visit",
        visitId: visit.id,
        activeSeconds: visit.activeSeconds,
        locale,
        deviceClass
      });
    };
    ["pointerdown", "keydown", "touchstart", "scroll"].forEach((event) =>
      window.addEventListener(event, interact, { passive: true })
    );
    const onVisibility = () => {
      if (document.visibilityState === "hidden") heartbeat();
      else interact();
    };
    document.addEventListener("visibilitychange", onVisibility);
    heartbeat();
    const interval = window.setInterval(heartbeat, 60_000);
    return () => {
      heartbeat();
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      ["pointerdown", "keydown", "touchstart", "scroll"].forEach((event) =>
        window.removeEventListener(event, interact)
      );
      try {
        const leader = JSON.parse(localStorage.getItem(leaderKey) ?? "null");
        if (leader?.tabId === tabId) localStorage.removeItem(leaderKey);
      } catch {
        // Ignore a corrupt cross-tab lease.
      }
    };
  }, [locale, profileId]);

  return useCallback((
    kind: RunEvent,
    mode: RunMode,
    runId: string,
    details: Record<string, unknown> = {}
  ) => {
    if (!profileId) return;
    void postActivity({ kind, mode, runId, ...details });
  }, [profileId]);
}
