import { resolveMx } from "node:dns/promises";
import { NextResponse } from "next/server";
import { getEmailRisk, normalizeEmail } from "@/lib/game/anti-abuse";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { email?: string; captchaToken?: string };
  const email = normalizeEmail(body.email ?? "");
  const risk = getEmailRisk(email);

  if (!risk.ok) {
    return NextResponse.json({ ok: false, reason: risk.reason }, { status: 400 });
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
    captchaChecked: Boolean(process.env.TURNSTILE_SECRET_KEY && body.captchaToken)
  });
}
