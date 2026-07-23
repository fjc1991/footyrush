import { NextResponse } from "next/server";
import { cleanOptionalText } from "@/lib/server/account";
import { getAuthenticatedUserId } from "@/lib/server/auth";
import { rateLimit, tooManyRequests } from "@/lib/server/rate-limit";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

const ageBands = new Set(["under_18","18_24","25_34","35_44","45_54","55_plus","prefer_not"]);
const genders = new Set(["woman","man","non_binary","self_describe","prefer_not"]);
const modes = new Set(["minileague","invincible"]);
const kits = new Set(["classic","retro","modern","bold"]);

function enumValue(value: unknown, allowed: Set<string>): string | null | undefined {
  if (value === null || value === "") return null;
  return typeof value === "string" && allowed.has(value) ? value : undefined;
}

export async function PATCH(request: Request) {
  const limit = await rateLimit(request, "account-preferences", { limit: 30, window: "1 h" });
  if (!limit.success) return tooManyRequests(limit);
  const profileId = await getAuthenticatedUserId(request);
  if (!profileId) return NextResponse.json({ ok: false }, { status: 401 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ ok: false, reason: "Invalid preferences." }, { status: 400 });

  const country = body.countryCode === null || body.countryCode === ""
    ? null
    : typeof body.countryCode === "string" && /^[A-Za-z]{2}$/.test(body.countryCode)
      ? body.countryCode.toUpperCase()
      : undefined;
  const followedLeagues = Array.isArray(body.followedLeagues)
    ? [...new Set(body.followedLeagues.filter((item): item is string => typeof item === "string").map((item) => item.trim().slice(0, 40)).filter(Boolean))].slice(0, 12)
    : body.followedLeagues === undefined ? undefined : null;
  const values = {
    country_code: country,
    age_band: enumValue(body.ageBand, ageBands),
    gender: enumValue(body.gender, genders),
    favourite_club_code: cleanOptionalText(body.favouriteClub, 60),
    favourite_current_player: cleanOptionalText(body.favouriteCurrentPlayer, 80),
    favourite_legend: cleanOptionalText(body.favouriteLegend, 80),
    followed_leagues: followedLeagues,
    preferred_game_mode: enumValue(body.preferredGameMode, modes),
    discovery_source: cleanOptionalText(body.discoverySource, 80),
    preferred_kit_style: enumValue(body.preferredKitStyle, kits)
  };
  if (Object.values(values).some((value) => value === undefined)) {
    return NextResponse.json({ ok: false, reason: "One or more preference values are invalid." }, { status: 400 });
  }
  const supabase = getSupabaseServiceClient();
  if (!supabase) return NextResponse.json({ ok: false }, { status: 503 });
  const { data, error } = await supabase.from("profile_preferences").upsert({
    profile_id: profileId,
    ...values,
    updated_at: new Date().toISOString()
  }, { onConflict: "profile_id" }).select("*").single();
  if (error) return NextResponse.json({ ok: false, reason: "Could not save preferences." }, { status: 500 });
  return NextResponse.json({ ok: true, preferences: data });
}
