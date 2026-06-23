import { describe, expect, it } from "vitest";
import { managerIdValidationMessage, normalizeManagerId } from "@/lib/user/manager-id";

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
