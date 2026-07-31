import { expect, test, type Page } from "@playwright/test";

async function draftCompleteSquad(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "Shuffle manager", exact: true }).click();
  const startDraft = page.getByRole("button", { name: "Start draft", exact: true });
  await expect(startDraft).toBeEnabled({ timeout: 5_000 });
  await startDraft.click();
  await page.getByRole("button", { name: "Spin", exact: true }).click();

  for (let pick = 0; pick < 16; pick += 1) {
    const expectedPick = pick + 1;
    await expect(page.locator(".game-hud-phase > strong")).toHaveText(
      `Pick ${expectedPick} of 16`,
      { timeout: 8_000 }
    );
    await page.locator(".candidate-card").first().click();
    const roleDialog = page.getByRole("dialog", { name: /Assign a role to/i });
    await expect(roleDialog).toBeVisible();
    await roleDialog.locator(".slot-option").first().click();
  }

  await expect(page.getByRole("heading", { name: "Your matchday squad is ready" })).toBeVisible();
}

/**
 * Smoke coverage for the critical path that the build/runtime break (the missing
 * demoLeaderboardRecords export, which crashed a render-time useMemo) would have
 * tripped. Kept deliberately resilient: it drives setup + both modes via roles,
 * avoiding the top-nav "Play" tab that collides with in-match controls.
 */

test("home renders without runtime errors and both modes are selectable", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.addInitScript(() => window.localStorage.setItem("footyrush.analyticsConsent", "denied"));

  // Root redirects to the default locale.
  await page.goto("/");
  await expect(page).toHaveURL(/\/en\/?$/);

  // The game mode chooser proves the client app mounted (this is exactly what
  // crashed when the leaderboard useMemo threw on the missing export).
  const miniLeague = page.getByRole("button", { name: /Mini league/i });
  const beInvincible = page.getByRole("button", { name: /Be Invincible/i });
  await expect(page.locator("[data-app-ready='true']")).toBeVisible({ timeout: 15_000 });
  await expect(miniLeague).toBeVisible();
  await expect(beInvincible).toBeVisible();

  // X is the only social sign-in offered; the retired Google action is absent.
  await page.locator(".profile-pill").click();
  const authDialog = page.getByRole("dialog", { name: "Create your manager ID", exact: true });
  const xLogin = authDialog.getByRole("button", { name: "Continue with X", exact: true });
  const emailInput = authDialog.getByPlaceholder("you@example.com");
  await expect(xLogin).toBeVisible();
  await expect(xLogin).toHaveClass(/primary-button/);
  await expect(authDialog.getByText("Recommended", { exact: true })).toBeVisible();
  await expect(authDialog.getByText("Or use email", { exact: true })).toBeVisible();
  const authOrder = await Promise.all([xLogin.boundingBox(), emailInput.boundingBox()]);
  expect(authOrder[0]?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(authOrder[1]?.y ?? 0);
  await expect(authDialog.getByRole("button", { name: "Sign in", exact: true })).toHaveClass(/secondary-button/);
  await expect(page.getByRole("button", { name: /Continue with Google/i })).toHaveCount(0);
  await page.getByRole("button", { name: "Close sign-in", exact: true }).click();

  // Both modes are selectable.
  await beInvincible.click();
  await expect(beInvincible).toHaveClass(/active/);
  await miniLeague.click();
  await expect(miniLeague).toHaveClass(/active/);

  // Setup chrome is present (manager shuffle is part of the draft setup flow).
  await expect(page.getByRole("button", { name: /Shuffle manager/i })).toBeVisible();

  // Competition history surfaces mount and the new title board stays separate
  // from the five-match points ranking.
  await page.getByRole("button", { name: "Leaderboards", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Daily Mini league points/i })).toBeVisible();
  await page.getByRole("button", { name: "League wins", exact: true }).click();
  await expect(page.getByRole("heading", { name: /All time League wins/i })).toBeVisible();
  await expect(page.getByRole("button", { name: "All time", exact: true })).toHaveClass(/active/);
  await page.getByRole("button", { name: "Invincible points", exact: true }).click();
  await expect(page.getByRole("heading", { name: /All time Invincible points/i })).toBeVisible();

  await page.getByRole("button", { name: "My home", exact: true }).click();
  await expect(page.getByRole("heading", { name: "My home", exact: true })).toBeVisible();
  await expect(page.getByText("Invincible seasons", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Play Mini League/i }).click();
  await expect(page.getByRole("button", { name: "Shuffle manager", exact: true })).toBeVisible();
  await expect(page.locator(".draft-grid")).toHaveCount(0);

  expect(pageErrors, `Unexpected runtime errors: ${pageErrors.join("; ")}`).toEqual([]);
});

