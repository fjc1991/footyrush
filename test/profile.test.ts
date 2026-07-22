import { beforeEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
  serviceClient: vi.fn()
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServiceClient: routeMocks.serviceClient
}));

import { GET } from "@/app/api/profile/route";

interface ProfileRow {
  id: string;
  manager_id: string | null;
  display_name: string;
  email: string | null;
}

interface DbResult {
  data: ProfileRow | null;
  error: { code?: string; message?: string } | null;
}

function authUser(options: {
  id?: string;
  email?: string;
  appMetadata?: Record<string, unknown>;
  userMetadata?: Record<string, unknown>;
} = {}) {
  return {
    id: options.id ?? "11111111-1111-4111-8111-111111111111",
    email: options.email ?? "manager@example.com",
    app_metadata: options.appMetadata ?? {},
    user_metadata: options.userMetadata ?? {},
    aud: "authenticated",
    created_at: "2026-07-22T00:00:00.000Z"
  };
}

function profileClient(options: {
  user?: ReturnType<typeof authUser> | null;
  authError?: { message: string } | null;
  reads?: DbResult[];
  inserts?: DbResult[];
}) {
  const reads = [...(options.reads ?? [])];
  const inserts = [...(options.inserts ?? [])];
  const insertedPayloads: Array<Record<string, unknown>> = [];

  const client = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: options.user ?? null },
        error: options.authError ?? null
      })
    },
    from: vi.fn(() => ({
      select: vi.fn(() => {
        const builder = {
          eq: vi.fn(),
          maybeSingle: vi.fn()
        };
        builder.eq.mockReturnValue(builder);
        builder.maybeSingle.mockImplementation(async () =>
          reads.shift() ?? { data: null, error: null }
        );
        return builder;
      }),
      insert: vi.fn((payload: Record<string, unknown>) => {
        insertedPayloads.push(payload);
        const builder = {
          select: vi.fn(),
          maybeSingle: vi.fn()
        };
        builder.select.mockReturnValue(builder);
        builder.maybeSingle.mockImplementation(async () =>
          inserts.shift() ?? { data: null, error: { message: "Unexpected insert" } }
        );
        return builder;
      })
    }))
  };

  return { client, insertedPayloads };
}

function request(token: string | null = "verified-token") {
  return new Request("http://localhost/api/profile", {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined
  });
}

