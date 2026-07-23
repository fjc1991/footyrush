import type { User } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "./auth";

export interface AdminIdentity {
  user: User;
  profileId: string;
}

export async function requireAdmin(request: Request): Promise<AdminIdentity | null> {
  const user = await getAuthenticatedUser(request);
  if (!user || user.app_metadata?.role !== "admin") return null;
  return { user, profileId: user.id };
}

export function isAccountSchemaMissing(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: string; message?: string };
  return (
    ["42P01", "42703", "PGRST202", "PGRST204"].includes(candidate.code ?? "") ||
    /user_visits|user_mode_runs|profile_preferences|marketing_preferences/i.test(candidate.message ?? "")
  );
}

export function cleanOptionalText(value: unknown, maximum = 80): string | null | undefined {
  if (value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, maximum) : null;
}
