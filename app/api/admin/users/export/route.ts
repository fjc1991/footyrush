import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/account";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function csvCell(value: unknown) {
  const text = Array.isArray(value) ? value.join("|") : value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ ok: false }, { status: 403 });
  const supabase = getSupabaseServiceClient();
  if (!supabase) return NextResponse.json({ ok: false }, { status: 503 });
  const { data: consents, error } = await supabase
    .from("marketing_preferences")
    .select("profile_id, consented_at, consent_source, policy_version")
    .eq("footyrush_email_opt_in", true)
    .not("consented_at", "is", null);
  if (error) return NextResponse.json({ ok: false }, { status: 500 });
  const consentIds = (consents ?? []).map((row) => row.profile_id);
  const [profiles, preferences] = consentIds.length
    ? await Promise.all([
        supabase.from("profiles").select("id, manager_id, email, locale").in("id", consentIds),
        supabase.from("profile_preferences").select("*").in("profile_id", consentIds)
      ])
    : [{ data: [], error: null }, { data: [], error: null }];
  if (profiles.error || preferences.error) return NextResponse.json({ ok: false }, { status: 500 });

  // A profile email is exported only when Supabase Auth confirms it. Provider
  // names and metadata are intentionally excluded.
  const verifiedEmails = new Map<string, string>();
  for (let page = 1; page <= 10 && verifiedEmails.size < consentIds.length; page += 1) {
    const { data, error: authError } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (authError) return NextResponse.json({ ok: false }, { status: 500 });
    data.users.forEach((user) => {
      if (user.email && user.email_confirmed_at) verifiedEmails.set(user.id, user.email);
    });
    if (data.users.length < 1000) break;
  }
  const prefMap = new Map((preferences.data ?? []).map((row) => [row.profile_id, row]));
  const consentMap = new Map((consents ?? []).map((row) => [row.profile_id, row]));
  const rows = (profiles.data ?? [])
    .filter((profile) => verifiedEmails.has(profile.id))
    .map((profile) => {
      const pref = prefMap.get(profile.id) ?? {};
      const consent = consentMap.get(profile.id);
      return [
        profile.manager_id ? `@${profile.manager_id}` : "",
        verifiedEmails.get(profile.id),
        profile.locale,
        pref.country_code,
        pref.age_band,
        pref.gender,
        pref.favourite_club_code,
        pref.favourite_current_player,
        pref.favourite_legend,
        pref.followed_leagues,
        pref.preferred_game_mode,
        pref.discovery_source,
        pref.preferred_kit_style,
        consent?.consented_at,
        consent?.consent_source,
        consent?.policy_version
      ];
    });
  const header = [
    "manager_id","verified_email","locale","country","age_band","gender","favourite_club",
    "favourite_current_player","favourite_legend","followed_leagues","preferred_mode",
    "discovery_source","preferred_kit_style","consented_at","consent_source","policy_version"
  ];
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  const { error: auditError } = await supabase.from("admin_export_audit").insert({
    admin_profile_id: admin.profileId,
    export_kind: "footyrush_promotional_email",
    row_count: rows.length,
    filters: { explicit_opt_in: true, verified_email: true }
  });
  if (auditError) {
    return NextResponse.json(
      { ok: false, reason: "The export was not delivered because its audit record could not be saved." },
      { status: 500 }
    );
  }
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="footyrush-email-audience-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store"
    }
  });
}
