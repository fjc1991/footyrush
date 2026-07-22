import { createHash } from "node:crypto";
import type { User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/server/auth";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { managerIdValidationMessage, normalizeManagerId } from "@/lib/user/manager-id";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ProfileRow {
  id: string;
  manager_id: string | null;
  display_name: string;
  email: string | null;
}

const PROFILE_COLUMNS = "id, manager_id, display_name, email";

function canonicalProfile(profile: ProfileRow) {
  return {
    id: profile.id,
    managerId: profile.manager_id,
    displayName: profile.display_name,
    email: profile.email,
    demo: false
  };
}

function metadataString(user: User, key: string): string | null {
  const value = user.user_metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function newProfileDisplayName(user: User, admin: boolean): string {
  const emailName = user.email?.split("@", 1)[0]?.trim() || null;
  return (
    metadataString(user, "display_name") ??
    metadataString(user, "full_name") ??
    metadataString(user, "name") ??
    (admin ? "Admin (tester)" : null) ??
    emailName ??
    "Manager"
  ).slice(0, 80);
}

function explicitManagerId(user: User): string | null {
  const supplied = metadataString(user, "manager_id");
  if (!supplied) {
    return null;
  }

  const normalized = normalizeManagerId(supplied);
  return managerIdValidationMessage(normalized) ? null : normalized;
}

/**
 * Produce several stable, valid candidates from the immutable auth user ID.
 * More than one candidate lets a pre-existing manager ID collision be handled
 * without assigning an attacker-controlled value or mutating another profile.
 */
function adminManagerIdCandidates(userId: string): string[] {
  const digest = createHash("sha256").update(userId).digest("hex");
  return [
    `mgr_${digest.slice(0, 14)}`,
    `mgr_${digest.slice(14, 28)}`,
    `mgr_${digest.slice(28, 42)}`,
    `mgr_${digest.slice(42, 56)}`
  ];
}

async function readProfile(
  supabase: NonNullable<ReturnType<typeof getSupabaseServiceClient>>,
  userId: string
): Promise<{ profile: ProfileRow | null; error: unknown }> {
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", userId)
    .maybeSingle<ProfileRow>();

  return { profile: data ?? null, error };
}

export async function GET(request: Request) {
  const supabase = getSupabaseServiceClient();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, reason: "Account services are temporarily unavailable." },
      { status: 503 }
    );
  }

  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ ok: false, reason: "Sign in to load your profile." }, { status: 401 });
  }

  // app_metadata is issued by Supabase auth and cannot be edited by the user.
  // In particular, email addresses never grant administrator privileges.
  const admin = user.app_metadata?.role === "admin";
  const initial = await readProfile(supabase, user.id);
  if (initial.error) {
    return NextResponse.json({ ok: false, reason: "Could not load your manager profile." }, { status: 500 });
  }
  if (initial.profile) {
    return NextResponse.json({ ok: true, profile: canonicalProfile(initial.profile), admin });
  }

  const suppliedManagerId = explicitManagerId(user);
  const managerIds: Array<string | null> = admin
    ? [...new Set([suppliedManagerId, ...adminManagerIdCandidates(user.id)].filter(Boolean))] as string[]
    : suppliedManagerId
      ? [suppliedManagerId, null]
      : [null];
  for (const managerId of managerIds) {
    const { data: inserted, error: insertError } = await supabase
      .from("profiles")
      .insert({
        id: user.id,
        manager_id: managerId,
        display_name: newProfileDisplayName(user, admin),
        email: user.email ?? null
      })
      .select(PROFILE_COLUMNS)
      .maybeSingle<ProfileRow>();

    if (!insertError && inserted) {
      return NextResponse.json({ ok: true, profile: canonicalProfile(inserted), admin });
    }

    if (insertError?.code !== "23505") {
      return NextResponse.json({ ok: false, reason: "Could not create your manager profile." }, { status: 500 });
    }

    // A simultaneous request may have inserted this user's profile. Always
    // prefer that canonical row and never overwrite it. If the collision was
    // only on an admin manager ID, move to the next deterministic candidate.
    const raced = await readProfile(supabase, user.id);
    if (raced.error) {
      return NextResponse.json({ ok: false, reason: "Could not verify your manager profile." }, { status: 500 });
    }
    if (raced.profile) {
      return NextResponse.json({ ok: true, profile: canonicalProfile(raced.profile), admin });
    }
  }

  return NextResponse.json({ ok: false, reason: "Could not reserve an administrator manager ID." }, { status: 500 });
}
