import { describe, expect, it } from "vitest";
import { canonicalAccountRunId, isResultUuid } from "@/lib/game/result-id";

describe("account result IDs", () => {
  it("creates a deterministic UUIDv8 for a Mini League run", async () => {
    const first = await canonicalAccountRunId("profile-1", "minileague", "league-123-456");
    const second = await canonicalAccountRunId("profile-1", "minileague", "league-123-456");

    expect(first).toBe(second);
    expect(isResultUuid(first)).toBe(true);
    expect(first[14]).toBe("8");
  });

  it("scopes the same browser run to the authenticated profile", async () => {
    await expect(canonicalAccountRunId("profile-1", "minileague", "league-1"))
      .resolves.not.toBe(await canonicalAccountRunId("profile-2", "minileague", "league-1"));
  });

  it("keeps UUID retries and verified Invincible attempt IDs unchanged", async () => {
    const uuid = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    await expect(canonicalAccountRunId("profile-1", "minileague", uuid)).resolves.toBe(uuid);
    await expect(canonicalAccountRunId("profile-1", "invincible", uuid)).resolves.toBe(uuid);
  });
});
