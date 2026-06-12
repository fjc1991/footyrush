import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const cookieName = "footyrush_guest_played";

function requestIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "local-dev"
  );
}

function hashIp(ip: string): string {
  const salt = process.env.FOOTYRUSH_IP_HASH_SALT || "local-footyrush-dev";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

export function GET(request: NextRequest) {
  const playedHash = request.cookies.get(cookieName)?.value;
  const currentHash = hashIp(requestIp(request));
  const played = playedHash === currentHash;
  return NextResponse.json({ allowed: !played, played });
}

export function POST(request: NextRequest) {
  const response = NextResponse.json({ ok: true, allowed: false });
  response.cookies.set(cookieName, hashIp(requestIp(request)), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365
  });
  return response;
}
