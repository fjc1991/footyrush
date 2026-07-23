import { beforeEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({ serviceClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ getSupabaseServiceClient: routeMocks.serviceClient }));

import { GET } from "@/app/api/profile/route";

function user(admin = false) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    email: "manager@example.com",
    email_confirmed_at: "2026-07-01T00:00:00Z",
    app_metadata: admin ? { role: "admin" } : {},
    user_metadata: { full_name: "Private X Name" },
    aud: "authenticated",
    created_at: "2026-07-01T00:00:00Z"
  };
}

function client(options: {
  authUser?: ReturnType<typeof user> | null;
  reads?: { data: Record<string, unknown> | null; error: Record<string, unknown> | null }[];
  insert?: { data: Record<string, unknown> | null; error: Record<string, unknown> | null };
}) {
  const reads = [...(options.reads ?? [])];
  const inserted: Record<string, unknown>[] = [];
  return {
    inserted,
    value: {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: options.authUser ?? null }, error: null })
      },
      from: vi.fn(() => ({
        select: vi.fn(() => {
          const builder = { eq: vi.fn(), maybeSingle: vi.fn() };
          builder.eq.mockReturnValue(builder);
          builder.maybeSingle.mockImplementation(async () => reads.shift() ?? { data: null, error: null });
          return builder;
        }),
        insert: vi.fn((payload: Record<string, unknown>) => {
          inserted.push(payload);
          const builder = { select: vi.fn(), maybeSingle: vi.fn() };
          builder.select.mockReturnValue(builder);
          builder.maybeSingle.mockResolvedValue(options.insert ?? { data: null, error: { message: "insert failed" } });
          return builder;
        })
      }))
    }
  };
}

function request(token = "verified-token") {
  return new Request("http://localhost/api/profile", { headers: { Authorization: `Bearer ${token}` } });
}

describe("GET /api/profile", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 503 without account services", async () => {
    routeMocks.serviceClient.mockReturnValue(null);
    expect((await GET(request())).status).toBe(503);
  });

  it("requires a verified bearer identity", async () => {
    const mock = client({ authUser: null });
    routeMocks.serviceClient.mockReturnValue(mock.value);
    expect((await GET(request())).status).toBe(401);
  });

  it("returns public manager identity and forces the rollout confirmation", async () => {
    const profile = {
      id: user().id,
      manager_id: "north_bank",
      display_name: "Private X Name",
      email: "manager@example.com",
      locale: "en",
      created_at: "2026-07-01T00:00:00Z",
      last_seen_at: null,
      manager_id_confirmed_at: null,
      manager_id_rename_available: true
    };
    const mock = client({ authUser: user(true), reads: [{ data: profile, error: null }] });
    routeMocks.serviceClient.mockReturnValue(mock.value);
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      admin: true,
      accountStatisticsAvailable: true,
      profile: {
        managerId: "north_bank",
        publicName: "@north_bank",
        displayName: "@north_bank",
        requiresManagerIdConfirmation: true,
        renameAvailable: true
      }
    });
  });

  it("returns a confirmed account without exposing provider display metadata", async () => {
    const profile = {
      id: user().id,
      manager_id: "north_bank",
      display_name: "@north_bank",
      email: "manager@example.com",
      locale: "en",
      created_at: "2026-07-01T00:00:00Z",
      last_seen_at: null,
      manager_id_confirmed_at: "2026-07-23T00:00:00Z",
      manager_id_rename_available: false
    };
    const mock = client({ authUser: user(), reads: [{ data: profile, error: null }] });
    routeMocks.serviceClient.mockReturnValue(mock.value);
    expect(await (await GET(request())).json()).toMatchObject({
      profile: { displayName: "@north_bank", requiresManagerIdConfirmation: false }
    });
  });

  it("creates every orphaned account with no manager ID, including admins", async () => {
    const inserted = {
      id: user().id,
      manager_id: null,
      display_name: "manager",
      email: "manager@example.com",
      locale: "en",
      created_at: "2026-07-23T00:00:00Z"
    };
    const mock = client({
      authUser: user(true),
      reads: [{ data: null, error: null }],
      insert: { data: inserted, error: null }
    });
    routeMocks.serviceClient.mockReturnValue(mock.value);
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(mock.inserted[0]).toMatchObject({ manager_id: null });
    expect(await response.json()).toMatchObject({
      admin: true,
      profile: { managerId: null, requiresManagerIdConfirmation: true }
    });
  });

  it("gracefully reads the legacy profile schema during migration rollout", async () => {
    const profile = {
      id: user().id,
      manager_id: "legacy_id",
      display_name: "Legacy",
      email: "manager@example.com",
      locale: "en",
      created_at: "2026-07-01T00:00:00Z"
    };
    const mock = client({
      authUser: user(),
      reads: [
        { data: null, error: { code: "42703", message: "manager_id_confirmed_at missing" } },
        { data: profile, error: null }
      ]
    });
    routeMocks.serviceClient.mockReturnValue(mock.value);
    expect(await (await GET(request())).json()).toMatchObject({
      accountStatisticsAvailable: false,
      profile: { managerId: "legacy_id", requiresManagerIdConfirmation: false }
    });
  });
});
