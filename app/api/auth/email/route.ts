import { resolveMx } from "node:dns/promises";
import { NextRequest, NextResponse } from "next/server";
import { getEmailRisk, normalizeEmail } from "@/lib/game/anti-abuse";
import { rateLimit, tooManyRequests } from "@/lib/server/rate-limit";
import { requestIp } from "@/lib/server/request";
import { verifyTurnstile } from "@/lib/server/turnstile";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const limit = await rateLimit(request, "auth-email", { limit: 5, window: "1 m" });
  if (!limit.success) {
    return tooManyRequests(limit);
  }

  const body = (await request.json().catch(() => ({}))) as { email?: string; captchaToken?: string };
  const email = normalizeEmail(body.email ?? "");
  const risk = getEmailRisk(email);

  if (!risk.ok) {
    return NextResponse.json({ ok: false, reason: risk.reason }, { status: 400 });
  }

  // Actually verify the Turnstile token (no-op only when no secret is set).
  const captcha = await verifyTurnstile(body.captchaToken, requestIp(request));
  if (!captcha.success) {
    return NextResponse.json({ ok: false, reason: captcha.reason ?? "Captcha verification failed." }, { status: 400 });
  }

  if (risk.requiresMx) {
    try {
      const mx = await resolveMx(risk.domain);
      if (mx.length === 0) {
        return NextResponse.json({ ok: false, reason: "That domain cannot receive login email." }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ ok: false, reason: "That domain could not be verified." }, { status: 400 });
    }
  }

  return NextResponse.json({
    ok: true,
    email,
    captchaChecked: !captcha.skipped
  });
}
