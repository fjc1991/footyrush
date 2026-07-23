import type { User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/server/auth";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ProfileRow {
  id: string;
  manager_id: string | null;
  display_name: string;
  email: string | null;
  locale?: string | null;
  created_at?: string;
  last_seen_at?: string | null;
  manager_id_confirmed_at?: string | null;
  manager_id_rename_available?: boolean;
}

const EXTENDED_COLUMNS =
  "id, manager_id, display_name, email, locale, created_at, last_seen_at, manager_id_confirmed_at, manager_id_rename_available";
const LEGACY_COLUMNS = "id, manager_id, display_name, email, locale, created_at";

function canonicalProfile(profile: ProfileRow, identityMigrationAvailable: boolean) {
  const requiresManagerIdConfirmation = identityMigrationAvailable
    ? !profile.manager_id || !profile.manager_id_confirmed_at
    : !profile.manager_id;
  return {
    id: profile.id,
    managerId: profile.manager_id,
    publicName: profile.manager_id ? `@${profile.manager_id}` : null,
    displayName: profile.manager_id ? `@${profile.manager_id}` : "Manager",
    email: profile.email,
    locale: profile.locale ?? "en",
    joinedAt: profile.created_at ?? null,
    lastSeenAt: profile.last_seen_at ?? null,
    requiresManagerIdConfirmation,
    renameAvailable: identityMigrationAvailable && Boolean(profile.manager_id_rename_available),
    demo: false
  };
}

function temporaryPrivateName(user: User): string {
  const emailName = user.email?.split("@", 1)[0]?.trim();
  return (emailName || "Manager").slice(0, 80);
}

function isMissingIdentitySchema(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: string; message?: string };
  return (
    ["42703", "PGRST204"].includes(candidate.code ?? "") ||
    (candidate.message ?? "").toLowerCase().includes("manager_id_confirmed_at")
  );
}

async function readProfile(
  supabase: NonNullable<ReturnType<typeof getSupabaseServiceClient>>,
  userId: string
): Promise<{ profile: ProfileRow | null; error: unknown; identityMigrationAvailable: boolean }> {
  const extended = await supabase
    .from("profiles")
    .select(EXTENDED_COLUMNS)
    .eq("id", userId)
    .maybeSingle<ProfileRow>();
  if (!extended.error) {
    return { profile: extended.data ?? null, error: null, identityMigrationAvailable: true };
  }
  if (!isMissingIdentitySchema(extended.error)) {
    return { profile: null, error: extended.error, identityMigrationAvailable: true };
  }
  const legacy = await supabase
    .from("profiles")
    .select(LEGACY_COLUMNS)
    .eq("id", userId)
    .maybeSingle<ProfileRow>();
  return {
    profile: legacy.data ?? null,
    error: legacy.error,
    identityMigrationAvailable: false
  };
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

  const admin = user.app_metadata?.role === "admin";
  const initial = await readProfile(supabase, user.id);
  if (initial.error) {
    return NextResponse.json({ ok: false, reason: "Could not load your manager profile." }, { status: 500 });
  }
  if (initial.profile) {
    return NextResponse.json({
      ok: true,
      profile: canonicalProfile(initial.profile, initial.identityMigrationAvailable),
      admin,
      accountStatisticsAvailable: initial.identityMigrationAvailable
    });
  }

  const insert = await supabase
    .from("profiles")
    .insert({
      id: user.id,
      manager_id: null,
      display_name: temporaryPrivateName(user),
      email: user.email ?? null
    })
    .select(LEGACY_COLUMNS)
    .maybeSingle<ProfileRow>();

  if (insert.error?.code === "23505") {
    const raced = await readProfile(supabase, user.id);
    if (raced.profile) {
      return NextResponse.json({
        ok: true,
        profile: canonicalProfile(raced.profile, raced.identityMigrationAvailable),
        admin,
        accountStatisticsAvailable: raced.identityMigrationAvailable
      });
    }
  }
  if (insert.error || !insert.data) {
    return NextResponse.json({ ok: false, reason: "Could not create your manager profile." }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    profile: canonicalProfile(insert.data, false),
    admin,
    accountStatisticsAvailable: false
  });
}
