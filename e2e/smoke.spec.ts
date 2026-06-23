import { expect, test } from "@playwright/test";

/**
 * Smoke coverage for the critical path that the build/runtime break (the missing
 * demoLeaderboardRecords export, which crashed a render-time useMemo) would have
 * tripped. Kept deliberately resilient: it drives setup + both modes via roles,
 * avoiding the top-nav "Play" tab that collides with in-match controls.
 */

test("home renders without runtime errors and both modes are selectable", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  // Root redirects to the default locale.
  await page.goto("/");
  await expect(page).toHaveURL(/\/en\/?$/);

  // The game mode chooser proves the client app mounted (this is exactly what
  // crashed when the leaderboard useMemo threw on the missing export).
  const miniLeague = page.getByRole("button", { name: /Mini league/i });
  const beInvincible = page.getByRole("button", { name: /Be Invincible/i });
  await expect(miniLeague).toBeVisible();
  await expect(beInvincible).toBeVisible();

  // Both modes are selectable.
  await beInvincible.click();
  await expect(beInvincible).toHaveClass(/active/);
  await miniLeague.click();
  await expect(miniLeague).toHaveClass(/active/);

  // Setup chrome is present (manager shuffle is part of the draft setup flow).
  await expect(page.getByRole("button", { name: /Shuffle manager/i })).toBeVisible();

  expect(pageErrors, `Unexpected runtime errors: ${pageErrors.join("; ")}`).toEqual([]);
});
