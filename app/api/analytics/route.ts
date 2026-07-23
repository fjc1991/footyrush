import { NextRequest, NextResponse } from "next/server";
import {
  isAnalyticsAnonymousId,
  isProductEventName,
  normalizeAnalyticsLocale,
  normalizeAnalyticsProperties
} from "@/lib/analytics/events";
import { getAuthenticatedUserId } from "@/lib/server/auth";
import { rateLimit, tooManyRequests } from "@/lib/server/rate-limit";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface AnalyticsBody {
  eventName?: unknown;
  anonymousId?: unknown;
  locale?: unknown;
  properties?: unknown;
}

/**
 * Store a small, allowlisted product event after client-side consent.
 *
 * The endpoint accepts no names, email addresses, X data, user-agent string,
 * raw IP address, or free-form text. Signed-in identity is derived from the
 * bearer token when available and is never trusted from the request body.
 */
export async function POST(request: NextRequest) {
  const limit = await rateLimit(request, "product-analytics", { limit: 180, window: "1 h" });
  if (!limit.success) {
    return tooManyRequests(limit);
  }

  const body = (await request.json().catch(() => null)) as AnalyticsBody | null;
  if (!body || !isProductEventName(body.eventName) || !isAnalyticsAnonymousId(body.anonymousId)) {
    return NextResponse.json({ ok: false, error: "Invalid analytics event." }, { status: 400 });
  }

  const supabase = getSupabaseServiceClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Analytics storage is unavailable." }, { status: 503 });
  }

  const profileId = await getAuthenticatedUserId(request);
  const { error } = await supabase.from("product_events").insert({
    profile_id: profileId,
    anonymous_id: body.anonymousId,
    event_name: body.eventName,
    locale: normalizeAnalyticsLocale(body.locale),
    properties: normalizeAnalyticsProperties(body.properties)
  });

  if (error) {
    return NextResponse.json({ ok: false, error: "Could not record analytics event." }, { status: 503 });
  }
  return NextResponse.json({ ok: true }, { status: 202 });
}
