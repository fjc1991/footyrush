import { describe, expect, it } from "vitest";
import {
  isAnalyticsAnonymousId,
  isProductEventName,
  normalizeAnalyticsLocale,
  normalizeAnalyticsProperties
} from "@/lib/analytics/events";

describe("privacy-conscious product analytics", () => {
  it("accepts only the documented event vocabulary", () => {
    expect(isProductEventName("competition_completed")).toBe(true);
    expect(isProductEventName("email_captured")).toBe(false);
    expect(isProductEventName("arbitrary_event")).toBe(false);
  });

  it("requires an anonymous UUID rather than a fingerprint", () => {
    expect(isAnalyticsAnonymousId("bdfddc5f-02e2-4eb0-8f72-fbe71977a76f")).toBe(true);
    expect(isAnalyticsAnonymousId("192.0.2.1")).toBe(false);
  });

  it("drops sensitive and free-form properties", () => {
    expect(
      normalizeAnalyticsProperties({
        competitionMode: "invincible",
        points: 97,
        unbeaten: true,
        email: "manager@example.com",
        xHandle: "@manager",
        notes: "free form",
        playerNames: ["A", "B"]
      })
    ).toEqual({
      competitionMode: "invincible",
      points: 97,
      unbeaten: true
    });
  });

  it("normalizes unsupported locales", () => {
    expect(normalizeAnalyticsLocale("fr")).toBe("fr");
    expect(normalizeAnalyticsLocale("de")).toBe("en");
  });
});
