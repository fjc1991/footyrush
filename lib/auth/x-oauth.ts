const SUPPORTED_OAUTH_LOCALES = new Set(["en", "es", "fr", "pt"]);

export interface XOAuthCredentials {
  provider: "x";
  options: {
    redirectTo: string;
  };
}

function safeLocale(locale: string | null | undefined) {
  return locale && SUPPORTED_OAUTH_LOCALES.has(locale) ? locale : "en";
}

function safeOrigin(origin: string) {
  let parsed: URL;

  try {
    parsed = new URL(origin.trim());
  } catch {
    throw new TypeError("A valid HTTP(S) origin is required for OAuth.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new TypeError("A valid HTTP(S) origin is required for OAuth.");
  }

  return parsed.origin;
}

export function createXOAuthCredentials(
  origin: string,
  locale: string | null | undefined
): XOAuthCredentials {
  return {
    provider: "x",
    options: {
      redirectTo: `${safeOrigin(origin)}/${safeLocale(locale)}`
    }
  };
}
