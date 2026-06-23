export function normalizeManagerId(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
}

export function managerIdValidationMessage(managerId: string): string | null {
  if (!managerId) {
    return "Choose a unique manager ID.";
  }
  if (!/^[a-z0-9_]{3,18}$/.test(managerId)) {
    return "Manager ID must be 3-18 characters using lowercase letters, numbers or underscores.";
  }
  return null;
}
