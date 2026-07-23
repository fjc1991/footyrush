import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const routeMocks = vi.hoisted(() => ({
  serviceClient: vi.fn()
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServiceClient: routeMocks.serviceClient
}));

import { GET } from "@/app/api/leaderboards/route";

function leaderboardClient() {
  const builder = {
    select: vi.fn(),
    lte: vi.fn(),
    gte: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    range: vi.fn().mockResolvedValue({ data: [], error: null })
  };
  builder.select.mockReturnValue(builder);
  builder.lte.mockReturnValue(builder);
  builder.gte.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.order.mockReturnValue(builder);
  return { from: vi.fn(() => builder), builder };
}

describe("/api/leaderboards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds the League Wins board from championship rows only", async () => {
    const client = leaderboardClient();
    routeMocks.serviceClient.mockReturnValue(client);

    const response = await GET(new NextRequest(
      "http://localhost/api/leaderboards?period=all_time&metric=titles"
    ));

    expect(response.status).toBe(200);
    expect(client.builder.eq).toHaveBeenCalledWith("league_titles", 1);
    expect(client.builder.eq).not.toHaveBeenCalledWith("competition_mode", expect.anything());
    expect(client.builder.order).toHaveBeenCalledWith("id", { ascending: false });
  });

  it("keeps Invincible season points separate from Mini League points", async () => {
    const client = leaderboardClient();
    routeMocks.serviceClient.mockReturnValue(client);

    const response = await GET(new NextRequest(
      "http://localhost/api/leaderboards?period=daily&metric=points&competitionMode=invincible"
    ));

    expect(response.status).toBe(200);
    expect(client.builder.eq).toHaveBeenCalledWith("competition_mode", "invincible");
    expect(client.builder.eq).not.toHaveBeenCalledWith("league_titles", 1);
  });

  it("serves legacy Mini League rows instead of an empty board before migration 0009", async () => {
    const fullBuilder = {
      select: vi.fn(),
      lte: vi.fn(),
      gte: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
      range: vi.fn().mockResolvedValue({
        data: null,
        error: { code: "PGRST204", message: "competition_mode column missing" }
      })
    };
    fullBuilder.select.mockReturnValue(fullBuilder);
    fullBuilder.lte.mockReturnValue(fullBuilder);
    fullBuilder.gte.mockReturnValue(fullBuilder);
    fullBuilder.eq.mockReturnValue(fullBuilder);
    fullBuilder.order.mockReturnValue(fullBuilder);

    const legacyBuilder = {
      select: vi.fn(),
      lte: vi.fn(),
      gte: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
      range: vi.fn().mockResolvedValue({
        data: [{
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          profile_id: "profile-1",
          display_name: "Joe Costello",
          kind: "human",
          match_points: 13,
          goal_difference: 7,
          goals_for: 11,
          league_titles: 0,
          opponent_strength: 1880,
          completed_at: new Date().toISOString()
        }],
        error: null
      })
    };
    legacyBuilder.select.mockReturnValue(legacyBuilder);
    legacyBuilder.lte.mockReturnValue(legacyBuilder);
    legacyBuilder.gte.mockReturnValue(legacyBuilder);
    legacyBuilder.eq.mockReturnValue(legacyBuilder);
    legacyBuilder.order.mockReturnValue(legacyBuilder);
    routeMocks.serviceClient.mockReturnValue({
      from: vi.fn()
        .mockReturnValueOnce(fullBuilder)
        .mockReturnValueOnce(legacyBuilder)
    });

    const response = await GET(new NextRequest(
      "http://localhost/api/leaderboards?period=daily&metric=points&competitionMode=minileague"
    ));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      production: true,
      degraded: true,
      competitionMode: "minileague"
    });
    expect(payload.entries).toEqual([
      expect.objectContaining({
        displayName: "Joe Costello",
        matchPoints: 13,
        competitionMode: "minileague"
      })
    ]);
  });
});
