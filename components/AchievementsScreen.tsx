"use client";

import { Check, Coffee, Heart, LockKeyhole, Palette, Save, Shirt, Sparkles, Shield } from "lucide-react";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import FootyRushMark from "@/components/FootyRushMark";
import {
  unlockEntitlementGrants,
  unlockProgress,
  type UnlockProgress
} from "@/lib/game/achievements";
import {
  CLUB_BADGE_STYLES,
  CLUB_KIT_STYLES,
  CLUB_PALETTES,
  clubBadgeClipPath,
  clubIdentityToTeamVisual,
  resolveClubEntitlements,
  validateClubIdentity,
  type ClubBadgeStyleId,
  type ClubEntitlement,
  type ClubEntitlementGrant,
  type ClubIdentity,
  type ClubKitStyleId,
  type ClubPaletteId
} from "@/lib/game/club-identity";
import { getTeamMonogram, getTeamPatternBackground } from "@/lib/game/team-visuals";
import type { LeaderboardRecord } from "@/lib/game/types";

interface UnlocksScreenProps {
  records: LeaderboardRecord[];
  identity: ClubIdentity;
  activeRun: boolean;
  additionalGrants?: ClubEntitlementGrant[];
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

function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

function unitFor(progress: UnlockProgress, count: number): string {
  return count === 1 ? progress.unitSingular : progress.unitPlural;
}

export default function UnlocksScreen({
  records,
  identity,
  activeRun,
  additionalGrants = [],
  onSave
}: UnlocksScreenProps) {
  const progress = useMemo(() => unlockProgress(records), [records]);
  const earnedGrants = useMemo(() => unlockEntitlementGrants(records), [records]);
  const grants = useMemo(
    () => [...earnedGrants, ...additionalGrants],
    [additionalGrants, earnedGrants]
  );
  const entitlements = useMemo(() => resolveClubEntitlements(grants), [grants]);
  const progressByReward = useMemo(
    () => new Map(progress.map((unlock) => [unlock.reward, unlock])),
    [progress]
  );
  const [draft, setDraft] = useState(identity);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setDraft(identity);
  }, [identity]);

  const validation = validateClubIdentity(draft, grants);
  const nameUnlocked = entitlements.has("club_name_custom");
  const palettePathUnlocked = entitlements.has("kit_palette_basic");
  const stylesUnlocked = entitlements.has("kit_style_basic");
  const badgesUnlocked = entitlements.has("badge_style_basic");
  const supporterUnlocked = entitlements.has("supporter_edition");
  const supporterActive = draft.editionId === "supporter";
  const palettesUnlocked = palettePathUnlocked || (supporterUnlocked && supporterActive);
  const completedCount = progress.filter((unlock) => unlock.completed).length;
  const dirty = JSON.stringify(draft) !== JSON.stringify(identity);
  const draftVisualStyle = visualStyle(draft);
  const badgeStyle = {
    ...draftVisualStyle,
    clipPath: clubBadgeClipPath(draft)
  } as CSSProperties;

  function lockedHelp(entitlement: Exclude<ClubEntitlement, "supporter_edition">): string {
    const unlock = progressByReward.get(entitlement);
    if (!unlock) return "This option needs a separate account entitlement.";
    return `${formatCount(Math.min(unlock.current, unlock.target))} / ${formatCount(unlock.target)} ${unlock.unitPlural} — ${formatCount(unlock.remaining)} remaining.`;
  }

  function saveIdentity() {
    if (!validation.valid || !validation.value) return;
    onSave(validation.value);
    setDraft(validation.value);
    setSaved(true);
  }

  return (
    <section className="achievements-screen unlocks-screen" aria-labelledby="unlocks-title">
      <div className="panel achievements-panel unlocks-panel">
        <header className="achievements-hero unlocks-hero">
          <div>
            <p className="eyebrow">Build your club legacy</p>
            <h2 id="unlocks-title">UNLOCKS</h2>
            <p>
              Four long-term paths. Each customization has its own target, and only completed
              campaigns count toward your progress.
            </p>
          </div>
          <div className="achievement-total unlock-total" aria-label={`${completedCount} of ${progress.length} personalization unlocks earned`}>
            <LockKeyhole size={24} aria-hidden="true" />
            <strong>{completedCount}/{progress.length}</strong>
            <span>unlocked</span>
          </div>
        </header>

        <div className="achievement-grid unlock-grid" aria-label="Personalization unlock progress">
          {progress.map((unlock) => {
            const current = Math.min(unlock.current, unlock.target);
            const valueText = unlock.completed
              ? `${formatCount(unlock.target)} of ${formatCount(unlock.target)} ${unlock.unitPlural}; ${unlock.rewardLabel} unlocked`
              : `${formatCount(current)} of ${formatCount(unlock.target)} ${unlock.unitPlural}; ${formatCount(unlock.remaining)} remaining to unlock ${unlock.rewardLabel}`;
            return (
              <article
                className={`achievement-card unlock-card${unlock.completed ? " is-complete" : ""}`}
                key={unlock.id}
              >
                <div className="unlock-card-heading">
                  <span className="achievement-card-icon" aria-hidden="true">
                    {unlock.completed ? <Check size={20} /> : <LockKeyhole size={18} />}
                  </span>
                  <div className="achievement-card-copy">
                    <span>{unlock.pathLabel}</span>
                    <h3>{unlock.rewardLabel}</h3>
                  </div>
                  <span className={`unlock-state${unlock.completed ? " is-unlocked" : ""}`}>
                    {unlock.completed ? "Unlocked" : "Locked"}
                  </span>
                </div>
                <strong className="unlock-goal">{unlock.title}</strong>
                <p>{unlock.description}</p>
                <div className="achievement-progress-copy unlock-progress-copy">
                  <strong>
                    {formatCount(current)} <span>/ {formatCount(unlock.target)}</span>
                  </strong>
                  <span>{unlock.completed ? "Path complete" : `${formatCount(unlock.remaining)} ${unitFor(unlock, unlock.remaining)} left`}</span>
                </div>
                <span
                  className="achievement-progress-track unlock-progress-track"
                  role="progressbar"
                  aria-label={`${unlock.rewardLabel} unlock progress`}
                  aria-valuenow={current}
                  aria-valuemin={0}
                  aria-valuemax={unlock.target}
                  aria-valuetext={valueText}
                >
                  <span style={{ width: `${unlock.progressPercent}%` }} />
                </span>
                <small className="unlock-metric-label">Goal: {formatCount(unlock.target)} {unlock.unitPlural}</small>
              </article>
            );
          })}
        </div>

        <div className="club-customizer">
          <div className={`club-preview${supporterActive ? " is-supporter" : ""}`} style={draftVisualStyle}>
            <div className="club-preview-heading">
              <div>
                <p className="eyebrow">Next-campaign identity</p>
                <h3>{draft.clubName}</h3>
              </div>
              <Sparkles size={20} aria-hidden="true" />
            </div>
            <div className="club-preview-stage">
              <span
                className={`team-badge club-preview-badge${supporterActive ? " is-supporter" : ""}`}
                style={badgeStyle}
                role="img"
                aria-label={`${draft.clubName}${supporterActive ? " Supporter Edition" : ""} badge preview`}
              >
                {supporterActive ? (
                  <span className="supporter-brand-roundel"><FootyRushMark tone="light" /></span>
                ) : getTeamMonogram("", draft.clubName)}
              </span>
              <span className={`club-preview-kit team-kit${supporterActive ? " is-supporter" : ""}`} style={draftVisualStyle} aria-hidden="true">
                <Shirt size={98} strokeWidth={1.25} className="kit-icon" />
                {supporterActive && <FootyRushMark tone="light" className="kit-supporter-mark" />}
                <span className="kit-num">10</span>
              </span>
            </div>
            <p>
              {activeRun
                ? "Your current campaign keeps its identity. Saved changes start with your next draft."
                : "Your earned badge and kit choices follow the next club you draft."}
            </p>
          </div>

          <div className="club-controls">
            <div className="club-control-heading">
              <div>
                <p className="eyebrow">Earned personalization</p>
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
                {nameUnlocked ? "3–24 characters. This stays separate from your manager ID." : lockedHelp("club_name_custom")}
              </small>
            </label>

            <fieldset className="club-choice-group" aria-describedby="club-colours-help">
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
              <small id="club-colours-help">
                {palettePathUnlocked
                  ? "Colours apply across your custom kit and badge."
                  : supporterUnlocked && supporterActive
                    ? "Supporter colours apply while you wear Supporter Edition. Earn the scoring path to use them on standard kits."
                    : lockedHelp("kit_palette_basic")}
              </small>
            </fieldset>

            <fieldset className="club-choice-group" aria-describedby="kit-style-help">
              <legend>Kit pattern</legend>
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
              <small id="kit-style-help">{stylesUnlocked ? "Choose one pattern for your matchday kit." : lockedHelp("kit_style_basic")}</small>
            </fieldset>

            <fieldset className="club-choice-group" aria-describedby="badge-style-help">
              <legend>Badge shape</legend>
              <div className="club-badge-grid">
                {(Object.entries(CLUB_BADGE_STYLES) as Array<[ClubBadgeStyleId, (typeof CLUB_BADGE_STYLES)[ClubBadgeStyleId]]>).map(([id, badge]) => {
                  const locked = id !== "shield" && !badgesUnlocked;
                  return (
                    <button
                      key={id}
                      className={`club-badge-choice${draft.badgeStyle === id ? " is-selected" : ""}${locked ? " is-locked" : ""}`}
                      type="button"
                      disabled={locked}
                      aria-pressed={draft.badgeStyle === id}
                      onClick={() => {
                        setSaved(false);
                        setDraft((current) => ({ ...current, badgeStyle: id }));
                      }}
                    >
                      <span className="club-badge-choice-preview" style={{ ...draftVisualStyle, clipPath: badge.clipPath }}>FR</span>
                      <span>{badge.label}</span>
                      {locked ? <LockKeyhole size={14} aria-label="Locked" /> : null}
                    </button>
                  );
                })}
              </div>
              <small id="badge-style-help">{badgesUnlocked ? "The badge shape appears throughout matchday and tables." : lockedHelp("badge_style_basic")}</small>
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
              {saved && <span className="club-save-confirmation" role="status" aria-live="polite"><Check size={16} /> Saved for your next campaign</span>}
            </div>
          </div>
        </div>

        <section className="supporter-unlock" aria-labelledby="supporter-unlock-title">
          <div className="supporter-unlock-copy">
            <div className="supporter-kicker"><Heart size={16} aria-hidden="true" /> Supporter unlock</div>
            <p className="eyebrow">One-off contribution · about one coffee</p>
            <h3 id="supporter-unlock-title">FootyRush Supporter Edition</h3>
            <p>
              Help cover development and server costs, then wear a permanent cosmetic thank-you:
              the FootyRush crest, signature rush sash and an immutable gold frame.
            </p>
            <ul>
              <li>Choose any club palette for this edition; the standard palette path stays independent.</li>
              <li>The gold trim and FootyRush mark always identify a supporter.</li>
              <li>No gameplay advantage, recurring fee or competitive boost.</li>
            </ul>
            <button
              className={supporterUnlocked ? "primary-button" : "secondary-button"}
              type="button"
              disabled={!supporterUnlocked}
              aria-pressed={supporterActive}
              onClick={() => {
                setSaved(false);
                setDraft((current) => ({
                  ...current,
                  editionId: current.editionId === "supporter" ? "standard" : "supporter",
                  paletteId: current.editionId === "supporter" && !palettePathUnlocked
                    ? "footyrush"
                    : current.paletteId
                }));
              }}
            >
              <Coffee size={17} aria-hidden="true" />
              {supporterUnlocked
                ? supporterActive ? "Use standard edition" : "Wear Supporter Edition"
                : "Support checkout coming soon"}
            </button>
            {!supporterUnlocked && (
              <small>
                Preview only. Checkout stays disabled until payment verification can grant this securely to an account.
                This will be a supporter contribution, not a charitable or tax-deductible donation.
              </small>
            )}
          </div>
          <div className="supporter-preview" style={draftVisualStyle} aria-label="Supporter Edition badge and kit preview">
            <div className="supporter-preview-label"><Shield size={15} /> Gold Rush design</div>
            <div className="supporter-preview-stage">
              <span className="team-badge club-preview-badge is-supporter" style={badgeStyle} aria-hidden="true">
                <span className="supporter-brand-roundel"><FootyRushMark tone="light" /></span>
              </span>
              <span className="club-preview-kit team-kit is-supporter" style={draftVisualStyle} aria-hidden="true">
                <Shirt size={98} strokeWidth={1.25} className="kit-icon" />
                <FootyRushMark tone="light" className="kit-supporter-mark" />
                <span className="kit-num">10</span>
              </span>
            </div>
            <p>Signature gold stays fixed. Primary and secondary colours come from your club palette.</p>
          </div>
        </section>
      </div>
    </section>
  );
}
