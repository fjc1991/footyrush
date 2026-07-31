"use client";

import { Check, LockKeyhole, Palette, Save, Shirt, Sparkles, Trophy } from "lucide-react";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  achievementEntitlementGrants,
  achievementProgress
} from "@/lib/game/achievements";
import {
  CLUB_KIT_STYLES,
  CLUB_PALETTES,
  clubIdentityToTeamVisual,
  resolveClubEntitlements,
  validateClubIdentity,
  type ClubIdentity,
  type ClubKitStyleId,
  type ClubPaletteId
} from "@/lib/game/club-identity";
import { getTeamMonogram, getTeamPatternBackground } from "@/lib/game/team-visuals";
import type { LeaderboardRecord } from "@/lib/game/types";

interface AchievementsScreenProps {
  records: LeaderboardRecord[];
  identity: ClubIdentity;
  activeRun: boolean;
  onSave: (identity: ClubIdentity) => void;
}

function visualStyle(identity: ClubIdentity): CSSProperties {
  const visual = clubIdentityToTeamVisual(identity);
  return {
    "--team-primary": visual.primary,
    "--team-secondary": visual.secondary,
    "--team-ink": visual.text,
    "--team-pattern": getTeamPatternBackground(visual)
  } as CSSProperties;
}

export default function AchievementsScreen({
  records,
  identity,
  activeRun,
  onSave
}: AchievementsScreenProps) {
  const progress = useMemo(() => achievementProgress(records), [records]);
  const grants = useMemo(() => achievementEntitlementGrants(records), [records]);
  const entitlements = useMemo(() => resolveClubEntitlements(grants), [grants]);
  const [draft, setDraft] = useState(identity);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setDraft(identity);
  }, [identity]);

  const validation = validateClubIdentity(draft, grants);
  const nameUnlocked = entitlements.has("club_name_custom");
  const palettesUnlocked = entitlements.has("kit_palette_basic");
  const stylesUnlocked = entitlements.has("kit_style_basic");
  const completedCount = progress.filter((achievement) => achievement.completed).length;
  const dirty = JSON.stringify(draft) !== JSON.stringify(identity);
  const draftVisualStyle = visualStyle(draft);

  function saveIdentity() {
    if (!validation.valid || !validation.value) return;
    onSave(validation.value);
    setDraft(validation.value);
    setSaved(true);
  }

  return (
    <section className="achievements-screen" aria-labelledby="achievements-title">
      <div className="panel achievements-panel">
        <header className="achievements-hero">
          <div>
            <p className="eyebrow">Club legacy</p>
            <h2 id="achievements-title">Achievements</h2>
            <p>
              Turn completed campaigns into a club that feels like yours. Every reward is earned through play
              and stays visible before you unlock it.
            </p>
          </div>
          <div className="achievement-total" aria-label={`${completedCount} of ${progress.length} achievements complete`}>
            <Trophy size={24} aria-hidden="true" />
            <strong>{completedCount}/{progress.length}</strong>
            <span>complete</span>
          </div>
        </header>

        <div className="achievement-grid" aria-label="Achievement progress">
          {progress.map((achievement) => (
            <article
              className={`achievement-card${achievement.completed ? " is-complete" : ""}`}
              key={achievement.id}
            >
              <span className="achievement-card-icon" aria-hidden="true">
                {achievement.completed ? <Check size={20} /> : <LockKeyhole size={18} />}
              </span>
              <div className="achievement-card-copy">
                <span>{achievement.completed ? "Unlocked" : `${achievement.remaining} to go`}</span>
                <h3>{achievement.title}</h3>
                <p>{achievement.description}</p>
              </div>
              <div className="achievement-progress-copy">
                <span>{Math.min(achievement.current, achievement.target)} / {achievement.target}</span>
                <strong>{achievement.rewardLabel}</strong>
              </div>
              <span
                className="achievement-progress-track"
                role="progressbar"
                aria-label={`${achievement.title} progress`}
                aria-valuenow={achievement.progressPercent}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <span style={{ width: `${achievement.progressPercent}%` }} />
              </span>
            </article>
          ))}
        </div>

        <div className="club-customizer">
          <div className="club-preview" style={draftVisualStyle}>
            <div className="club-preview-heading">
              <div>
                <p className="eyebrow">Next-campaign identity</p>
                <h3>{draft.clubName}</h3>
              </div>
              <Sparkles size={20} aria-hidden="true" />
            </div>
            <div className="club-preview-stage">
              <span
                className="team-badge club-preview-badge"
                style={draftVisualStyle}
                role="img"
                aria-label={`${draft.clubName} badge preview`}
              >
                {getTeamMonogram("", draft.clubName)}
              </span>
              <span className="club-preview-kit team-kit" style={draftVisualStyle} aria-hidden="true">
                <Shirt size={98} strokeWidth={1.25} className="kit-icon" />
                <span className="kit-num">10</span>
              </span>
            </div>
            <p>
              {activeRun
                ? "Your current campaign keeps its identity. Saved changes start with your next draft."
                : "This badge and kit will follow your squad through the next campaign."}
            </p>
          </div>

          <div className="club-controls">
            <div className="club-control-heading">
              <div>
                <p className="eyebrow">Personalization rewards</p>
                <h3>Build your club</h3>
              </div>
              <Palette size={22} aria-hidden="true" />
            </div>

            <label className={`club-name-field${nameUnlocked ? "" : " is-locked"}`}>
              <span>Club name</span>
              <input
                value={draft.clubName}
                maxLength={24}
                disabled={!nameUnlocked}
                aria-describedby="club-name-help"
                onChange={(event) => {
                  setSaved(false);
                  setDraft((current) => ({ ...current, clubName: event.target.value }));
                }}
              />
              <small id="club-name-help">
                {nameUnlocked ? "3–24 characters. This is separate from your manager ID." : "Complete one campaign to rename FootyRush FC."}
              </small>
            </label>

            <fieldset className="club-choice-group">
              <legend>Club colours</legend>
              <div className="club-palette-grid">
                {(Object.entries(CLUB_PALETTES) as Array<[ClubPaletteId, (typeof CLUB_PALETTES)[ClubPaletteId]]>).map(([id, palette]) => {
                  const locked = id !== "footyrush" && !palettesUnlocked;
                  return (
                    <button
                      key={id}
                      className={`club-palette-choice${draft.paletteId === id ? " is-selected" : ""}${locked ? " is-locked" : ""}`}
                      type="button"
                      disabled={locked}
                      aria-pressed={draft.paletteId === id}
                      onClick={() => {
                        setSaved(false);
                        setDraft((current) => ({ ...current, paletteId: id }));
                      }}
                    >
                      <span
                        className="club-palette-swatch"
                        style={{ background: `linear-gradient(135deg, ${palette.primary} 0 50%, ${palette.secondary} 50% 100%)` }}
                        aria-hidden="true"
                      />
                      <span>{palette.label}</span>
                      {locked ? <LockKeyhole size={14} aria-label="Locked" /> : null}
                    </button>
                  );
                })}
              </div>
              {!palettesUnlocked && <small>Score 10 goals across completed campaigns to unlock every palette.</small>}
            </fieldset>

            <fieldset className="club-choice-group">
              <legend>Kit style</legend>
              <div className="club-style-grid">
                {(Object.entries(CLUB_KIT_STYLES) as Array<[ClubKitStyleId, (typeof CLUB_KIT_STYLES)[ClubKitStyleId]]>).map(([id, style]) => {
                  const locked = id !== "solid" && !stylesUnlocked;
                  return (
                    <button
                      key={id}
                      className={`club-style-choice${draft.kitStyle === id ? " is-selected" : ""}${locked ? " is-locked" : ""}`}
                      type="button"
                      disabled={locked}
                      aria-pressed={draft.kitStyle === id}
                      onClick={() => {
                        setSaved(false);
                        setDraft((current) => ({ ...current, kitStyle: id }));
                      }}
                    >
                      <Shirt size={18} aria-hidden="true" />
                      <span>{style.label}</span>
                      {locked ? <LockKeyhole size={14} aria-label="Locked" /> : null}
                    </button>
                  );
                })}
              </div>
              {!stylesUnlocked && <small>Complete three campaigns to unlock kit patterns.</small>}
            </fieldset>

            {validation.errors.length > 0 && dirty && (
              <p className="club-customizer-error" role="alert">{validation.errors[0]}</p>
            )}
            <div className="club-save-row">
              <button
                className="primary-button"
                type="button"
                disabled={!dirty || !validation.valid}
                onClick={saveIdentity}
              >
                <Save size={17} aria-hidden="true" />
                Save club identity
              </button>
              {saved && <span className="club-save-confirmation"><Check size={16} /> Saved for your next campaign</span>}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
