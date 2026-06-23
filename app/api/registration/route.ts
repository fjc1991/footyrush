import { NextRequest, NextResponse } from "next/server";
import { getEmailRisk, normalizeEmail } from "@/lib/game/anti-abuse";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { managerIdValidationMessage, normalizeManagerId } from "@/lib/user/manager-id";

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
