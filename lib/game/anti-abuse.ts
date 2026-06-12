const disposableDomains = new Set([
  "10minutemail.com",
  "guerrillamail.com",
  "mailinator.com",
  "tempmail.com",
  "temp-mail.org",
  "yopmail.com",
  "sharklasers.com",
  "getnada.com",
  "trashmail.com",
  "dispostable.com",
  "fakeinbox.com",
  "maildrop.cc"
]);

const commonConsumerDomains = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "yahoo.com",
  "proton.me",
  "protonmail.com",
  "aol.com"
]);

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function emailDomain(email: string): string {
  return normalizeEmail(email).split("@")[1] ?? "";
}

export function validateEmailFormat(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}

export function isDisposableDomain(domain: string): boolean {
  return disposableDomains.has(domain.replace(/^www\./, ""));
}

export function isCommonConsumerDomain(domain: string): boolean {
  return commonConsumerDomains.has(domain);
}

/**
 * Restrict a post-auth redirect target to a local path. Rejects absolute URLs,
 * protocol-relative URLs ("//evil.com") and backslash variants the URL parser
 * treats as slashes ("/\evil.com").
 */
export function sanitizeNextPath(next: string | null, fallback = "/en"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) {
    return fallback;
  }
  return next;
}

export function getEmailRisk(email: string): { ok: boolean; reason?: string; domain: string; requiresMx: boolean } {
  const normalized = normalizeEmail(email);
  const domain = emailDomain(normalized);
  if (!validateEmailFormat(normalized)) {
    return { ok: false, reason: "Enter a valid email address.", domain, requiresMx: false };
  }
  if (isDisposableDomain(domain)) {
    return { ok: false, reason: "Temporary email domains are not allowed for private beta access.", domain, requiresMx: false };
  }
  return { ok: true, domain, requiresMx: !isCommonConsumerDomain(domain) };
}
