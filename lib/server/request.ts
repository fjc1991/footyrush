import { createHash } from "node:crypto";
import { getServerEnv } from "@/lib/server/env";

/**
 * Best-effort client IP extraction. `x-forwarded-for` is client-spoofable (its leftmost entry is
 * whatever the caller sent), so we trust the platform-set `x-real-ip` first — on Vercel that is the
 * true edge-observed client IP. Only fall back to the leftmost XFF hop, then a stable dev sentinel.
 */
export function requestIp(request: Request): string {
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) {
    return realIp;
  }
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }
  return "local-dev";
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
