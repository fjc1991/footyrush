import { NextRequest, NextResponse } from "next/server";
import { getEmailRisk, normalizeEmail } from "@/lib/game/anti-abuse";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { managerIdValidationMessage, normalizeManagerId } from "@/lib/user/manager-id";
import { rateLimit, tooManyRequests } from "@/lib/server/rate-limit";

export const runtime = "nodejs";

async function managerIdAvailable(managerId: string): Promise<{ available: boolean; production: boolean; reason?: string }> {
  const validation = managerIdValidationMessage(managerId);
  if (validation) {
    return { available: false, production: false, reason: validation };
  }

  const supabase = getSupabaseServiceClient();
  if (!supabase) {
    return { available: true, production: false };
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("manager_id", managerId)
    .limit(1);

  if (error) {
    return { available: false, production: true, reason: error.message };
  }

  return { available: (data ?? []).length === 0, production: true };
}

export async function GET(request: NextRequest) {
  // Availability checks fire as the user types; allow a generous burst but cap it.
  const limit = await rateLimit(request, "registration-check", { limit: 60, window: "1 m" });
  if (!limit.success) {
    return tooManyRequests(limit);
  }

  const managerId = normalizeManagerId(request.nextUrl.searchParams.get("managerId") ?? "");
  const result = await managerIdAvailable(managerId);
  return NextResponse.json({
    ok: !result.reason,
    managerId,
    available: result.available,
    production: result.production,
    reason: result.reason ?? (result.available ? undefined : "That manager ID is already taken.")
  });
}

export async function POST(request: Request) {
  const limit = await rateLimit(request, "registration-submit", { limit: 5, window: "1 m" });
  if (!limit.success) {
    return tooManyRequests(limit);
  }

  const body = (await request.json().catch(() => ({}))) as { email?: string; managerId?: string };
  const email = normalizeEmail(body.email ?? "");
  const managerId = normalizeManagerId(body.managerId ?? "");
  const emailRisk = getEmailRisk(email);
  const availability = await managerIdAvailable(managerId);

  if (!emailRisk.ok) {
    return NextResponse.json({ ok: false, reason: emailRisk.reason }, { status: 400 });
  }

  if (!availability.available) {
    return NextResponse.json(
      {
        ok: false,
        managerId,
        available: false,
        production: availability.production,
        reason: availability.reason ?? "That manager ID is already taken."
      },
      { status: 409 }
    );
  }

  return NextResponse.json({
    ok: true,
    email,
    managerId,
    available: true,
    production: availability.production
  });
}
