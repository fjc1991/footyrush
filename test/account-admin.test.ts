import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ authenticatedUser: vi.fn() }));
vi.mock("@/lib/server/auth", () => ({ getAuthenticatedUser: mocks.authenticatedUser }));

import { requireAdmin } from "@/lib/server/account";
import { grouped, MIN_AUDIENCE_SEGMENT } from "@/app/api/admin/analytics/route";

describe("administrator account controls", () => {
  beforeEach(() => vi.clearAllMocks());

  it("trusts only verified app metadata for administrator access", async () => {
    mocks.authenticatedUser.mockResolvedValue({
      id: "profile-1",
      app_metadata: { role: "member" },
      user_metadata: { role: "admin" },
      email: "admin@footyrush.test"
    });
    expect(await requireAdmin(new Request("http://localhost"))).toBeNull();

    mocks.authenticatedUser.mockResolvedValue({
      id: "profile-1",
      app_metadata: { role: "admin" },
      user_metadata: {}
    });
    expect(await requireAdmin(new Request("http://localhost"))).toMatchObject({ profileId: "profile-1" });
  });

  it("suppresses opted-in advertiser segments smaller than ten", () => {
    const rows = [
      ...Array.from({ length: MIN_AUDIENCE_SEGMENT - 1 }, () => ({ country_code: "GB" })),
      ...Array.from({ length: MIN_AUDIENCE_SEGMENT }, () => ({ country_code: "ES" }))
    ];
    expect(grouped(rows, "country_code")).toEqual([{ label: "ES", count: 10 }]);
  });
});
