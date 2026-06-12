import { describe, expect, it } from "vitest";
import { getEmailRisk, sanitizeNextPath } from "@/lib/game/anti-abuse";

describe("email risk checks", () => {
  it("allows common consumer domains without MX lookup", () => {
    expect(getEmailRisk("manager@gmail.com")).toEqual({
      ok: true,
      domain: "gmail.com",
      requiresMx: false
    });
  });

  it("blocks disposable domains", () => {
    const risk = getEmailRisk("x@mailinator.com");
    expect(risk.ok).toBe(false);
  });
});

describe("auth redirect sanitizer", () => {
  it("keeps local paths", () => {
    expect(sanitizeNextPath("/es")).toBe("/es");
    expect(sanitizeNextPath("/en?welcome=1")).toBe("/en?welcome=1");
  });

  it("rejects open-redirect attempts", () => {
    expect(sanitizeNextPath("https://evil.com")).toBe("/en");
    expect(sanitizeNextPath("//evil.com")).toBe("/en");
    expect(sanitizeNextPath("/\\evil.com")).toBe("/en");
    expect(sanitizeNextPath(null)).toBe("/en");
    expect(sanitizeNextPath("")).toBe("/en");
  });
});
