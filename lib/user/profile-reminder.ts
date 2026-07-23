export const PROFILE_REMINDER_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000;
export const PROFILE_COMPLETION_TARGET = 5;
export const PROFILE_PREFERENCE_TOTAL = 10;

const preferenceKeys = [
  ["country_code", "countryCode"],
  ["age_band", "ageBand"],
  ["gender"],
  ["favourite_club_code", "favouriteClub"],
  ["favourite_current_player", "favouriteCurrentPlayer"],
  ["favourite_legend", "favouriteLegend"],
  ["followed_leagues", "followedLeagues"],
  ["preferred_game_mode", "preferredGameMode"],
  ["discovery_source", "discoverySource"],
  ["preferred_kit_style", "preferredKitStyle"]
] as const;

function hasValue(value: unknown): boolean {
  if (Array.isArray(value)) return value.some((item) => typeof item === "string" && item.trim().length > 0);
  return typeof value === "string" ? value.trim().length > 0 : value !== null && value !== undefined;
}

export function countProfilePreferences(preferences: Record<string, unknown> | null | undefined): number {
  if (!preferences) return 0;
  return preferenceKeys.reduce((count, aliases) => (
    aliases.some((key) => hasValue(preferences[key])) ? count + 1 : count
  ), 0);
}

export function shouldShowProfileReminder({
  preferences,
  lastShownAt,
  now = Date.now()
}: {
  preferences: Record<string, unknown> | null | undefined;
  lastShownAt: number | null;
  now?: number;
}): boolean {
  if (countProfilePreferences(preferences) >= PROFILE_COMPLETION_TARGET) return false;
  if (lastShownAt === null || !Number.isFinite(lastShownAt)) return true;
  return now - lastShownAt >= PROFILE_REMINDER_INTERVAL_MS;
}
