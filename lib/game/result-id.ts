import type { CompetitionMode } from "@/lib/game/types";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isResultUuid(value: string): boolean {
  return uuidPattern.test(value);
}

function uuidFromDigest(digest: ArrayBuffer): string {
  const bytes = new Uint8Array(digest.slice(0, 16));
  // RFC 9562 UUIDv8: application-defined digest with the standard variant.
  bytes[6] = (bytes[6] & 0x0f) | 0x80;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20)
  ].join("-");
}

/**
 * Turn a browser Mini League identifier into a database-safe, account-scoped
 * UUID. Returning UUID inputs unchanged makes retries and legacy-schema writes
 * idempotent before and after migration 0009.
 */
export async function canonicalAccountRunId(
  profileId: string,
  competitionMode: CompetitionMode,
  runId: string
): Promise<string> {
  const normalized = runId.trim();
  if (competitionMode === "invincible" || isResultUuid(normalized)) {
    return normalized.toLowerCase();
  }
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`footyrush:minileague:${profileId}:${normalized}`)
  );
  return uuidFromDigest(digest);
}
