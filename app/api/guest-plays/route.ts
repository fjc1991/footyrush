import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { rateLimit, tooManyRequests } from "@/lib/server/rate-limit";
import { requestIpHash } from "@/lib/server/request";

export const runtime = "nodejs";

// Demo-mode cookie holds "<count>|<YYYY-MM-DD>" (UTC). Production uses the
// guest_play_allowances table keyed by hashed IP (survives cookie clearing).
const cookieName = "footyrush_guest_plays";

// Guests get this many free plays PER DAY before being asked to register.
const GUEST_PLAY_LIMIT = 3;

function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseCookie(value: string | undefined): { count: number; day: string } {
  if (!value) {
    return { count: 0, day: utcToday() };
  }
  const [rawCount, day] = value.split("|");
  const count = Number(rawCount);
  return { count: Number.isFinite(count) ? count : 0, day: day ?? "" };
}

function setCookie(response: NextResponse, count: number, day: string): void {
  response.cookies.set(cookieName, `${count}|${day}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7
  });
}

function payload(usedToday: number, production: boolean, extra: Record<string, unknown> = {}) {
  const remaining = Math.max(0, GUEST_PLAY_LIMIT - usedToday);
  return {
    allowed: remaining > 0,
    played: remaining <= 0,
    remaining,
    limit: GUEST_PLAY_LIMIT,
    production,
    ...extra
  };
}

export async function GET(request: NextRequest) {
  const currentHash = requestIpHash(request);
  const supabase = getSupabaseServiceClient();
  const today = utcToday();

  if (!supabase) {
    const { count, day } = parseCookie(request.cookies.get(cookieName)?.value);
    const usedToday = day === today ? count : 0;
    return NextResponse.json(payload(usedToday, false));
  }

  const { data, error } = await supabase
    .from("guest_play_allowances")
    .select("play_count, play_day")
    .eq("ip_hash", currentHash)
    .maybeSingle();

  if (error) {
    // Fail-open on read errors so a transient DB issue does not lock everyone out.
    return NextResponse.json(payload(0, true, { degraded: true }));
  }

  const usedToday = data && String(data.play_day) === today ? data.play_count : 0;
  return NextResponse.json(payload(usedToday, true));
}

export async function POST(request: NextRequest) {
  const limit = await rateLimit(request, "guest-plays", { limit: 10, window: "1 m" });
  if (!limit.success) {
    return tooManyRequests(limit);
  }

  const currentHash = requestIpHash(request);
  const supabase = getSupabaseServiceClient();
  const today = utcToday();

  if (!supabase) {
    const { count, day } = parseCookie(request.cookies.get(cookieName)?.value);
    const usedToday = day === today ? count : 0;
    const nextCount = Math.min(GUEST_PLAY_LIMIT, usedToday + 1);
    const response = NextResponse.json(payload(nextCount, false, { ok: true }));
    setCookie(response, nextCount, today);
    return response;
  }

  // Atomic, day-aware, capped increment (single statement) avoids the
  // read-then-upsert race and resets the count when the day rolls over.
  const { data: count, error } = await supabase.rpc("increment_guest_play", {
    p_ip_hash: currentHash,
    p_limit: GUEST_PLAY_LIMIT
  });

  if (error) {
    return NextResponse.json({ error: "Could not record guest play." }, { status: 500 });
  }

  const usedToday = Number(count ?? GUEST_PLAY_LIMIT);
  return NextResponse.json(payload(usedToday, true, { ok: true }));
}
