import { getServerEnv } from "@/lib/server/env";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export interface TurnstileResult {
  /** Whether the token was accepted. */
  success: boolean;
  /** True when no secret is configured, so verification was skipped (dev/demo). */
  skipped: boolean;
  reason?: string;
}

/**
 * Verify a Cloudflare Turnstile token against the siteverify endpoint.
 *
 * When TURNSTILE_SECRET_KEY is unset we skip verification (success=true,
 * skipped=true) so local/demo flows are not blocked; callers can decide whether
 * to require a real check in production by inspecting `skipped`.
 */
export async function verifyTurnstile(token: string | undefined | null, remoteIp?: string): Promise<TurnstileResult> {
  const { turnstileSecretKey } = getServerEnv();
  if (!turnstileSecretKey) {
    return { success: true, skipped: true };
  }
  if (!token) {
    return { success: false, skipped: false, reason: "Missing captcha token." };
  }

  try {
    const form = new URLSearchParams();
    form.set("secret", turnstileSecretKey);
    form.set("response", token);
    if (remoteIp && remoteIp !== "local-dev") {
      form.set("remoteip", remoteIp);
    }
    const res = await fetch(VERIFY_URL, { method: "POST", body: form });
    const data = (await res.json().catch(() => ({}))) as { success?: boolean; ["error-codes"]?: string[] };
    if (data.success) {
      return { success: true, skipped: false };
    }
    return { success: false, skipped: false, reason: (data["error-codes"] ?? []).join(", ") || "Captcha verification failed." };
  } catch (error) {
    console.warn("[turnstile] verification error:", error);
    return { success: false, skipped: false, reason: "Captcha verification is temporarily unavailable." };
  }
}