describe("GET /api/profile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 503 when the server-side account client is unavailable", async () => {
    routeMocks.serviceClient.mockReturnValue(null);

    const response = await GET(request());

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ ok: false });
  });

  it("requires and verifies a bearer token", async () => {
    const { client } = profileClient({ user: null, authError: { message: "Invalid JWT" } });
    routeMocks.serviceClient.mockReturnValue(client);

    const response = await GET(request("bad-token"));

    expect(response.status).toBe(401);
    expect(client.auth.getUser).toHaveBeenCalledWith("bad-token");
    expect(client.from).not.toHaveBeenCalled();
  });

  it("returns an existing canonical profile without changing it", async () => {
    const existing: ProfileRow = {
      id: "11111111-1111-4111-8111-111111111111",
      manager_id: "north_bank",
      display_name: "North Bank",
      email: "saved@example.com"
    };
    const { client, insertedPayloads } = profileClient({
      user: authUser({ email: "different@example.com", appMetadata: { role: "admin" } }),
      reads: [{ data: existing, error: null }]
    });
    routeMocks.serviceClient.mockReturnValue(client);

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      profile: {
        id: existing.id,
        managerId: "north_bank",
        displayName: "North Bank",
        email: "saved@example.com",
        demo: false
      },
      admin: true
    });
    expect(insertedPayloads).toHaveLength(0);
  });

  it("never infers administrator access from email or user-editable metadata", async () => {
    const existing: ProfileRow = {
      id: "11111111-1111-4111-8111-111111111111",
      manager_id: "admin_user",
      display_name: "Admin User",
      email: "admin@footyrush.test"
    };
    const { client } = profileClient({
      user: authUser({
        email: "admin@footyrush.test",
        userMetadata: { role: "admin" },
        appMetadata: { role: "member" }
      }),
      reads: [{ data: existing, error: null }]
    });
    routeMocks.serviceClient.mockReturnValue(client);

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ admin: false });
  });

  it("repairs a missing regular profile while leaving manager ID onboarding incomplete", async () => {
    const user = authUser({ userMetadata: { full_name: "OAuth Manager" } });
    const inserted: ProfileRow = {
      id: user.id,
      manager_id: null,
      display_name: "OAuth Manager",
      email: user.email
    };
    const { client, insertedPayloads } = profileClient({
      user,
      reads: [{ data: null, error: null }],
      inserts: [{ data: inserted, error: null }]
    });
    routeMocks.serviceClient.mockReturnValue(client);

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      admin: false,
      profile: { id: user.id, managerId: null, displayName: "OAuth Manager" }
    });
    expect(insertedPayloads).toEqual([
      expect.objectContaining({ id: user.id, manager_id: null, display_name: "OAuth Manager" })
    ]);
  });

  it("preserves and normalizes an explicit manager ID for an orphaned password account", async () => {
    const user = authUser({
      userMetadata: { manager_id: "  North-Bank_9!  ", display_name: "North Bank" }
    });
    const inserted: ProfileRow = {
      id: user.id,
      manager_id: "northbank_9",
      display_name: "North Bank",
      email: user.email
    };
    const { client, insertedPayloads } = profileClient({
      user,
      reads: [{ data: null, error: null }],
      inserts: [{ data: inserted, error: null }]
    });
    routeMocks.serviceClient.mockReturnValue(client);

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      admin: false,
      profile: { managerId: "northbank_9", displayName: "North Bank" }
    });
    expect(insertedPayloads[0]).toMatchObject({ manager_id: "northbank_9" });
  });

  it("falls back to onboarding if an orphan's explicit manager ID is already taken", async () => {
    const user = authUser({ userMetadata: { manager_id: "north_bank" } });
    const inserted: ProfileRow = {
      id: user.id,
      manager_id: null,
      display_name: "manager",
      email: user.email
    };
    const { client, insertedPayloads } = profileClient({
      user,
      reads: [
        { data: null, error: null },
        { data: null, error: null }
      ],
      inserts: [
        { data: null, error: { code: "23505" } },
        { data: inserted, error: null }
      ]
    });
    routeMocks.serviceClient.mockReturnValue(client);

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ profile: { managerId: null }, admin: false });
    expect(insertedPayloads.map((payload) => payload.manager_id)).toEqual(["north_bank", null]);
  });

  it("gives a missing trusted admin a deterministic valid manager ID", async () => {
    const user = authUser({
      appMetadata: { role: "admin" }
    });
    const expectedManagerId = "mgr_bd7662a5eeb416";
    const inserted: ProfileRow = {
      id: user.id,
      manager_id: expectedManagerId,
      display_name: "Admin (tester)",
      email: user.email
    };
    const { client, insertedPayloads } = profileClient({
      user,
      reads: [{ data: null, error: null }],
      inserts: [{ data: inserted, error: null }]
    });
    routeMocks.serviceClient.mockReturnValue(client);

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      admin: true,
      profile: { managerId: expectedManagerId, displayName: "Admin (tester)" }
    });
    expect(insertedPayloads[0]).toMatchObject({ id: user.id, manager_id: expectedManagerId });
    expect(expectedManagerId).toMatch(/^[a-z0-9_]{3,18}$/);
  });

  it("returns the canonical row created by a simultaneous repair", async () => {
    const user = authUser({ appMetadata: { role: "admin" } });
    const raced: ProfileRow = {
      id: user.id,
      manager_id: "already_created",
      display_name: "Existing Admin",
      email: user.email
    };
    const { client, insertedPayloads } = profileClient({
      user,
      reads: [
        { data: null, error: null },
        { data: raced, error: null }
      ],
      inserts: [{ data: null, error: { code: "23505" } }]
    });
    routeMocks.serviceClient.mockReturnValue(client);

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      profile: { managerId: "already_created", displayName: "Existing Admin" },
      admin: true
    });
    expect(insertedPayloads).toHaveLength(1);
  });

  it("uses the next deterministic admin ID after a manager-ID collision", async () => {
    const user = authUser({ appMetadata: { role: "admin" } });
    const fallbackManagerId = "mgr_14e720d477abfc";
    const inserted: ProfileRow = {
      id: user.id,
      manager_id: fallbackManagerId,
      display_name: "Admin (tester)",
      email: user.email
    };
    const { client, insertedPayloads } = profileClient({
      user,
      reads: [
        { data: null, error: null },
        { data: null, error: null }
      ],
      inserts: [
        { data: null, error: { code: "23505" } },
        { data: inserted, error: null }
      ]
    });
    routeMocks.serviceClient.mockReturnValue(client);

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(insertedPayloads).toHaveLength(2);
    expect(insertedPayloads[0]?.manager_id).not.toBe(insertedPayloads[1]?.manager_id);
    expect(insertedPayloads[1]?.manager_id).toBe(fallbackManagerId);
  });

  it("returns 500 for a profile database failure", async () => {
    const { client } = profileClient({
      user: authUser(),
      reads: [{ data: null, error: { message: "database unavailable" } }]
    });
    routeMocks.serviceClient.mockReturnValue(client);

    const response = await GET(request());

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ ok: false });
  });

  it("returns 500 instead of retrying an unrelated insert failure", async () => {
    const { client, insertedPayloads } = profileClient({
      user: authUser(),
      reads: [{ data: null, error: null }],
      inserts: [{ data: null, error: { code: "42501", message: "permission denied" } }]
    });
    routeMocks.serviceClient.mockReturnValue(client);

    const response = await GET(request());

    expect(response.status).toBe(500);
    expect(insertedPayloads).toHaveLength(1);
  });
});
