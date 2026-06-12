import { NextRequest, NextResponse } from "next/server";
import { aggregateLeaderboard, demoLeaderboardRecords } from "@/lib/game/leaderboard";
import type { LeaderboardRecord, Period } from "@/lib/game/types";

const periods = new Set(["daily", "weekly", "monthly"]);

export function GET(request: NextRequest) {
  const periodParam = request.nextUrl.searchParams.get("period") ?? "daily";
  const period = periods.has(periodParam) ? (periodParam as Period) : "daily";
  const records: LeaderboardRecord[] = demoLeaderboardRecords();
  return NextResponse.json({ entries: aggregateLeaderboard(records, period) });
}
