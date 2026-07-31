import { describe, expect, it } from "vitest";
import {
  buildMatchFeedback,
  buildScoreTimeline,
  selectMatchHighlights
} from "@/lib/game/match-presentation";
import type { FixtureResult, MatchEvent, MatchEventCode, Standing } from "@/lib/game/types";

function event(
  id: string,
  second: number,
  code: MatchEventCode,
  teamId?: string,
  params: MatchEvent["params"] = {}
): MatchEvent {
  return { id, second, code, teamId, params };
}

function result(overrides: Partial<FixtureResult> = {}): FixtureResult {
  return {
    fixtureId: "fixture",
    round: 1,
    homeId: "human",
    awayId: "opponent",
    homeGoals: 1,
    awayGoals: 0,
    events: [],
    homeInjuries: [],
    awayInjuries: [],
    homeRedCards: [],
    awayRedCards: [],
    playedAt: "2026-01-01T00:00:00.000Z",
    ...overrides
  };
}

function standing(managerId: string): Standing {
  return {
    managerId,
    displayName: managerId,
    kind: managerId === "human" ? "human" : "reserve",
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    points: 0
  };
}

describe("match presentation", () => {
  describe("selectMatchHighlights", () => {
    it("keeps every decisive beat and only the earliest open-play event in each half", () => {
      const events = [
        event("full", 90, "full_time"),
        event("second-extra", 61, "chance", "home"),
        event("red", 70, "red_card", "away"),
        event("first-extra", 24, "save", "away"),
        event("sub", 36, "substitution", "home"),
        event("half", 45, "half_time"),
        event("second-open", 52, "near_miss", "away"),
        event("late-goal", 78, "goal", "home"),
        event("injury", 35, "injury", "home"),
        event("early-goal", 16, "goal", "away"),
        event("first-open", 8, "chance", "home"),
        event("kickoff", 1, "kickoff")
      ];
      const originalOrder = events.map(({ id }) => id);

      const highlights = selectMatchHighlights(events);

      expect(highlights.map(({ id }) => id)).toEqual([
        "kickoff",
        "first-open",
        "early-goal",
        "injury",
        "sub",
        "half",
        "second-open",
        "red",
        "late-goal",
        "full"
      ]);
      expect(events.map(({ id }) => id)).toEqual(originalOrder);
    });

    it("uses football-semantic ordering for incidents, resumed play, and the half-time whistle", () => {
      const highlights = selectMatchHighlights([
        event("second-half-open", 46, "save"),
        event("half-time", 45, "half_time"),
        event("same-minute-open", 45, "near_miss"),
        event("same-minute-goal", 45, "goal", "home"),
        event("same-minute-red", 45, "red_card"),
        event("same-minute-sub", 45, "substitution"),
        event("same-minute-injury", 45, "injury")
      ]);

      expect(highlights.map(({ id }) => id)).toEqual([
        "same-minute-injury",
        "same-minute-red",
        "same-minute-sub",
        "same-minute-goal",
        "same-minute-open",
        "half-time",
        "second-half-open"
      ]);
      expect(highlights.filter(({ code, second }) => second <= 45 && ["chance", "save", "near_miss"].includes(code))).toHaveLength(1);
      expect(highlights.filter(({ code, second }) => second > 45 && ["chance", "save", "near_miss"].includes(code))).toHaveLength(1);
    });

    it("returns all structural events when there are no open-play beats", () => {
      const events = [
        event("kickoff", 1, "kickoff"),
        event("goal", 40, "goal", "human"),
        event("half", 45, "half_time"),
        event("full", 90, "full_time")
      ];

      expect(selectMatchHighlights(events)).toEqual(events);
    });
  });

  describe("buildScoreTimeline", () => {
    it("reveals score changes only when their goal events occur", () => {
      const fixture = result({
        homeGoals: 2,
        awayGoals: 1,
        events: [
          event("full", 90, "full_time", undefined, { homeGoals: 2, awayGoals: 1 }),
          event("home-second", 83, "goal", "human"),
          event("away-goal", 54, "goal", "opponent"),
          event("half", 45, "half_time", undefined, { homeGoals: 1, awayGoals: 0 }),
          event("home-first", 17, "goal", "human"),
          event("opening-chance", 6, "chance", "opponent"),
          event("kickoff", 1, "kickoff")
        ]
      });

      const timeline = buildScoreTimeline(fixture);
      const scoresByEvent = Object.fromEntries(
        timeline.map((beat) => [beat.event.id, [beat.homeGoals, beat.awayGoals]])
      );

      expect(timeline.map(({ event: matchEvent }) => matchEvent.id)).toEqual([
        "kickoff",
        "opening-chance",
        "home-first",
        "half",
        "away-goal",
        "home-second",
        "full"
      ]);
      expect(scoresByEvent).toEqual({
        kickoff: [0, 0],
        "opening-chance": [0, 0],
        "home-first": [1, 0],
        half: [1, 0],
        "away-goal": [1, 1],
        "home-second": [2, 1],
        full: [2, 1]
      });
    });

    it("uses the fixture sides rather than assuming the human is at home", () => {
      const fixture = result({
        homeId: "opponent",
        awayId: "human",
        homeGoals: 1,
        awayGoals: 1,
        events: [
          event("kickoff", 1, "kickoff"),
          event("away-goal", 20, "goal", "human"),
          event("home-goal", 70, "goal", "opponent"),
          event("full", 90, "full_time")
        ]
      });

      expect(buildScoreTimeline(fixture).map(({ homeGoals, awayGoals }) => [homeGoals, awayGoals])).toEqual([
        [0, 0],
        [0, 1],
        [1, 1],
        [1, 1]
      ]);
    });
  });

  describe("buildMatchFeedback", () => {
    it("reports a home win, table climb, and continued unbeaten streak", () => {
      const previousHumanResults = [
        result({ fixtureId: "previous-win", round: 1, homeGoals: 2, awayGoals: 0 }),
        result({ fixtureId: "previous-draw", round: 2, homeId: "opponent-2", awayId: "human", homeGoals: 1, awayGoals: 1 })
      ];
      const currentHumanResult = result({
        fixtureId: "current-win",
        round: 3,
        awayId: "opponent-3",
        homeGoals: 3,
        awayGoals: 1
      });
      const aiResult = result({
        fixtureId: "ai-result",
        round: 3,
        homeId: "ai-1",
        awayId: "ai-2",
        homeGoals: 5,
        awayGoals: 0
      });

      expect(
        buildMatchFeedback({
          previousHumanResults,
          completedRoundResults: [aiResult, currentHumanResult],
          previousStandings: [standing("leader"), standing("second"), standing("human")],
          completedStandings: [standing("human"), standing("leader"), standing("second")],
          currentHumanResult
        })
      ).toEqual({
        outcome: "W",
        pointsEarned: 3,
        positionBefore: 3,
        positionAfter: 1,
        unbeatenStreakBefore: 2,
        unbeatenStreakAfter: 3,
        firstLoss: false
      });
    });

    it("recognises an away draw and awards one point", () => {
      const previousWin = result({ fixtureId: "win", round: 1, homeGoals: 1, awayGoals: 0 });
      const currentDraw = result({
        fixtureId: "away-draw",
        round: 2,
        homeId: "opponent",
        awayId: "human",
        homeGoals: 2,
        awayGoals: 2
      });

      expect(
        buildMatchFeedback({
          previousHumanResults: [previousWin],
          completedRoundResults: [currentDraw],
          previousStandings: [standing("leader"), standing("human")],
          completedStandings: [standing("leader"), standing("human")],
          currentHumanResult: currentDraw
        })
      ).toEqual({
        outcome: "D",
        pointsEarned: 1,
        positionBefore: 2,
        positionAfter: 2,
        unbeatenStreakBefore: 1,
        unbeatenStreakAfter: 2,
        firstLoss: false
      });
    });

    it("marks the first loss and resets the active unbeaten streak", () => {
      const previousHumanResults = [
        result({ fixtureId: "win", round: 1, homeGoals: 2, awayGoals: 0 }),
        result({ fixtureId: "draw", round: 2, homeGoals: 0, awayGoals: 0 })
      ];
      const firstLoss = result({
        fixtureId: "first-loss",
        round: 3,
        homeId: "opponent",
        awayId: "human",
        homeGoals: 1,
        awayGoals: 0
      });

      expect(
        buildMatchFeedback({
          previousHumanResults,
          completedRoundResults: [firstLoss],
          previousStandings: [standing("human")],
          completedStandings: [standing("opponent"), standing("human")],
          currentHumanResult: firstLoss
        })
      ).toEqual({
        outcome: "L",
        pointsEarned: 0,
        positionBefore: 1,
        positionAfter: 2,
        unbeatenStreakBefore: 2,
        unbeatenStreakAfter: 0,
        firstLoss: true
      });
    });

    it("distinguishes a later loss from the first and uses the current trailing streak", () => {
      const previousHumanResults = [
        result({ fixtureId: "old-loss", round: 1, homeGoals: 0, awayGoals: 2 }),
        result({ fixtureId: "recovery-win", round: 2, homeGoals: 2, awayGoals: 0 }),
        result({ fixtureId: "recovery-draw", round: 3, homeGoals: 1, awayGoals: 1 })
      ];
      const laterLoss = result({ fixtureId: "later-loss", round: 4, homeGoals: 0, awayGoals: 1 });

      const feedback = buildMatchFeedback({
        previousHumanResults,
        completedRoundResults: [laterLoss],
        previousStandings: [standing("human")],
        completedStandings: [standing("human")],
        currentHumanResult: laterLoss
      });

      expect(feedback.unbeatenStreakBefore).toBe(2);
      expect(feedback.unbeatenStreakAfter).toBe(0);
      expect(feedback.firstLoss).toBe(false);
    });

    it("ignores non-human results and returns null when a standing is unavailable", () => {
      const unrelated = result({
        fixtureId: "unrelated",
        homeId: "ai-1",
        awayId: "ai-2",
        homeGoals: 0,
        awayGoals: 4
      });
      const currentWin = result({ fixtureId: "current", homeGoals: 1, awayGoals: 0 });

      const feedback = buildMatchFeedback({
        previousHumanResults: [unrelated],
        completedRoundResults: [unrelated, currentWin],
        previousStandings: [standing("ai-1")],
        completedStandings: [standing("human")],
        currentHumanResult: currentWin
      });

      expect(feedback).toMatchObject({
        positionBefore: null,
        positionAfter: 1,
        unbeatenStreakBefore: 0,
        unbeatenStreakAfter: 1
      });
    });

    it("supports a custom human id and rejects a non-human current result", () => {
      const managerResult = result({
        fixtureId: "custom-human",
        homeId: "opponent",
        awayId: "manager-7",
        homeGoals: 0,
        awayGoals: 1
      });
      const feedback = buildMatchFeedback({
        previousHumanResults: [],
        completedRoundResults: [managerResult],
        previousStandings: [standing("manager-7")],
        completedStandings: [standing("manager-7")],
        currentHumanResult: managerResult,
        humanId: "manager-7"
      });

      expect(feedback.outcome).toBe("W");
      expect(feedback.pointsEarned).toBe(3);
      expect(() =>
        buildMatchFeedback({
          previousHumanResults: [],
          completedRoundResults: [],
          previousStandings: [],
          completedStandings: [],
          currentHumanResult: result({ homeId: "ai-1", awayId: "ai-2" })
        })
      ).toThrow("Current result does not include human manager human.");
    });
  });
});
