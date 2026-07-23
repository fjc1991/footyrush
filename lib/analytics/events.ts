export const productEventNames = [
  "app_open",
  "analytics_consent_granted",
  "mode_selected",
  "manager_shuffled",
  "draft_started",
  "draft_completed",
  "match_completed",
  "competition_completed",
  "milestone_prompted",
  "milestone_shared"
] as const;

export type ProductEventName = (typeof productEventNames)[number];
export type AnalyticsConsent = "unknown" | "granted" | "denied";

export const analyticsConsentKey = "footyrush.analyticsConsent";
export const analyticsAnonymousIdKey = "footyrush.analyticsAnonymousId";
export const analyticsConsentEvent = "footyrush:analytics-consent";

const eventNameSet = new Set<string>(productEventNames);
const localeSet = new Set(["en", "es", "fr", "pt"]);
const propertyKeys = new Set([
  "competitionMode",
  "draftMode",
  "formationId",
  "managerRating",
  "matchday",
  "outcome",
  "points",
  "finalPosition",
  "goalDifference",
  "unbeaten",
  "officialAward",
  "milestone",
  "source"
]);

export interface ProductEventPayload {
  eventName: ProductEventName;
  anonymousId: string;
  locale: string;
  properties: Record<string, string | number | boolean>;
}

export function isProductEventName(value: unknown): value is ProductEventName {
  return typeof value === "string" && eventNameSet.has(value);
}

export function isAnalyticsAnonymousId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

export function normalizeAnalyticsLocale(value: unknown): string {
  return typeof value === "string" && localeSet.has(value) ? value : "en";
}

/**
 * Analytics properties are intentionally allowlisted. This prevents future
 * callers from accidentally sending names, email addresses, X profile data,
 * free-form text, or full gameplay payloads to the product-events table.
 */
export function normalizeAnalyticsProperties(
  value: unknown
): Record<string, string | number | boolean> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const normalized: Record<string, string | number | boolean> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!propertyKeys.has(key)) {
      continue;
    }
    if (typeof raw === "boolean") {
      normalized[key] = raw;
    } else if (typeof raw === "number" && Number.isFinite(raw)) {
      normalized[key] = Math.max(-10000, Math.min(10000, Math.round(raw * 100) / 100));
    } else if (typeof raw === "string" && raw.length <= 48 && /^[\w .:+-]+$/u.test(raw)) {
      normalized[key] = raw;
    }
  }
  return normalized;
}

export function readAnalyticsConsent(): AnalyticsConsent {
  if (typeof window === "undefined") {
    return "unknown";
  }
  const value = window.localStorage.getItem(analyticsConsentKey);
  return value === "granted" || value === "denied" ? value : "unknown";
}

export function writeAnalyticsConsent(value: Exclude<AnalyticsConsent, "unknown">): void {
  window.localStorage.setItem(analyticsConsentKey, value);
  window.dispatchEvent(new CustomEvent(analyticsConsentEvent, { detail: value }));
}

export function getOrCreateAnalyticsAnonymousId(): string {
  const current = window.localStorage.getItem(analyticsAnonymousIdKey);
  if (isAnalyticsAnonymousId(current)) {
    return current;
  }
  const next = window.crypto.randomUUID();
  window.localStorage.setItem(analyticsAnonymousIdKey, next);
  return next;
}
