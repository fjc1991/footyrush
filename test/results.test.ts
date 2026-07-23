import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const routeMocks = vi.hoisted(() => ({
  authenticatedUserId: vi.fn(),
  serviceClient: vi.fn(),
  rateLimit: vi.fn()
}));

vi.mock("@/lib/server/auth", () => ({
  getAuthenticatedUserId: routeMocks.authenticatedUserId
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServiceClient: routeMocks.serviceClient
}));

vi.mock("@/lib/server/rate-limit", () => ({
  rateLimit: routeMocks.rateLimit,
  tooManyRequests: vi.fn(() => Response.json({ ok: false }, { status: 429 }))
}));

import { GET, POST } from "@/app/api/results/route";
import { canonicalAccountRunId } from "@/lib/game/result-id";

function request(method: "GET" | "POST", body?: unknown, url = "http://localhost/api/results") {
  return new NextRequest(url, {
    method,
    headers: { Authorization: "Bearer verified-token", "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
}

function postClient(options: {
  rpcError?: { code?: string; message?: string } | null;
  fallbackError?: { code?: string; message?: string } | null;
} = {}) {
  const profileBuilder = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: { id: "profile-1", display_name: "Canonical Manager" },
      error: null
    })
  };
  profileBuilder.select.mockReturnValue(profileBuilder);
  profileBuilder.eq.mockReturnValue(profileBuilder);

  const fallbackUpsert = vi.fn().mockResolvedValue({ error: options.fallbackError ?? null });
  const rpc = vi.fn().mockResolvedValue({ error: options.rpcError ?? null });
  return {
    from: vi.fn((table: string) =>
      table === "profiles" ? profileBuilder : { upsert: fallbackUpsert }
    ),
    rpc,
    fallbackUpsert
  };
}

function historyClient() {
  const rows = [
    {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      profile_id: "profile-1",
      display_name: "Canonical Manager",
      kind: "human",
      competition_mode: "invincible",
      run_id: "season-1",
      games_played: 38,
      final_position: 1,
      match_points: 91,
      goal_difference: 44,
      goals_for: 79,
      league_titles: 1,
      opponent_strength: 1880,
      completed_at: "2026-07-22T12:00:00.000Z"
    }
  ];
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    or: vi.fn(),
    limit: vi.fn().mockResolvedValue({ data: rows, error: null })
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.order.mockReturnValue(builder);
  builder.or.mockReturnValue(builder);
  return { from: vi.fn(() => builder), builder };
}

