"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { renderCommentary } from "@/lib/game/commentary";
import {
  buildScoreTimeline,
  type MatchFeedback,
  type MatchScoreBeat
} from "@/lib/game/match-presentation";
import { getTeamMonogram, getTeamVisualStyle } from "@/lib/game/team-visuals";
import type { FixtureResult, ManagerSquad, MatchEvent } from "@/lib/game/types";

interface MatchBroadcastProps {
  result: FixtureResult;
  home: ManagerSquad;
  away: ManagerSquad;
  feedback: MatchFeedback;
  locale: string;
  managerCall?: string;
  hold: boolean;
  reducedMotion?: boolean;
  active?: boolean;
  onComplete: () => void;
}

type BroadcastStage = "revealing" | "full-time";

const FULL_TIME_HOLD_MS = 1_400;

const EVENT_LABELS: Record<MatchEvent["code"], string> = {
  kickoff: "Kick-off",
  chance: "Chance",
  goal: "Goal",
  save: "Save",
  injury: "Injury",
  substitution: "Substitution",
  red_card: "Red card",
  near_miss: "Near miss",
  half_time: "Half-time",
  full_time: "Full-time"
};

function beatDelay(beat: MatchScoreBeat): number {
  switch (beat.event.code) {
    case "goal":
    case "injury":
    case "red_card":
      return 900;
    case "half_time":
    case "full_time":
      return 760;
    default:
      return 620;
  }
}

function managerTeamCode(manager: ManagerSquad): string {
  return manager.picks.find((pick) => pick.target !== "SUB")?.teamCode
    ?? manager.picks[0]?.teamCode
    ?? manager.id;
}

function TeamIdentity({ manager, side }: { manager: ManagerSquad; side: "home" | "away" }) {
  const teamCode = managerTeamCode(manager);
  return (
    <div
      className={`match-broadcast-team match-broadcast-team--${side}${manager.kind === "human" ? " is-human" : ""}`}
    >
      <span
        className="match-broadcast-badge team-badge"
        style={getTeamVisualStyle(teamCode) as CSSProperties}
        role="img"
        aria-label={`${manager.displayName} colours`}
      >
        {getTeamMonogram(teamCode, manager.displayName)}
      </span>
      <span className="match-broadcast-team-copy">
        <small>{manager.kind === "human" ? "You" : side === "home" ? "Home" : "Away"}</small>
        <strong>{manager.displayName}</strong>
      </span>
    </div>
  );
}

function tablePositionCopy(feedback: MatchFeedback): string {
  const { positionBefore, positionAfter } = feedback;
  if (positionBefore === null && positionAfter === null) {
    return "Table position unavailable";
  }
  if (positionBefore === null) {
    return `Table position: #${positionAfter}`;
  }
  if (positionAfter === null) {
    return `Previous table position: #${positionBefore}`;
  }
  if (positionBefore === positionAfter) {
    return `Table position held: #${positionAfter}`;
  }

  const places = Math.abs(positionBefore - positionAfter);
  const direction = positionAfter < positionBefore ? "up" : "down";
  return `Table: #${positionBefore} to #${positionAfter} · ${direction} ${places}`;
}

function unbeatenCopy(feedback: MatchFeedback): string {
  if (feedback.firstLoss) {
    return feedback.unbeatenStreakBefore > 0
      ? `First loss · ${feedback.unbeatenStreakBefore}-match unbeaten run ended`
      : "First loss · unbeaten streak ended";
  }
  if (feedback.unbeatenStreakAfter > 0) {
    return `${feedback.unbeatenStreakAfter}-match unbeaten streak`;
  }
  if (feedback.unbeatenStreakBefore > 0) {
    return `${feedback.unbeatenStreakBefore}-match unbeaten run ended`;
  }
  return "Unbeaten streak: 0 matches";
}

function outcomeCopy(outcome: MatchFeedback["outcome"]): string {
  if (outcome === "W") return "Win";
  if (outcome === "D") return "Draw";
  return "Loss";
}

