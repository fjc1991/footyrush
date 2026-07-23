import { describe, expect, it } from "vitest";
import { createXOAuthCredentials } from "@/lib/auth/x-oauth";

describe("X OAuth credentials", () => {
  it("uses Supabase's X provider literal", () => {
    expect(createXOAuthCredentials("https://footyrush.example", "en")).toEqual({
      provider: "x",
      options: {
        redirectTo: "https://footyrush.example/en"
      }
    });
  });

  it.each(["en", "es", "fr", "pt"])("creates a safe %s locale return URL", (locale) => {
    expect(createXOAuthCredentials("https://footyrush.example", locale).options.redirectTo).toBe(
      `https://footyrush.example/${locale}`
    );
  });

  it("normalizes a trailing slash on the origin", () => {
    expect(
      createXOAuthCredentials("https://footyrush.example/", "fr").options.redirectTo
    ).toBe("https://footyrush.example/fr");
  });

  it.each(["de", "en/callback", "", null, undefined])(
    "falls back to English for the invalid locale %s",
    (locale) => {
      expect(
        createXOAuthCredentials("https://footyrush.example", locale).options.redirectTo
      ).toBe("https://footyrush.example/en");
    }
  );

  it("uses only the HTTP(S) origin when building the return URL", () => {
    expect(
      createXOAuthCredentials("https://footyrush.example/untrusted?next=elsewhere", "pt").options
        .redirectTo
    ).toBe("https://footyrush.example/pt");

    expect(() => createXOAuthCredentials("javascript:alert(1)", "en")).toThrow(TypeError);
  });
});
