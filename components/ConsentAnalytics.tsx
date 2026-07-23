"use client";

import { Analytics } from "@vercel/analytics/react";
import { useEffect, useState } from "react";
import {
  analyticsConsentEvent,
  readAnalyticsConsent,
  type AnalyticsConsent
} from "@/lib/analytics/events";

/**
 * Vercel Analytics is loaded only after an explicit gameplay-analytics opt-in.
 * The same preference also controls FootyRush's first-party gameplay events.
 */
export function ConsentAnalytics() {
  const [consent, setConsent] = useState<AnalyticsConsent>("unknown");

  useEffect(() => {
    setConsent(readAnalyticsConsent());
    const onConsent = (event: Event) => {
      const value = (event as CustomEvent<AnalyticsConsent>).detail;
      if (value === "granted" || value === "denied") {
        setConsent(value);
      }
    };
    window.addEventListener(analyticsConsentEvent, onConsent);
    return () => window.removeEventListener(analyticsConsentEvent, onConsent);
  }, []);

  return consent === "granted" ? <Analytics /> : null;
}
