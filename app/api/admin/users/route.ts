import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/account";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!(await requireAdmin(request))) return NextResponse.json({ ok: false }, { status: 403 });
  const supabase = getSupabaseServiceClient();
  if (!supabase) return NextResponse.json({ ok: false }, { status: 503 });
  const page = Math.max(1, Math.min(10_000, Number(request.nextUrl.searchParams.get("page")) || 1));
  const pageSize = Math.max(10, Math.min(100, Number(request.nextUrl.searchParams.get("pageSize")) || 25));
  const search = (request.nextUrl.searchParams.get("search") ?? "")
    .replace(/[^a-zA-Z0-9@._+-]/g, "")
    .slice(0, 60);
  let query = supabase
    .from("profiles")
    .select("id, manager_id, email, locale, created_at, last_seen_at, manager_id_confirmed_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (search) query = query.or(`manager_id.ilike.%${search}%,email.ilike.%${search}%`);
  const { data: profiles, error, count } = await query;
  if (error) return NextResponse.json({ ok: false, reason: "Could not load users." }, { status: 500 });
  const ids = (profiles ?? []).map((profile) => profile.id);
  const [preferences, marketing, runs, visits] = ids.length
    ? await Promise.all([
        supabase.from("profile_preferences").select("*").in("profile_id", ids),
        supabase.from("marketing_preferences").select("*").in("profile_id", ids),
        supabase.from("user_mode_runs").select("profile_id, completed_at").in("profile_id", ids),
        supabase.from("user_visits").select("profile_id, active_seconds").in("profile_id", ids)
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }];
  const prefMap = new Map<string, Record<string, unknown>>(
    ((preferences.data ?? []) as Record<string, unknown>[]).map((row) => [String(row.profile_id), row])
  );
  const marketingMap = new Map<string, Record<string, unknown>>(
    ((marketing.data ?? []) as Record<string, unknown>[]).map((row) => [String(row.profile_id), row])
  );
  return NextResponse.json({
    ok: true,
    page,
    pageSize,
    total: count ?? 0,
    users: (profiles ?? []).map((profile) => ({
      ...profile,
      public_name: profile.manager_id ? `@${profile.manager_id}` : null,
      preferences: prefMap.get(profile.id) ?? null,
      marketing: marketingMap.get(profile.id) ?? null,
      completedRuns: (runs.data ?? []).filter((run) => run.profile_id === profile.id && run.completed_at).length,
      activeSeconds: (visits.data ?? [])
        .filter((visit) => visit.profile_id === profile.id)
        .reduce((sum, visit) => sum + Number(visit.active_seconds || 0), 0)
    }))
  });
}
