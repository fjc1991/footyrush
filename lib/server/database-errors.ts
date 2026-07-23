interface DatabaseErrorLike {
  code?: unknown;
  message?: unknown;
  details?: unknown;
  hint?: unknown;
}

const missingSchemaCodes = new Set(["42703", "42883", "PGRST202", "PGRST204"]);

/**
 * Detect the rolling-deploy state where application code is newer than the
 * competition-progress migration. This is deliberately narrow so ordinary
 * database failures are never hidden by the compatibility path.
 */
export function isCompetitionSchemaMissing(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const candidate = error as DatabaseErrorLike;
  if (typeof candidate.code === "string" && missingSchemaCodes.has(candidate.code)) {
    return true;
  }
  const text = [candidate.message, candidate.details, candidate.hint]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
  return (
    text.includes("record_competition_result") &&
    (text.includes("schema cache") || text.includes("does not exist") || text.includes("could not find"))
  );
}
