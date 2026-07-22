import { beforeEach, describe, expect, it, vi } from "vitest";
import { managerIdValidationMessage, normalizeManagerId } from "@/lib/user/manager-id";

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

import { PATCH } from "@/app/api/registration/route";

interface ProfileRow {
  id: string;
  manager_id: string | null;
  display_name: string;
  email: string | null;
}

function profileClient(options: {
  updated?: ProfileRow | null;
  updateError?: { code?: string; message?: string } | null;
  existing?: ProfileRow | null;
}) {
  const updateBuilder = {
    update: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    select: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: options.updated ?? null,
      error: options.updateError ?? null
    })
  };
  updateBuilder.update.mockReturnValue(updateBuilder);
  updateBuilder.eq.mockReturnValue(updateBuilder);
  updateBuilder.is.mockReturnValue(updateBuilder);
  updateBuilder.select.mockReturnValue(updateBuilder);

  const selectBuilder = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data: options.existing ?? null, error: null })
  };
  selectBuilder.select.mockReturnValue(selectBuilder);
  selectBuilder.eq.mockReturnValue(selectBuilder);

  return {
    from: vi.fn()
      .mockReturnValueOnce(updateBuilder)
      .mockReturnValueOnce(selectBuilder),
    updateBuilder
  };
}

function patchRequest(managerId: unknown, token = "verified-token") {
  return new Request("http://localhost/api/registration", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ managerId })
  });
}

describe("registration manager IDs", () => {
  it("normalizes manager IDs to the stored username format", () => {
    expect(normalizeManagerId("  Admin-User!  ")).toBe("adminuser");
    expect(normalizeManagerId("North_Bank_98")).toBe("north_bank_98");
  });

  it("requires a usable unique ID format", () => {
    expect(managerIdValidationMessage("")).toBe("Choose a unique manager ID.");
    expect(managerIdValidationMessage("ab")).toContain("3-18 characters");
    expect(managerIdValidationMessage("valid_id_9")).toBeNull();
  });
});

describe("PATCH /api/registration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routeMocks.rateLimit.mockResolvedValue({ success: true });
    routeMocks.authenticatedUserId.mockResolvedValue("profile-1");
  });

  it("rejects a request without a verified bearer identity", async () => {
    routeMocks.authenticatedUserId.mockResolvedValue(null);

    const response = await PATCH(patchRequest("north_bank"));

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ ok: false });
    expect(routeMocks.serviceClient).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid manager ID", async () => {
    const response = await PATCH(patchRequest("ab"));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false, managerId: "ab" });
    expect(routeMocks.serviceClient).not.toHaveBeenCalled();
  });

  it("claims the ID only on the authenticated user's incomplete profile", async () => {
    const profile: ProfileRow = {
      id: "profile-1",
      manager_id: "north_bank",
      display_name: "North Bank",
      email: "north@example.com"
    };
    const client = profileClient({ updated: profile });
    routeMocks.serviceClient.mockReturnValue(client);

    const response = await PATCH(patchRequest("North_Bank"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      profile: {
        id: "profile-1",
        managerId: "north_bank",
        displayName: "North Bank",
        email: "north@example.com",
        demo: false
      }
    });
    expect(client.updateBuilder.eq).toHaveBeenCalledWith("id", "profile-1");
    expect(client.updateBuilder.is).toHaveBeenCalledWith("manager_id", null);
  });

  it("maps a uniqueness race to 409", async () => {
    const client = profileClient({ updateError: { code: "23505" } });
    routeMocks.serviceClient.mockReturnValue(client);

    const response = await PATCH(patchRequest("north_bank"));

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      ok: false,
      reason: "That manager ID is already taken."
    });
  });

  it("is idempotent when the authenticated profile already owns the ID", async () => {
    const profile: ProfileRow = {
      id: "profile-1",
      manager_id: "north_bank",
      display_name: "North Bank",
      email: "north@example.com"
    };
    const client = profileClient({ updated: null, existing: profile });
    routeMocks.serviceClient.mockReturnValue(client);

    const response = await PATCH(patchRequest("north_bank"));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      profile: { id: "profile-1", managerId: "north_bank" }
    });
  });
});
