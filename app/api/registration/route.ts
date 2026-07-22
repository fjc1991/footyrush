import { NextRequest, NextResponse } from "next/server";
import { getEmailRisk, normalizeEmail } from "@/lib/game/anti-abuse";
import { getAuthenticatedUserId } from "@/lib/server/auth";
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
  const validation = managerIdValidationMessage(managerId);

  if (!emailRisk.ok) {
    return NextResponse.json({ ok: false, reason: emailRisk.reason }, { status: 400 });
  }

  if (validation) {
    return NextResponse.json({ ok: false, managerId, reason: validation }, { status: 400 });
  }

  const availability = await managerIdAvailable(managerId);

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

interface ProfileRow {
  id: string;
  manager_id: string | null;
  display_name: string;
  email: string | null;
}

function completedProfile(profile: ProfileRow) {
  return {
    id: profile.id,
    managerId: profile.manager_id,
    displayName: profile.display_name,
    email: profile.email,
    demo: false
  };
}

/**
 * Complete manager-ID onboarding for the authenticated Supabase identity.
 *
 * The update only matches a profile whose manager_id is still null. The unique
 * database index decides simultaneous claims atomically; the bearer token, not
 * a request-body user id, decides which profile may be changed.
 */
export async function PATCH(request: Request) {
  const limit = await rateLimit(request, "registration-complete", { limit: 5, window: "1 m" });
  if (!limit.success) {
    return tooManyRequests(limit);
  }

  const profileId = await getAuthenticatedUserId(request);
  if (!profileId) {
    return NextResponse.json({ ok: false, reason: "Sign in to choose a manager ID." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { managerId?: string };
  const managerId = normalizeManagerId(body.managerId ?? "");
  const validation = managerIdValidationMessage(managerId);
  if (validation) {
    return NextResponse.json({ ok: false, managerId, reason: validation }, { status: 400 });
  }

  const supabase = getSupabaseServiceClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, reason: "Account setup is temporarily unavailable." }, { status: 503 });
  }

  const { data: updated, error: updateError } = await supabase
    .from("profiles")
    .update({ manager_id: managerId, updated_at: new Date().toISOString() })
    .eq("id", profileId)
    .is("manager_id", null)
    .select("id, manager_id, display_name, email")
    .maybeSingle<ProfileRow>();

  if (updateError?.code === "23505") {
    return NextResponse.json(
      { ok: false, managerId, reason: "That manager ID is already taken." },
      { status: 409 }
    );
  }
  if (updateError) {
    return NextResponse.json({ ok: false, reason: "Could not save that manager ID." }, { status: 500 });
  }
  if (updated) {
    return NextResponse.json({ ok: true, profile: completedProfile(updated) });
  }

  // A zero-row update means the profile was missing or an ID was already
  // claimed (including by a concurrent request). Read it back for an idempotent
  // response without allowing an existing ID to be renamed here.
  const { data: existing, error: profileError } = await supabase
    .from("profiles")
    .select("id, manager_id, display_name, email")
    .eq("id", profileId)
    .maybeSingle<ProfileRow>();

  if (profileError) {
    return NextResponse.json({ ok: false, reason: "Could not verify your profile." }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ ok: false, reason: "Your profile could not be found." }, { status: 404 });
  }
  if (existing.manager_id === managerId) {
    return NextResponse.json({ ok: true, profile: completedProfile(existing) });
  }

  return NextResponse.json(
    { ok: false, managerId, reason: "This account already has a manager ID." },
    { status: 409 }
  );
}
