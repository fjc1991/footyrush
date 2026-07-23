import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/server/auth";
import { rateLimit, tooManyRequests } from "@/lib/server/rate-limit";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

export async function PATCH(request: Request) {
  const limit = await rateLimit(request, "account-communications", { limit: 20, window: "1 h" });
  if (!limit.success) return tooManyRequests(limit);
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const body = (await request.json().catch(() => null)) as {
    emailOptIn?: unknown;
    audienceInsightsOptIn?: unknown;
  } | null;
  if (
    !body ||
    (body.emailOptIn !== undefined && typeof body.emailOptIn !== "boolean") ||
    (body.audienceInsightsOptIn !== undefined && typeof body.audienceInsightsOptIn !== "boolean")
  ) {
    return NextResponse.json({ ok: false, reason: "Invalid communication choice." }, { status: 400 });
  }
  if (body.emailOptIn === true && (!user.email || !user.email_confirmed_at)) {
    return NextResponse.json(
      { ok: false, reason: "A verified contact email is required for FootyRush updates." },
      { status: 400 }
    );
  }
  const supabase = getSupabaseServiceClient();
  if (!supabase) return NextResponse.json({ ok: false }, { status: 503 });
  const now = new Date().toISOString();
  if (body.emailOptIn !== undefined) {
    const { error } = await supabase.from("marketing_preferences").upsert({
      profile_id: user.id,
      footyrush_email_opt_in: body.emailOptIn,
      consented_at: body.emailOptIn ? now : null,
      withdrawn_at: body.emailOptIn ? null : now,
      consent_source: "my_home",
      policy_version: "2026-07",
      updated_at: now
    }, { onConflict: "profile_id" });
    if (error) return NextResponse.json({ ok: false, reason: "Could not save email choice." }, { status: 500 });
  }
  if (body.audienceInsightsOptIn !== undefined) {
    const { error } = await supabase.from("profile_preferences").upsert({
      profile_id: user.id,
      audience_insights_opt_in: body.audienceInsightsOptIn,
      audience_insights_consented_at: body.audienceInsightsOptIn ? now : null,
      audience_insights_withdrawn_at: body.audienceInsightsOptIn ? null : now,
      updated_at: now
    }, { onConflict: "profile_id" });
    if (error) return NextResponse.json({ ok: false, reason: "Could not save audience choice." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
