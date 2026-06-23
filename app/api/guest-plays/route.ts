import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { rateLimit, tooManyRequests } from "@/lib/server/rate-limit";
import { requestIpHash } from "@/lib/server/request";

export const runtime = "nodejs";

const cookieName = "footyrush_guest_played";

// Guests get a single free play before being asked to register.
const GUEST_PLAY_LIMIT = 1;

/**
 * Source of truth is the `guest_play_allowances` table keyed by hashed IP, so
 * the limit survives incognito/cookie-clearing. The cookie is kept only as a
 * convenience hint (and as the sole mechanism in demo mode without Supabase).
 */
export async function GET(request: NextRequest) {
  const currentHash = requestIpHash(request);
  const supabase = getSupabaseServiceClient();

  if (!supabase) {
    const playedHash = request.cookies.get(cookieName)?.value;
    const played = playedHash === currentHash;
    return NextResponse.json({ allowed: !played, played, production: false });
  }

  const { data, error } = await supabase
    .from("guest_play_allowances")
    .select("play_count")
    .eq("ip_hash", currentHash)
    .maybeSingle();

  if (error) {
    // Fail-open on read errors so a transient DB issue does not lock everyone out.
    return NextResponse.json({ allowed: true, played: false, production: true, degraded: true });
  }

  const playCount = data?.play_count ?? 0;
  const played = playCount >= GUEST_PLAY_LIMIT;
  return NextResponse.json({ allowed: !played, played, production: true });
}

export async function POST(request: NextRequest) {
  const limit = await rateLimit(request, "guest-plays", { limit: 10, window: "1 m" });
  if (!limit.success) {
    return tooManyRequests(limit);
  }

  const currentHash = requestIpHash(request);
  const supabase = getSupabaseServiceClient();

  if (!supabase) {
    const response = NextResponse.json({ ok: true, allowed: false, production: false });
    response.cookies.set(cookieName, currentHash, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365
    });
    return response;
  }

  // Atomic capped increment (single statement) avoids the read-then-upsert race
  // and never advances a guest who is already at the limit.
  const { data: count, error } = await supabase.rpc("increment_guest_play", {
    p_ip_hash: currentHash,
    p_limit: GUEST_PLAY_LIMIT
  });

  if (error) {
    return NextResponse.json({ error: "Could not record guest play." }, { status: 500 });
  }

  const playCount = Number(count ?? GUEST_PLAY_LIMIT);
  const response = NextResponse.json({ ok: true, allowed: playCount < GUEST_PLAY_LIMIT, production: true });
  // Cookie hint mirrors the server decision but is no longer authoritative.
  response.cookies.set(cookieName, currentHash, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365
  });
  return response;
}
