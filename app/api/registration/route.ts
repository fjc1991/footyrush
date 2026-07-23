import { NextRequest, NextResponse } from "next/server";
import { getEmailRisk, normalizeEmail } from "@/lib/game/anti-abuse";
import { getAuthenticatedUserId } from "@/lib/server/auth";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { managerIdValidationMessage, normalizeManagerId } from "@/lib/user/manager-id";
import { rateLimit, tooManyRequests } from "@/lib/server/rate-limit";

export const runtime = "nodejs";

async function managerIdAvailable(
  managerId: string,
  requestingProfileId?: string | null
): Promise<{ available: boolean; production: boolean; reason?: string }> {
  const validation = managerIdValidationMessage(managerId);
  if (validation) {
    return { available: false, production: false, reason: validation };
  }

  const supabase = getSupabaseServiceClient();
  if (!supabase) {
    return { available: true, production: false };
  }

  let query = supabase
    .from("profiles")
    .select("id")
    .eq("manager_id", managerId)
    .limit(1);
  if (requestingProfileId) {
    query = query.neq("id", requestingProfileId);
  }
  const { data, error } = await query;

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
  const profileId = await getAuthenticatedUserId(request);
  const result = await managerIdAvailable(managerId, profileId);
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
  manager_id_confirmed_at?: string | null;
  manager_id_rename_available?: boolean;
}

function completedProfile(profile: ProfileRow) {
  return {
    id: profile.id,
    managerId: profile.manager_id,
    publicName: profile.manager_id ? `@${profile.manager_id}` : null,
    displayName: profile.manager_id ? `@${profile.manager_id}` : profile.display_name,
    email: profile.email,
    requiresManagerIdConfirmation: !profile.manager_id || !profile.manager_id_confirmed_at,
    renameAvailable: Boolean(profile.manager_id_rename_available),
    demo: false
  };
}

/**
 * Complete manager-ID onboarding for the authenticated Supabase identity.
 *
 * The database function serializes the profile row, enforces the one-time
 * confirmation/rename entitlement, and updates all denormalized public names.
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

  const { data: claimed, error: claimError } = await supabase.rpc("claim_manager_id", {
    p_profile_id: profileId,
    p_manager_id: managerId
  });
  const updated = (Array.isArray(claimed) ? claimed[0] : claimed) as ProfileRow | null;

  if (claimError?.code === "23505") {
    return NextResponse.json(
      { ok: false, managerId, reason: "That manager ID is already taken." },
      { status: 409 }
    );
  }
  if (claimError?.code === "P0001") {
    return NextResponse.json(
      { ok: false, managerId, reason: "This account has already used its manager ID confirmation." },
      { status: 409 }
    );
  }
  if (claimError && ["42883", "PGRST202"].includes(claimError.code ?? "")) {
    return NextResponse.json(
      { ok: false, reason: "Account setup is being upgraded. Please try again after the database migration." },
      { status: 503 }
    );
  }
  if (claimError) {
    return NextResponse.json({ ok: false, reason: "Could not save that manager ID." }, { status: 500 });
  }
  if (updated) {
    return NextResponse.json({ ok: true, profile: completedProfile(updated) });
  }

  // Defensive read-back for a replay after a successful atomic claim.
  const { data: existing, error: profileError } = await supabase
    .from("profiles")
    .select("id, manager_id, display_name, email, manager_id_confirmed_at, manager_id_rename_available")
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
