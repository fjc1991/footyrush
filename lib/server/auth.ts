import { getSupabaseServiceClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";

function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? request.headers.get("Authorization");
  if (!header) {
    return null;
  }

  const match = /^bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || null;
}

/**
 * Return the Supabase user represented by a verified bearer token.
 *
 * Callers may trust fields returned by the auth server's `app_metadata`, but
 * must not use client-editable `user_metadata` for authorization decisions.
 */
export async function getAuthenticatedUser(request: Request): Promise<User | null> {
  const token = bearerToken(request);
  if (!token) {
    return null;
  }

  const supabase = getSupabaseServiceClient();
  if (!supabase) {
    return null;
  }

  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      return null;
    }
    return data.user;
  } catch {
    return null;
  }
}

/**
 * Resolve the *verified* authenticated user id from a request, by validating the
 * Supabase access token sent in the Authorization header against the auth server.
 *
 * This is the trust anchor for competitive routes: identity must never be taken
 * from a client-supplied body field (which is forgeable). Returns null for
 * anonymous/guest callers or when the token is missing/invalid.
 */
export async function getAuthenticatedUserId(request: Request): Promise<string | null> {
  return (await getAuthenticatedUser(request))?.id ?? null;
}