test("Mini League decisions lead into prominent mode choices and player milestones", async ({ page }) => {
  test.setTimeout(90_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.addInitScript(() => window.localStorage.setItem("footyrush.analyticsConsent", "denied"));
  await page.goto("/en");
  await expect(page.locator("[data-app-ready='true']")).toBeVisible({ timeout: 15_000 });
  await draftCompleteSquad(page);
  await page.getByRole("button", { name: "Enter minileague", exact: true }).click();

  let sawIncident = false;
  let sawRequiredLineupChoice = false;

  for (let round = 0; round < 5; round += 1) {
    const lineupDecision = page.locator(".mini-lineup-decision");
    if (await lineupDecision.isVisible().catch(() => false)) {
      sawRequiredLineupChoice = true;
      const rows = lineupDecision.locator(".mini-replacement-row");
      for (let row = 0; row < await rows.count(); row += 1) {
        const option = rows.nth(row).locator(".sub-option").first();
        if (await option.count()) {
          await option.click();
          await expect(option).toHaveAttribute("aria-pressed", "true");
        }
      }
    }

    if (round === 0) {
      await expect(page.locator(".impact-sub-option").first()).toBeVisible();
      await page.locator(".impact-sub-option").first().click();
      await expect(page.locator(".impact-sub-option.active")).toHaveCount(1);
    }

    const kickOff = page.getByRole("button", { name: "Kick off", exact: true });
    await expect(kickOff).toBeEnabled();
    await kickOff.click();
    await page.getByRole("button", { name: "Finish now", exact: true }).click();

    if (round === 0) {
      await expect(page.locator(".match-turning-point").filter({ hasText: "Impact Sub" })).toBeVisible();
    }
    if (await page.locator(".match-turning-point.red_card, .match-turning-point.injury").count()) {
      sawIncident = true;
    }

    await page.getByRole("button", { name: "Continue league", exact: true }).click();
    if (round < 4) {
      const summary = page.getByRole("dialog").filter({ hasText: "Full-time scores" });
      await expect(summary).toBeVisible();
      await summary.getByRole("button", { name: "Next round →", exact: true }).click();
    }
  }

  expect(sawIncident).toBe(true);
  expect(sawRequiredLineupChoice).toBe(true);
  await expect(page.getByRole("heading", { name: "Choose your next challenge", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Play Mini League/i })).toBeVisible();
  const invincibleChoice = page.getByRole("button", { name: /Start Be Invincible/i });
  await expect(invincibleChoice).toBeVisible();
  await expect(page.getByRole("heading", { name: "The squad story you can beat", exact: true })).toBeVisible();
  await expect(page.getByText("Career chase", { exact: true })).toBeVisible();

  const milestoneNudge = page.locator(".milestone-nudge-close");
  if (await milestoneNudge.isVisible().catch(() => false)) {
    await milestoneNudge.click();
  }
  await page.locator(".profile-pill").click();
  const completionAuthDialog = page.getByRole("dialog", { name: "Create your manager ID", exact: true });
  await expect(completionAuthDialog.getByRole("button", { name: "Continue with X", exact: true })).toBeEnabled();
  await completionAuthDialog.getByRole("button", { name: "Close sign-in", exact: true }).click();

  await invincibleChoice.click();
  await expect(page.locator("[data-game-mode='invincible']")).toBeVisible();
  await expect(page.locator(".draft-grid")).toBeVisible();
  await page.getByRole("button", { name: "My home", exact: true }).click();
  const resumeSeason = page.getByRole("button", { name: /Resume Be Invincible/i });
  await expect(resumeSeason).toBeVisible();
  await expect(page.getByRole("button", { name: /Play Mini League/i })).toHaveCount(0);
  await resumeSeason.click();
  await expect(page.locator(".draft-grid")).toBeVisible();
  expect(pageErrors, `Unexpected runtime errors: ${pageErrors.join("; ")}`).toEqual([]);
});

test("reduced-motion Invincible auto-play advances routine matches without a manual continue", async ({ page }) => {
  test.setTimeout(60_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.addInitScript(() => {
    window.localStorage.setItem("footyrush.analyticsConsent", "denied");
    Date.now = () => 1_700_000_000_000;
  });
  await page.goto("/en");
  await expect(page.locator("[data-app-ready='true']")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: /Be Invincible/i }).click();
  await draftCompleteSquad(page);
  await page.getByRole("button", { name: "Start Be Invincible season", exact: true }).click();

  const outOfFormDecision = page.locator(".season-event-card").filter({ hasText: "Out of form" });
  if (await outOfFormDecision.isVisible().catch(() => false)) {
    await outOfFormDecision.locator(".sub-option").first().click();
  }

  await page.getByRole("button", { name: "Kick off season", exact: true }).click();
  await expect(page.getByText("Match 2 of 38", { exact: true })).toBeVisible({ timeout: 8_000 });
  await expect(page.getByRole("button", { name: "Continue", exact: true })).toHaveCount(0);
  expect(pageErrors, `Unexpected runtime errors: ${pageErrors.join("; ")}`).toEqual([]);
});

test("X account legal pages are public and connected", async ({ page }) => {
  await page.goto("/en/privacy");
  await expect(page.getByRole("heading", { name: "Privacy Policy", exact: true })).toBeVisible();
  const termsLink = page.getByLabel("Legal", { exact: true }).getByRole("link", { name: "Terms", exact: true });
  await expect(termsLink).toHaveAttribute("href", "/en/terms");

  await Promise.all([
    page.waitForURL(/\/en\/terms\/?$/),
    termsLink.click()
  ]);
  await expect(page.getByRole("heading", { name: "Terms of Use", exact: true })).toBeVisible();
});

for (const viewport of [
  { name: "wide desktop", width: 2560, height: 1400 },
  { name: "desktop", width: 1440, height: 1000 },
  { name: "14-inch MacBook", width: 1512, height: 823 },
  { name: "laptop", width: 1024, height: 768 },
  { name: "tablet", width: 768, height: 900 },
  { name: "mobile", width: 390, height: 844 }
]) {
  test(`setup uses available space without clipping on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.addInitScript(() => {
      window.localStorage.setItem("footyrush.analyticsConsent", "denied");
    });
    await page.goto("/en");
    await expect(page.locator("[data-app-ready='true']")).toBeVisible({ timeout: 15_000 });

    if (viewport.name === "14-inch MacBook") {
      await page.getByRole("button", { name: "Shuffle manager", exact: true }).click();
      await expect(page.getByRole("button", { name: "Start draft", exact: true })).toBeEnabled();
    }

    const dimensions = await page.evaluate(() => {
      const app = document.querySelector(".app-shell")?.getBoundingClientRect();
      const setup = document.querySelector(".setup-home")?.getBoundingClientRect();
      const startDraft = Array.from(document.querySelectorAll("button"))
        .find((button) => button.textContent?.includes("Start draft"))
        ?.getBoundingClientRect();
      return {
        appWidth: app?.width ?? 0,
        setupWidth: setup?.width ?? 0,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        startDraftBottom: startDraft?.bottom ?? Number.POSITIVE_INFINITY
      };
    });

    expect(dimensions.overflow).toBe(0);
    expect(dimensions.setupWidth).toBeGreaterThan(
      viewport.width * (viewport.width >= 2000 ? 0.78 : 0.88)
    );
    expect(dimensions.appWidth).toBeGreaterThan(
      viewport.width * (viewport.width >= 2000 ? 0.8 : 0.95)
    );
    if (viewport.name === "14-inch MacBook") {
      expect(dimensions.startDraftBottom).toBeLessThanOrEqual(viewport.height);
    }
  });
}

test("draft workspace prioritizes the draft and keeps the full pitch onscreen", async ({ page }) => {
  await page.setViewportSize({ width: 2048, height: 900 });
  await page.addInitScript(() => {
    window.localStorage.setItem("footyrush.analyticsConsent", "denied");
  });
  await page.goto("/en");
  await expect(page.locator("[data-app-ready='true']")).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "Shuffle manager", exact: true }).click();
  const startDraft = page.getByRole("button", { name: "Start draft", exact: true });
  await expect(startDraft).toBeEnabled({ timeout: 5_000 });
  await startDraft.click();
  await expect(page.locator(".draft-grid")).toBeVisible();

  const dimensions = await page.evaluate(() => {
    const rect = (selector: string) => document.querySelector(selector)?.getBoundingClientRect();
    const board = rect(".draft-board");
    const assistant = rect(".draft-main .assistant-strip");
    const right = rect(".draft-right");
    const pitchPanel = rect(".draft-right .squad-panel");
    const pitch = rect(".draft-right .pitch-container");
    const formation = rect(".draft-right .formation-panel");
    const formationButtons = Array.from(document.querySelectorAll(".draft-right .formation-button"))
      .slice(0, 2)
      .map((element) => element.getBoundingClientRect());
    return {
      boardWidth: board?.width ?? 0,
      assistantWidth: assistant?.width ?? 0,
      assistantTop: assistant?.top ?? 0,
      rightWidth: right?.width ?? 0,
      pitchPanelTop: pitchPanel?.top ?? 0,
      pitchWidth: pitch?.width ?? 0,
      pitchBottom: pitch?.bottom ?? Number.POSITIVE_INFINITY,
      formationWidth: formation?.width ?? 0,
      formationFirstX: formationButtons[0]?.x ?? 0,
      formationFirstY: formationButtons[0]?.y ?? 0,
      formationSecondX: formationButtons[1]?.x ?? Number.POSITIVE_INFINITY,
      formationSecondY: formationButtons[1]?.y ?? 0,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
    };
  });

  expect(dimensions.overflow).toBe(0);
  expect(dimensions.boardWidth).toBeGreaterThan(dimensions.rightWidth * 1.5);
  expect(Math.abs(dimensions.assistantWidth - dimensions.boardWidth)).toBeLessThanOrEqual(2);
  expect(Math.abs(dimensions.pitchPanelTop - dimensions.assistantTop)).toBeLessThanOrEqual(2);
  expect(dimensions.pitchWidth).toBeGreaterThanOrEqual(300);
  expect(dimensions.pitchWidth).toBeLessThanOrEqual(340);
  expect(dimensions.pitchBottom).toBeLessThanOrEqual(900);
  expect(dimensions.formationWidth).toBeGreaterThanOrEqual(145);
  expect(dimensions.formationWidth).toBeLessThanOrEqual(180);
  expect(Math.abs(dimensions.formationFirstX - dimensions.formationSecondX)).toBeLessThanOrEqual(2);
  expect(dimensions.formationSecondY).toBeGreaterThan(dimensions.formationFirstY);

  const spin = page.getByRole("button", { name: "Spin", exact: true });
  await expect(spin).toBeEnabled({ timeout: 10_000 });
  await spin.click();
  await expect(page.locator(".candidate-card").first()).toBeVisible({ timeout: 5_000 });
  await expect(page.locator(".candidate-card")).toHaveCount(8);
  await page.getByRole("button", { name: /View full squad \(\d+\)/ }).click();
  await expect.poll(() => page.locator(".candidate-card").count()).toBeGreaterThan(8);
  await page.getByRole("button", { name: "Back to shortlist", exact: true }).click();
  await expect(page.locator(".candidate-card")).toHaveCount(8);
  await expect(page.locator(".draw-ticket-kit")).toBeVisible();
  await expect(page.locator(".fm-row-kit")).toHaveCount(0);
  expect(await page.locator(".candidate-card-number").count()).toBeGreaterThan(0);
  const playerNameStyle = await page.locator(".candidate-card-name").first().evaluate((element) => {
    const style = window.getComputedStyle(element);
    const main = element.getBoundingClientRect();
    return {
      whiteSpace: style.whiteSpace,
      textOverflow: style.textOverflow,
      overflow: style.overflow,
      overflowWrap: style.overflowWrap,
      wordBreak: style.wordBreak,
      identityWidth: main?.width ?? 0
    };
  });
  expect(playerNameStyle.whiteSpace).not.toBe("nowrap");
  expect(playerNameStyle.textOverflow).not.toBe("ellipsis");
  expect(playerNameStyle.overflow).not.toBe("hidden");
  expect(playerNameStyle.overflowWrap).not.toBe("anywhere");
  expect(playerNameStyle.wordBreak).toBe("normal");
  expect(playerNameStyle.identityWidth).toBeGreaterThanOrEqual(180);

  const candidateLayout = await page.locator(".candidate-card").evaluateAll((elements) => {
    const cards = elements.slice(0, 4).map((element) => ({
      ...element.getBoundingClientRect().toJSON(),
      rating: Number((element as HTMLElement).dataset.rating)
    }));
    return cards;
  });
  expect(candidateLayout.length).toBeGreaterThanOrEqual(4);
  expect(Math.abs(candidateLayout[0].y - candidateLayout[1].y)).toBeLessThanOrEqual(2);
  expect(candidateLayout[1].x).toBeGreaterThan(candidateLayout[0].x);
  expect(Math.abs(candidateLayout[0].x - candidateLayout[2].x)).toBeLessThanOrEqual(2);
  expect(candidateLayout[2].y).toBeGreaterThan(candidateLayout[0].y);
  expect(candidateLayout[0].rating).toBeGreaterThanOrEqual(candidateLayout[1].rating);
  expect(candidateLayout[1].rating).toBeGreaterThanOrEqual(candidateLayout[2].rating);
  await expect(page.locator(".candidate-list .fit-badge")).toHaveCount(0);
  await expect(page.locator(".candidate-list .slot-picker-stats")).toHaveCount(0);

  await page.locator(".candidate-card").first().click();
  const roleDialog = page.getByRole("dialog", { name: /Assign a role to/i });
  await expect(roleDialog).toBeVisible();
  await expect(roleDialog.locator(".slot-picker-stats")).toBeVisible();
  await expect(roleDialog.getByText("Role suitability", { exact: true })).toBeVisible();
  await expect(roleDialog.locator(".fit-badge").first()).toBeVisible();
  await expect(roleDialog.locator(".slot-option").first()).toContainText(/rating drop/i);

  const assistantGap = await page.locator(".manager-avatar.compact").evaluate((element) =>
    Number.parseFloat(window.getComputedStyle(element).columnGap)
  );
  expect(assistantGap).toBeGreaterThanOrEqual(12);
});

test("optional analytics requires a clear preference and remains reversible", async ({ page }) => {
  await page.addInitScript(() => window.localStorage.removeItem("footyrush.analyticsConsent"));
  await page.goto("/en");

  const consent = page.getByRole("dialog", { name: "Help improve matchday" });
  await expect(consent).toBeVisible({ timeout: 5_000 });
  await consent.getByRole("button", { name: "Not now", exact: true }).click();
  await expect(consent).toBeHidden();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("footyrush.analyticsConsent"))).toBe("denied");

  await page.getByRole("button", { name: "Data choices", exact: true }).click();
  await expect(consent).toBeVisible();
  await consent.getByRole("button", { name: "Allow gameplay analytics", exact: true }).click();
  await expect(consent).toBeHidden();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("footyrush.analyticsConsent"))).toBe("granted");
});