export default function MatchBroadcast({
  result,
  home,
  away,
  feedback,
  locale,
  managerCall,
  hold,
  reducedMotion = false,
  active = true,
  onComplete
}: MatchBroadcastProps) {
  const timeline = useMemo(() => buildScoreTimeline(result), [result]);
  const [beatIndex, setBeatIndex] = useState(0);
  const [stage, setStage] = useState<BroadcastStage>(timeline.length > 0 ? "revealing" : "full-time");
  const completionCalledRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  const stageRef = useRef<HTMLElement | null>(null);
  const continueRef = useRef<HTMLButtonElement | null>(null);
  const effectiveHold = hold || reducedMotion;

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    completionCalledRef.current = false;
    setBeatIndex(0);
    setStage(timeline.length > 0 ? "revealing" : "full-time");
  }, [result.fixtureId, timeline.length]);

  const currentBeat = timeline[beatIndex] ?? null;

  useEffect(() => {
    if (!active || stage !== "revealing" || !currentBeat) return;

    if (reducedMotion) {
      setBeatIndex(Math.max(0, timeline.length - 1));
      setStage("full-time");
      return;
    }

    const timer = window.setTimeout(() => {
      if (beatIndex >= timeline.length - 1) {
        setStage("full-time");
        return;
      }
      setBeatIndex((index) => index + 1);
    }, beatDelay(currentBeat));

    return () => window.clearTimeout(timer);
  }, [active, beatIndex, currentBeat, reducedMotion, result.fixtureId, stage, timeline.length]);

  useEffect(() => {
    if (!active || stage !== "full-time" || effectiveHold || completionCalledRef.current) return;

    const timer = window.setTimeout(() => {
      if (completionCalledRef.current) return;
      completionCalledRef.current = true;
      onCompleteRef.current();
    }, FULL_TIME_HOLD_MS);

    return () => window.clearTimeout(timer);
  }, [active, effectiveHold, result.fixtureId, stage]);

  useEffect(() => {
    if (!active) return;
    const frame = window.requestAnimationFrame(() => stageRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [active, result.fixtureId]);

  useEffect(() => {
    if (!active || stage !== "full-time" || !effectiveHold) return;
    const frame = window.requestAnimationFrame(() => continueRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [active, effectiveHold, stage]);

  const isFullTime = stage === "full-time";
  const homeGoals = isFullTime ? result.homeGoals : currentBeat?.homeGoals ?? 0;
  const awayGoals = isFullTime ? result.awayGoals : currentBeat?.awayGoals ?? 0;
  const minute = isFullTime ? 90 : currentBeat?.event.second ?? 0;
  const progress = isFullTime
    ? 100
    : timeline.length > 0
      ? Math.round(((beatIndex + 1) / timeline.length) * 100)
      : 100;
  const event = currentBeat?.event ?? null;
  const eventSide = event?.teamId === home.id
    ? " is-home-event"
    : event?.teamId === away.id
      ? " is-away-event"
      : "";
  const decisiveEvent = isFullTime || event?.code === "goal" || event?.code === "injury" || event?.code === "red_card";
  const human = home.kind === "human" ? home : away.kind === "human" ? away : null;
  const humanInjuryIds = !human
    ? []
    : human.id === result.homeId
      ? result.homeInjuries
      : result.awayInjuries;
  const humanRedCardIds = !human
    ? []
    : human.id === result.homeId
      ? result.homeRedCards
      : result.awayRedCards;
  const playerNames = (ids: number[]) => ids.map(
    (playerId) => human?.picks.find((pick) => pick.player.i === playerId)?.player.n ?? "A starter"
  );
  const incidentSummary = [
    ...playerNames(humanInjuryIds).map((name) => `${name} injured — replacement required`),
    ...playerNames(humanRedCardIds).map((name) => `${name} sent off — three-match suspension`)
  ].join(" · ");
  const liveAnnouncement = decisiveEvent
    ? isFullTime
      ? `Full time. ${home.displayName} ${result.homeGoals}, ${away.displayName} ${result.awayGoals}. ${outcomeCopy(feedback.outcome)}. ${feedback.pointsEarned} point${feedback.pointsEarned === 1 ? "" : "s"}. ${tablePositionCopy(feedback)}. ${unbeatenCopy(feedback)}.${incidentSummary ? ` Turning point: ${incidentSummary}.` : ""}${managerCall ? ` Manager call: ${managerCall}` : ""}`
      : `${EVENT_LABELS[event!.code]}, ${event!.second} minutes. ${renderCommentary(event!, locale)} Score ${homeGoals} to ${awayGoals}.`
    : "";

  function finish() {
    if (completionCalledRef.current) return;
    completionCalledRef.current = true;
    onCompleteRef.current();
  }

  function skipToFullTime() {
    setBeatIndex(Math.max(0, timeline.length - 1));
    setStage("full-time");
  }

  return (
    <section
      ref={stageRef}
      className={`match-broadcast match-broadcast--${stage}`}
      data-stage={stage}
      data-event-code={event?.code}
      tabIndex={-1}
      aria-label={`${home.displayName} versus ${away.displayName} match broadcast`}
    >
      <div className="match-broadcast-stage">
        <div className="match-broadcast-teams">
          <TeamIdentity manager={home} side="home" />
          <div className="match-broadcast-score" aria-label={`${home.displayName} ${homeGoals}, ${away.displayName} ${awayGoals}`}>
            <span>{homeGoals}</span>
            <small aria-hidden="true">–</small>
            <span>{awayGoals}</span>
          </div>
          <TeamIdentity manager={away} side="away" />
        </div>

        <div className="match-broadcast-clock">
          <strong>{isFullTime ? "FT" : `${Math.min(90, Math.max(0, minute))}′`}</strong>
          <progress
            className="match-broadcast-progress"
            aria-label="Match reveal progress"
            value={progress}
            max={100}
          />
        </div>

        <div
          className={`match-broadcast-event${eventSide}${event ? ` match-broadcast-event--${event.code}` : ""}`}
        >
          {event ? (
            <>
              <span className="match-broadcast-event-meta">
                <strong>{EVENT_LABELS[event.code]}</strong>
                <small>{event.second}′</small>
              </span>
              <p>{renderCommentary(event, locale)}</p>
              <span className="visually-hidden">Score {homeGoals} to {awayGoals}.</span>
              {isFullTime && (
                <span className="visually-hidden">
                  {outcomeCopy(feedback.outcome)}. {feedback.pointsEarned} point{feedback.pointsEarned === 1 ? "" : "s"}.
                  {" "}{tablePositionCopy(feedback)}. {unbeatenCopy(feedback)}.
                  {managerCall ? ` Manager call: ${managerCall}` : ""}
                </span>
              )}
            </>
          ) : (
            <p>
              Full-time. {home.displayName} {result.homeGoals}, {away.displayName} {result.awayGoals}.
              {" "}{outcomeCopy(feedback.outcome)}. {feedback.pointsEarned} point{feedback.pointsEarned === 1 ? "" : "s"}.
              {" "}{tablePositionCopy(feedback)}. {unbeatenCopy(feedback)}.
              {managerCall ? ` Manager call: ${managerCall}` : ""}
            </p>
          )}
        </div>
        <p className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
          {liveAnnouncement}
        </p>

        {isFullTime && (
          <div className="match-broadcast-feedback" data-outcome={feedback.outcome} aria-label="Match result feedback">
            <div className="match-broadcast-outcome">
              <span>{feedback.outcome}</span>
              <strong>{outcomeCopy(feedback.outcome)}</strong>
              <small>{feedback.pointsEarned} point{feedback.pointsEarned === 1 ? "" : "s"}</small>
            </div>
            <div className="match-broadcast-feedback-details">
              <p>{tablePositionCopy(feedback)}</p>
              <p>{unbeatenCopy(feedback)}</p>
              {incidentSummary && <p className="match-broadcast-incident">Turning point · {incidentSummary}</p>}
              {managerCall && <p className="match-broadcast-manager-call">Manager call · {managerCall}</p>}
            </div>
          </div>
        )}
      </div>

      <footer className="match-broadcast-footer">
        {!isFullTime ? (
          <button className="secondary-button" type="button" onClick={skipToFullTime}>
            Skip to full time
          </button>
        ) : effectiveHold ? (
          <button ref={continueRef} className="primary-button" type="button" onClick={finish}>
            Continue
          </button>
        ) : (
          <span>Continuing…</span>
        )}
      </footer>
    </section>
  );
}
