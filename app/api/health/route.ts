import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = getSupabaseServiceClient();

  if (!supabase) {
    // No Supabase configured: app runs in demo mode. Healthy, but flagged.
    return NextResponse.json({ ok: true, mode: "demo", database: "unconfigured" });
  }

  const startedAt = Date.now();
  const { error } = await supabase.from("seasons").select("year", { head: true, count: "exact" }).limit(1);
  const latencyMs = Date.now() - startedAt;

  if (error) {
    return NextResponse.json(
      { ok: false, mode: "production", database: "down", error: error.message },
      { status: 503 }
    );
  }

  return NextResponse.json({ ok: true, mode: "production", database: "up", latencyMs });
}
