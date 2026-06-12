import { NextRequest, NextResponse } from "next/server";
import { sanitizeNextPath } from "@/lib/game/anti-abuse";

export function GET(request: NextRequest) {
  const url = new URL(request.url);
  const next = sanitizeNextPath(url.searchParams.get("next"));
  return NextResponse.redirect(new URL(next, request.url));
}
