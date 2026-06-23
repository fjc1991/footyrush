import { createHash } from "node:crypto";
import { getServerEnv } from "@/lib/server/env";

/**
 * Best-effort client IP extraction. Behind Vercel the first x-forwarded-for hop
 * is the real client; we fall back to a stable dev sentinel locally.
 */
export function requestIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }
  return request.headers.get("x-real-ip") || "local-dev";
}

/** Salted SHA-256 of an IP. Salt is required (no public fallback) in production. */
export function hashIp(ip: string): string {
  const { ipHashSalt } = getServerEnv();
  return createHash("sha256").update(`${ipHashSalt}:${ip}`).digest("hex");
}

/** Convenience: hashed IP for the current request. */
export function requestIpHash(request: Request): string {
  return hashIp(requestIp(request));
}
