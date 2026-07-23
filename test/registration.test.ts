import { beforeEach, describe, expect, it, vi } from "vitest";
import { managerIdValidationMessage, normalizeManagerId } from "@/lib/user/manager-id";

const routeMocks = vi.hoisted(() => ({
  authenticatedUserId: vi.fn(),
  serviceClient: vi.fn(),
  rateLimit: vi.fn()
}));
vi.mock("@/lib/server/auth", () => ({ getAuthenticatedUserId: routeMocks.authenticatedUserId }));
vi.mock("@/lib/supabase/server", () => ({ getSupabaseServiceClient: routeMocks.serviceClient }));
vi.mock("@/lib/server/rate-limit", () => ({
  rateLimit: routeMocks.rateLimit,
  tooManyRequests: vi.fn(() => Response.json({ ok: false }, { status: 429 }))
}));

import { PATCH } from "@/app/api/registration/route";

function patchRequest(managerId: unknown) {
  return new Request("http://localhost/api/registration", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: "Bearer verified-token" },
    body: JSON.stringify({ managerId })
  });
}

function service(result: { data?: unknown; error?: { code?: string; message?: string } | null }) {
  return { rpc: vi.fn().mockResolvedValue({ data: result.data ?? null, error: result.error ?? null }) };
}

describe("registration manager IDs", () => {
  it("normalizes and validates manager IDs", () => {
    expect(normalizeManagerId("  Admin-User!  ")).toBe("adminuser");
    expect(managerIdValidationMessage("ab")).toContain("3-18 characters");
    expect(managerIdValidationMessage("valid_id_9")).toBeNull();
  });
});

describe("PATCH /api/registration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routeMocks.rateLimit.mockResolvedValue({ success: true });
    routeMocks.authenticatedUserId.mockResolvedValue("11111111-1111-4111-8111-111111111111");
  });

  it("requires a verified account", async () => {
    routeMocks.authenticatedUserId.mockResolvedValue(null);
    expect((await PATCH(patchRequest("north_bank"))).status).toBe(401);
  });

  it("rejects invalid IDs", async () => {
    expect((await PATCH(patchRequest("ab"))).status).toBe(400);
  });

  it("uses the atomic database claim and returns public identity", async () => {
    const db = service({
      data: {
        id: "11111111-1111-4111-8111-111111111111",
        manager_id: "north_bank",
        display_name: "@north_bank",
        email: "north@example.com",
        manager_id_confirmed_at: "2026-07-23T00:00:00Z",
        manager_id_rename_available: false
      }
    });
    routeMocks.serviceClient.mockReturnValue(db);
    const response = await PATCH(patchRequest("North_Bank"));
    expect(response.status).toBe(200);
    expect(db.rpc).toHaveBeenCalledWith("claim_manager_id", {
      p_profile_id: "11111111-1111-4111-8111-111111111111",
      p_manager_id: "north_bank"
    });
    expect(await response.json()).toMatchObject({
      profile: { managerId: "north_bank", displayName: "@north_bank", renameAvailable: false }
    });
  });

  it("maps duplicate claims and consumed entitlements to 409", async () => {
    routeMocks.serviceClient.mockReturnValue(service({ error: { code: "23505" } }));
    expect((await PATCH(patchRequest("north_bank"))).status).toBe(409);
    routeMocks.serviceClient.mockReturnValue(service({ error: { code: "P0001" } }));
    expect((await PATCH(patchRequest("another_id"))).status).toBe(409);
  });

  it("reports a migration rollout instead of silently changing identity", async () => {
    routeMocks.serviceClient.mockReturnValue(service({ error: { code: "PGRST202" } }));
    expect((await PATCH(patchRequest("north_bank"))).status).toBe(503);
  });
});
