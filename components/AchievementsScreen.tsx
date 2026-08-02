"use client";

import { Check, Coffee, Heart, LockKeyhole, Palette, Save, Shirt, Sparkles, Shield } from "lucide-react";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import SupporterBadge from "@/components/supporter/SupporterBadge";
import SupporterKit from "@/components/supporter/SupporterKit";
import {
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
  entitlementGrants: ClubEntitlementGrant[];
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
  entitlementGrants,
  onSave
}: UnlocksScreenProps) {
  const progress = useMemo(() => unlockProgress(records), [records]);
  const grants = entitlementGrants;
  const entitlements = useMemo(() => resolveClubEntitlements(grants), [grants]);
  const progressByReward = useMemo(
    () => new Map(progress.map((unlock) => [unlock.reward, unlock])),
    [progress]
  );
  const [draft, setDraft] = useState(identity);
  const [supporterPreviewPalette, setSupporterPreviewPalette] = useState<ClubPaletteId>(identity.paletteId);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setDraft(identity);
    setSupporterPreviewPalette(identity.paletteId);
  }, [identity]);

  const validation = validateClubIdentity(draft, grants);
  const nameUnlocked = entitlements.has("club_name_custom");
  const palettePathUnlocked = entitlements.has("kit_palette_basic");
  const stylesUnlocked = entitlements.has("kit_style_basic");
  const badgesUnlocked = entitlements.has("badge_style_basic");
  const supporterUnlocked = entitlements.has("supporter_edition");
  const supporterActive = supporterUnlocked && draft.editionId === "supporter";
  const palettesUnlocked = palettePathUnlocked || (supporterUnlocked && supporterActive);
  const completedCount = progress.filter((unlock) => unlock.completed).length;
  const dirty = JSON.stringify(draft) !== JSON.stringify(identity);
  const draftVisualStyle = visualStyle(draft);
  const supporterPreviewVisualStyle = visualStyle({
    ...draft,
    paletteId: supporterPreviewPalette,
    editionId: "supporter"
  });
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
          <div className="achievement-total unlock-total" aria-label={`${completedCount} of ${progress.length} career personalization unlocks earned`}>
            <LockKeyhole size={24} aria-hidden="true" />
            <strong>{completedCount}/{progress.length}</strong>
            <span>career unlocked</span>
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

        <section className="supporter-unlock" aria-labelledby="supporter-unlock-title">
          <div className="supporter-unlock-copy">
            <div className="supporter-kicker"><Heart size={16} aria-hidden="true" /> Supporter purchase</div>
            <p className="eyebrow">£4.99 once · about one coffee</p>
            <h3 id="supporter-unlock-title">FootyRush Supporter Edition — Founders’ Rush</h3>
            <p>
              Support development and server costs, then unlock a permanent cosmetic thank-you:
              the FootyRush crest, signature rush sash and fixed gold supporter frame.
            </p>
            <ul>
              <li>Choose any club palette for this edition; the standard palette path stays independent.</li>
              <li>The gold trim and FootyRush mark always identify a supporter.</li>
              <li>One payment. No subscription, gameplay advantage or competitive boost.</li>
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
                : "£4.99 checkout coming soon"}
            </button>
            {!supporterUnlocked && (
              <small>
                Preview only. Checkout stays disabled until payment verification can grant this securely to an account.
                This will be a one-off purchase of digital cosmetic content, not a charitable or tax-deductible donation.
              </small>
            )}
          </div>
          <div className="supporter-preview" style={supporterPreviewVisualStyle} role="group" aria-label="Supporter Edition badge and kit preview">
            <div className="supporter-preview-label"><Shield size={15} /> Founders’ Rush Sash</div>
            <div className="supporter-preview-stage">
              <SupporterBadge paletteId={supporterPreviewPalette} size="preview" decorative />
              <SupporterKit paletteId={supporterPreviewPalette} playerNumber={10} size="preview" decorative />
            </div>
            <fieldset className="supporter-preview-colours">
              <legend>Preview your club colours</legend>
              <div className="club-palette-grid">
                {(Object.entries(CLUB_PALETTES) as Array<[ClubPaletteId, (typeof CLUB_PALETTES)[ClubPaletteId]]>).map(([id, palette]) => (
                  <button
                    key={id}
                    className={`club-palette-choice${supporterPreviewPalette === id ? " is-selected" : ""}`}
                    type="button"
                    aria-label={`Preview supporter colours: ${palette.label}`}
                    aria-pressed={supporterPreviewPalette === id}
                    onClick={() => setSupporterPreviewPalette(id)}
                  >
                    <span
                      className="club-palette-swatch"
                      style={{ background: `linear-gradient(135deg, ${palette.primary} 0 50%, ${palette.secondary} 50% 100%)` }}
                      aria-hidden="true"
                    />
                    <span>{palette.label}</span>
                  </button>
                ))}
              </div>
            </fieldset>
            <p>Signature gold, the shield and the FR crest stay fixed. These preview colours do not unlock or save anything.</p>
          </div>
        </section>

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
              {supporterActive ? (
                <SupporterBadge
                  className="club-preview-supporter-badge"
                  paletteId={draft.paletteId}
                  size="preview"
                  title={`${draft.clubName} Founders’ Rush supporter badge preview`}
                />
              ) : (
                <span
                  className="team-badge club-preview-badge"
                  style={badgeStyle}
                  role="img"
                  aria-label={`${draft.clubName} badge preview`}
                >
                  {getTeamMonogram("", draft.clubName)}
                </span>
              )}
              {supporterActive ? (
                <SupporterKit
                  className="club-preview-supporter-kit"
                  paletteId={draft.paletteId}
                  playerNumber={10}
                  size="preview"
                  title={`${draft.clubName} Founders’ Rush supporter kit preview`}
                />
              ) : (
                <span className="club-preview-kit team-kit" style={draftVisualStyle} aria-hidden="true">
                  <Shirt size={98} strokeWidth={1.25} className="kit-icon" />
                  <span className="kit-num">10</span>
                </span>
              )}
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

      </div>
    </section>
  );
}
