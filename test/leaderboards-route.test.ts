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
});