describe("/api/results", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routeMocks.rateLimit.mockResolvedValue({ success: true });
    routeMocks.authenticatedUserId.mockResolvedValue("profile-1");
  });

  it("requires authentication for writes", async () => {
    routeMocks.authenticatedUserId.mockResolvedValue(null);
    routeMocks.serviceClient.mockReturnValue({});

    const response = await POST(request("POST", { records: [{ id: "run-1" }] }));

    expect(response.status).toBe(401);
  });

  it("uses the canonical profile and immutable result writer for a normalized run", async () => {
    const client = postClient();
    routeMocks.serviceClient.mockReturnValue(client);

    const record = {
      id: "client-record-1",
      userId: "forged-user",
      displayName: "Forged Name",
      kind: "human",
      competitionMode: "invincible",
      runId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      gamesPlayed: 38,
      finalPosition: 1,
      matchPoints: 91.2,
      goalDifference: 44,
      goalsFor: 79,
      leagueTitles: 1,
      opponentStrength: 1880,
      completedAt: "2026-07-22T12:00:00.000Z"
    };
    const response = await POST(request("POST", { records: [record] }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ persisted: true, count: 1 });
    expect(client.rpc).toHaveBeenCalledWith(
      "record_competition_result",
      expect.objectContaining({
        p_profile_id: "profile-1",
        p_display_name: "Canonical Manager",
        p_competition_mode: "invincible",
        p_run_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        p_games_played: 38,
        p_final_position: 1,
        p_match_points: 91
      })
    );
  });

  it("rejects duplicate run IDs rather than silently replacing one payload", async () => {
    const client = postClient();
    routeMocks.serviceClient.mockReturnValue(client);
    const record = {
      id: "run-duplicate",
      kind: "human",
      competitionMode: "minileague",
      runId: "run-duplicate",
      finalPosition: 2
    };

    const response = await POST(request("POST", { records: [record, record] }));

    expect(response.status).toBe(400);
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("derives one title from first place and never trusts a larger submitted count", async () => {
    const client = postClient();
    routeMocks.serviceClient.mockReturnValue(client);

    const response = await POST(request("POST", {
      records: [{
        id: "run-title",
        kind: "human",
        competitionMode: "minileague",
        runId: "run-title",
        gamesPlayed: 99,
        finalPosition: 2,
        leagueTitles: 100
      }]
    }));

    expect(response.status).toBe(200);
    expect(client.rpc).toHaveBeenCalledWith(
      "record_competition_result",
      expect.objectContaining({ p_games_played: 5, p_final_position: 2, p_league_titles: 0 })
    );
  });

  it("accepts a claimed legacy Mini League without inventing a finishing position", async () => {
    const client = postClient();
    routeMocks.serviceClient.mockReturnValue(client);

    const response = await POST(request("POST", {
      records: [{
        id: "legacy-run",
        kind: "human",
        competitionMode: "minileague",
        runId: "legacy-run",
        legacy: true,
        gamesPlayed: 5,
        finalPosition: null,
        matchPoints: 7,
        leagueTitles: 0
      }]
    }));

    expect(response.status).toBe(200);
    const canonicalRunId = await canonicalAccountRunId("profile-1", "minileague", "legacy-run");
    expect(client.rpc).toHaveBeenCalledWith(
      "record_competition_result",
      expect.objectContaining({ p_run_id: canonicalRunId, p_final_position: null, p_league_titles: 0 })
    );
  });

  it("persists Mini League results through the legacy schema when migration 0009 is missing", async () => {
    const client = postClient({
      rpcError: {
        code: "PGRST202",
        message: "Could not find the function public.record_competition_result in the schema cache"
      }
    });
    routeMocks.serviceClient.mockReturnValue(client);

    const response = await POST(request("POST", {
      records: [{
        id: "legacy-compatible-run",
        kind: "human",
        competitionMode: "minileague",
        runId: "league-123-456",
        finalPosition: 2,
        matchPoints: 13,
        goalDifference: 7,
        goalsFor: 11,
        opponentStrength: 1880
      }],
      completedAt: "2026-07-22T12:00:00.000Z"
    }));
    const payload = await response.json();
    const runId = await canonicalAccountRunId("profile-1", "minileague", "league-123-456");

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ persisted: true, count: 1, runIds: [runId] });
    expect(client.fallbackUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: runId,
        profile_id: "profile-1",
        match_points: 13,
        goal_difference: 7,
        league_titles: 0
      }),
      { onConflict: "id" }
    );
  });

  it("does not bypass an unrelated result-writer failure", async () => {
    const client = postClient({ rpcError: { code: "42501", message: "permission denied" } });
    routeMocks.serviceClient.mockReturnValue(client);

    const response = await POST(request("POST", {
      records: [{
        id: "run-no-fallback",
        kind: "human",
        competitionMode: "minileague",
        runId: "run-no-fallback",
        finalPosition: 2
      }]
    }));

    expect(response.status).toBe(500);
    expect(client.fallbackUpsert).not.toHaveBeenCalled();
  });

  it.each([0, -1, 7, 1.5, null])("rejects an invalid Mini League final position (%s)", async (finalPosition) => {
    const client = postClient();
    routeMocks.serviceClient.mockReturnValue(client);

    const response = await POST(request("POST", {
      records: [{
        id: "bad-position",
        kind: "human",
        competitionMode: "minileague",
        runId: "bad-position",
        finalPosition
      }]
    }));

    expect(response.status).toBe(400);
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("rejects unknown competition modes before writing", async () => {
    const client = postClient();
    routeMocks.serviceClient.mockReturnValue(client);

    const response = await POST(request("POST", {
      records: [{ id: "run-1", kind: "human", competitionMode: "cup" }]
    }));

    expect(response.status).toBe(400);
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("reads history through an authenticated profile-only filter", async () => {
    const client = historyClient();
    routeMocks.serviceClient.mockReturnValue(client);

    const response = await GET(request("GET"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(client.builder.eq).toHaveBeenCalledWith("profile_id", "profile-1");
    expect(client.builder.order).toHaveBeenCalledWith("id", { ascending: false });
    expect(client.builder.limit).toHaveBeenCalledWith(100);
    expect(payload.records).toEqual([
      expect.objectContaining({
        userId: "profile-1",
        competitionMode: "invincible",
        runId: "season-1",
        gamesPlayed: 38,
        finalPosition: 1,
        leagueTitles: 1
      })
    ]);
    expect(payload.nextCursor).toBeNull();
  });

  it("supports a stable completed-at and ID cursor for account history", async () => {
    const client = historyClient();
    routeMocks.serviceClient.mockReturnValue(client);
    const cursorAt = "2026-07-21T12:00:00.000Z";
    const cursorId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

    const response = await GET(request(
      "GET",
      undefined,
      `http://localhost/api/results?limit=1&cursorAt=${encodeURIComponent(cursorAt)}&cursorId=${cursorId}`
    ));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(client.builder.or).toHaveBeenCalledWith(
      `completed_at.lt.${cursorAt},and(completed_at.eq.${cursorAt},id.lt.${cursorId})`
    );
    expect(client.builder.limit).toHaveBeenCalledWith(1);
    expect(payload.nextCursor).toEqual({
      completedAt: "2026-07-22T12:00:00.000Z",
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
    });
  });

  it("rejects malformed history cursors", async () => {
    const client = historyClient();
    routeMocks.serviceClient.mockReturnValue(client);

    const response = await GET(request(
      "GET",
      undefined,
      "http://localhost/api/results?cursorAt=not-a-date&cursorId=nope"
    ));

    expect(response.status).toBe(400);
    expect(client.builder.limit).not.toHaveBeenCalled();
  });

  it("reads legacy Mini League history while migration 0009 is pending", async () => {
    const fullBuilder = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
      or: vi.fn(),
      limit: vi.fn().mockResolvedValue({
        data: null,
        error: { code: "PGRST204", message: "competition_mode column missing" }
      })
    };
    fullBuilder.select.mockReturnValue(fullBuilder);
    fullBuilder.eq.mockReturnValue(fullBuilder);
    fullBuilder.order.mockReturnValue(fullBuilder);
    fullBuilder.or.mockReturnValue(fullBuilder);
    const legacyRow = {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      profile_id: "profile-1",
      display_name: "Canonical Manager",
      kind: "human",
      match_points: 13,
      goal_difference: 7,
      goals_for: 11,
      league_titles: 0,
      opponent_strength: 1880,
      completed_at: "2026-07-22T12:00:00.000Z"
    };
    const legacyBuilder = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
      or: vi.fn(),
      limit: vi.fn().mockResolvedValue({ data: [legacyRow], error: null })
    };
    legacyBuilder.select.mockReturnValue(legacyBuilder);
    legacyBuilder.eq.mockReturnValue(legacyBuilder);
    legacyBuilder.order.mockReturnValue(legacyBuilder);
    legacyBuilder.or.mockReturnValue(legacyBuilder);
    routeMocks.serviceClient.mockReturnValue({
      from: vi.fn()
        .mockReturnValueOnce(fullBuilder)
        .mockReturnValueOnce(legacyBuilder)
    });

    const response = await GET(request("GET"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ production: true, degraded: true });
    expect(payload.records).toEqual([
      expect.objectContaining({
        runId: legacyRow.id,
        competitionMode: "minileague",
        gamesPlayed: 5,
        finalPosition: null,
        legacy: true
      })
    ]);
  });
});
