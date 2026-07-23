import { getSupabaseServiceClient } from "@/lib/supabase/server";

/**
 * Resolve the *verified* authenticated user id from a request, by validating the
 * Supabase access token sent in the Authorization header against the auth server.
 *
 * This is the trust anchor for competitive routes: identity must never be taken
 * from a client-supplied body field (which is forgeable). Returns null for
 * anonymous/guest callers or when the token is missing/invalid.
 */
export async function getAuthenticatedUserId(request: Request): Promise<string | null> {
  const header = request.headers.get("authorization") ?? request.headers.get("Authorization");
  if (!header) {
    return null;
  }
  const match = /^bearer\s+(.+)$/i.exec(header.trim());
  const token = match?.[1]?.trim();
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
    return data.user.id;
  } catch {
    return null;
  }
}
