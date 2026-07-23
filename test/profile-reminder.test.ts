import { describe, expect, it } from "vitest";
import {
  countProfilePreferences,
  PROFILE_REMINDER_INTERVAL_MS,
  shouldShowProfileReminder
} from "@/lib/user/profile-reminder";

describe("profile completion reminder", () => {
  it("counts both database and form preference names", () => {
    expect(countProfilePreferences({
      country_code: "GB",
      ageBand: "25_34",
      followed_leagues: ["Premier League", ""],
      favouriteClub: "Arsenal"
    })).toBe(4);
  });

  it("shows incomplete profiles when no reminder has been recorded", () => {
    expect(shouldShowProfileReminder({
      preferences: { favourite_club_code: "Arsenal" },
      lastShownAt: null,
      now: 1_000_000
    })).toBe(true);
  });

  it("waits thirty days before reminding again", () => {
    const now = 2_000_000_000;
    const preferences = { favourite_club_code: "Arsenal" };
    expect(shouldShowProfileReminder({
      preferences,
      lastShownAt: now - PROFILE_REMINDER_INTERVAL_MS + 1,
      now
    })).toBe(false);
    expect(shouldShowProfileReminder({
      preferences,
      lastShownAt: now - PROFILE_REMINDER_INTERVAL_MS,
      now
    })).toBe(true);
  });

  it("stops reminding once five optional details are present", () => {
    expect(shouldShowProfileReminder({
      preferences: {
        country_code: "GB",
        age_band: "25_34",
        favourite_club_code: "Arsenal",
        preferred_game_mode: "invincible",
        preferred_kit_style: "retro"
      },
      lastShownAt: null
    })).toBe(false);
  });
});
