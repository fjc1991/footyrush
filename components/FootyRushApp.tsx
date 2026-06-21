"use client";

import { Activity, BarChart3, ChevronRight, Globe, Goal, HeartPulse, LogIn, Mail, Moon, Play, Shield, Shirt, Shuffle, Sparkles, Sun, Timer, Trophy, Users } from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { en } from "@/lib/i18n/en";
import { FORMATION_LIST, getStarterSlots } from "@/lib/game/formations";
import { autoDraftManager, getDraftSlots, getOpenDraftSlots, makeDraftPick } from "@/lib/game/draft";
import { loadFootballData, spinForOpenSlots, getFootballData } from "@/lib/game/data";
import { BOOST_LIMIT } from "@/lib/game/boosts";
import { MANAGER_POOL, managerRatingForPosition } from "@/lib/game/managers";
import { createMinileague } from "@/lib/game/matchmaking";
import { renderCommentary } from "@/lib/game/commentary";
import {
  OUT_OF_FORM_EXPECTED_GOALS_PENALTY,
  TEAM_TALK_EXPECTED_GOALS_BONUS,
  applySeasonFixtureInjuries,
  applySeasonFixtureSuspensions,
  availableSeasonBench,
  canUseSeasonTeamTalk,
  createInvincibleSeason,
  createSeasonPregame,
  currentHumanFixture as getCurrentSeasonHumanFixture,
  decrementSeasonAbsences,
  markSeasonTeamTalkUsed,
  managerForSeasonMatch,
  remainingSeasonTeamTalks,
  seasonMissingRequiredSubstitutions,
  seasonUnavailablePlayerIds,
  seasonUnavailableStarters,
  teamTalkHalfForMatchday,
  type InvincibleSeason,
  type SeasonPregameDecision
} from "@/lib/game/season";
import { aggregateLeaderboard, demoLeaderboardRecords, recordsFromLeague } from "@/lib/game/leaderboard";
import {
  EXPERT_SCORE_THRESHOLD,
  MIN_MANAGER_SCORE,
  STARTING_MANAGER_SCORE,
  expertProgress,
  hasExpertAccess,
  isExpertUnlocked,
  scoreDeltaForStanding
} from "@/lib/game/progression";
import {
  applyFixtureInjuries,
  applySubstitution,
  calculateSquadStrength,
  computeStandings,
  simulateFixture
} from "@/lib/game/simulation";
import { getSupabaseBrowserClient, hasSupabaseConfig } from "@/lib/supabase/client";
import type { Session } from "@supabase/supabase-js";
import type {
  DraftMode,
  DraftPick,
  FixtureResult,
  FormationSlot,
  LeaderboardRecord,
  ManagerSquad,
  Period,
  SpinResult
} from "@/lib/game/types";

type Copy = typeof en;
type Phase = "setup" | "draft" | "league" | "complete" | "exhibition" | "season" | "invincible_complete";
type MainView = "play" | "leaderboards" | "personal";
type GameMode = "minileague" | "be_invincible";

interface LocalProfile {
  id: string;
  displayName: string;
  email?: string;
  demo: boolean;
}

interface SelectedManager {
  teamCode: string;
  teamName: string;
  year: number;
  manager: string;
  position: number;
  rating: number;
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

function fitLabelFor(fit: number): "perfect" | "good" | "okay" {
  return fit >= 1 ? "perfect" : fit >= 0.9 ? "good" : "okay";
}

function fitTextFor(fit: number): string {
  return fit >= 1 ? "Perfect" : fit >= 0.9 ? "Good fit" : "Okay";
}

interface GuestStatus {
  allowed: boolean;
  played: boolean;
}

interface LeagueState {
  id: string;
  skillBand: string;
  managers: ManagerSquad[];
  rounds: ReturnType<typeof createMinileague>["rounds"];
  currentRound: number;
  results: FixtureResult[];
}

interface ExhibitionState {
  home: ManagerSquad;
  away: ManagerSquad;
  result: FixtureResult;
}

const profileKey = "footyrush.profile";
const recordsKey = "footyrush.leaderboardRecords";
const localGuestKey = "footyrush.guestPlayed";
const managerScoreKey = "footyrush.mmr";
const managerKey = "footyrush.manager";
const managerSpinsKey = "footyrush.managerSpinsLeft";
const snapshotsKey = "footyrush.communitySnapshots";
const scoreModelKey = "footyrush.scoreModel";
// Bump when the manager-score model changes so returning testers reset cleanly.
const SCORE_MODEL = "v3-zero-to-1000";
const completedLeaguesKey = "footyrush.completedLeagues";
const expertUnlockedKey = "footyrush.expertUnlocked";
const TESTING_MODE = process.env.NEXT_PUBLIC_TESTING_MODE === "true";
const DRAFT_RESHUFFLE_LIMIT = 5;
const MANAGER_SPIN_LIMIT = 3;

function clearLocalRunState() {
  window.localStorage.removeItem(recordsKey);
  window.localStorage.removeItem(managerScoreKey);
  window.localStorage.removeItem(completedLeaguesKey);
  window.localStorage.removeItem(expertUnlockedKey);
  window.localStorage.removeItem(localGuestKey);
  window.localStorage.removeItem(managerKey);
  window.localStorage.removeItem(managerSpinsKey);
  window.localStorage.removeItem(snapshotsKey);
}

export default function FootyRushApp({ copy, locale }: { copy: Copy; locale: string }) {
  const [view, setView] = useState<MainView>("play");
  const [phase, setPhase] = useState<Phase>("setup");
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [gameMode, setGameMode] = useState<GameMode>("minileague");
  const [formationId, setFormationId] = useState("4-3-3");
  const [picks, setPicks] = useState<DraftPick[]>([]);
  const [spin, setSpin] = useState<SpinResult | null>(null);
  const [profile, setProfile] = useState<LocalProfile | null>(null);
  const [guestStatus, setGuestStatus] = useState<GuestStatus>({ allowed: true, played: false });
  const [showAuthGate, setShowAuthGate] = useState(false);
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [leaderboardPeriod, setLeaderboardPeriod] = useState<Period>("daily");
  const [leaderboardRecords, setLeaderboardRecords] = useState<LeaderboardRecord[]>([]);
  const [league, setLeague] = useState<LeagueState | null>(null);
  const [currentResult, setCurrentResult] = useState<FixtureResult | null>(null);
  const [liveSecond, setLiveSecond] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [readyToRecord, setReadyToRecord] = useState(false);
  const [selectedSub, setSelectedSub] = useState<string | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [slotPickerCandidateId, setSlotPickerCandidateId] = useState<number | null>(null);
  const [draftReshufflesLeft, setDraftReshufflesLeft] = useState(DRAFT_RESHUFFLE_LIMIT);
  const [dataReady, setDataReady] = useState(false);
  const [dataError, setDataError] = useState(false);
  const [managerScore, setManagerScore] = useState(STARTING_MANAGER_SCORE);
  const [selectedManager, setSelectedManager] = useState<SelectedManager | null>(null);
  const [managerSpinsLeft, setManagerSpinsLeft] = useState(MANAGER_SPIN_LIMIT);
  const [managerSpinning, setManagerSpinning] = useState(false);
  const [completedLeagues, setCompletedLeagues] = useState(0);
  const [expertUnlockedEarned, setExpertUnlockedEarned] = useState(false);
  const [lastScoreDelta, setLastScoreDelta] = useState<number | null>(null);
  const [expertUnlockedThisRun, setExpertUnlockedThisRun] = useState(false);
  const [matchSpeed, setMatchSpeed] = useState<1 | 2 | 4>(1);
  const [scoreFlashing, setScoreFlashing] = useState(false);
  const [lastFlashedGoalCount, setLastFlashedGoalCount] = useState(0);
  const [roundSummaryData, setRoundSummaryData] = useState<{ round: number; fixtures: FixtureResult[]; managers: ManagerSquad[] } | null>(null);
  const [exhibition, setExhibition] = useState<ExhibitionState | null>(null);
  const [exhibitionSecond, setExhibitionSecond] = useState(0);
  const [exhibitionPlaying, setExhibitionPlaying] = useState(false);
  const [season, setSeason] = useState<InvincibleSeason | null>(null);
  const [seasonDecision, setSeasonDecision] = useState<SeasonPregameDecision | null>(null);
  const [seasonOutOfFormChoice, setSeasonOutOfFormChoice] = useState<"keep" | "bench" | null>(null);
  const [seasonOutOfFormSubId, setSeasonOutOfFormSubId] = useState<number | null>(null);
  const [seasonTeamTalkActive, setSeasonTeamTalkActive] = useState(false);
  const [seasonAttemptMessage, setSeasonAttemptMessage] = useState("");
  const leagueCommentaryRef = useRef<HTMLDivElement | null>(null);
  const exhibitionCommentaryRef = useRef<HTMLDivElement | null>(null);

  const draftSlots = useMemo(() => getDraftSlots(formationId), [formationId]);
  const openSlots = useMemo(() => getOpenDraftSlots(formationId, picks), [formationId, picks]);
  const draftComplete = openSlots.length === 0;
  const usedPlayerIds = useMemo(() => new Set(picks.map((pick) => pick.player.i)), [picks]);
  const activeBoostCount = useMemo(() => picks.filter((pick) => pick.boostActive).length, [picks]);
  const standings = useMemo(() => (league ? computeStandings(league.managers, league.results) : []), [league]);
  const currentRoundFixtures = league?.rounds[league.currentRound] ?? [];
  const currentHumanFixture = currentRoundFixtures.find((fixture) => fixture.homeId === "human" || fixture.awayId === "human");
  const managerById = useMemo(() => new Map(league?.managers.map((manager) => [manager.id, manager]) ?? []), [league]);
  const seasonDisplayManagers = useMemo(
    () =>
      season
        ? season.managers.map((manager) =>
            manager.id === "human"
              ? {
                  ...manager,
                  injuredPlayerIds: seasonUnavailablePlayerIds(season.injuryGamesByPlayerId),
                  suspendedPlayerIds: seasonUnavailablePlayerIds({}, season.suspensionGamesByPlayerId)
                }
              : manager
          )
        : [],
    [season]
  );
  const seasonStandings = useMemo(() => (season ? computeStandings(season.managers, season.results) : []), [season]);
  const seasonManagerById = useMemo(() => new Map(seasonDisplayManagers.map((manager) => [manager.id, manager])), [seasonDisplayManagers]);
  const seasonHumanManager = useMemo(() => seasonDisplayManagers.find((manager) => manager.id === "human"), [seasonDisplayManagers]);
  const currentSeasonFixture = season ? getCurrentSeasonHumanFixture(season) : null;
  const visibleEvents = useMemo(
    () => currentResult?.events.filter((event) => event.second <= liveSecond) ?? [],
    [currentResult, liveSecond]
  );
  // Live score = goals that have actually happened by the current minute, not the final result.
  const liveHomeGoals = visibleEvents.filter((event) => event.code === "goal" && event.teamId === currentHumanFixture?.homeId).length;
  const liveAwayGoals = visibleEvents.filter((event) => event.code === "goal" && event.teamId === currentHumanFixture?.awayId).length;
  const exhibitionEvents = useMemo(
    () => exhibition?.result.events.filter((event) => event.second <= exhibitionSecond) ?? [],
    [exhibition, exhibitionSecond]
  );
  const exhibitionHomeGoals = exhibitionEvents.filter((event) => event.code === "goal" && event.teamId === "human").length;
  const exhibitionAwayGoals = exhibitionEvents.filter((event) => event.code === "goal" && event.teamId === exhibition?.away.id).length;
  const leaderboard = useMemo(
    () => aggregateLeaderboard([...demoLeaderboardRecords(), ...leaderboardRecords], leaderboardPeriod),
    [leaderboardPeriod, leaderboardRecords]
  );
  const expertUnlocked = hasExpertAccess(managerScore, expertUnlockedEarned);
  const draftMode: DraftMode = expertUnlocked ? "expert" : "classic";
  const draftStatus = phase === "complete" || phase === "exhibition" || phase === "invincible_complete" ? "Complete" : `${picks.length}/${draftSlots.length}`;
  const leagueStatus =
    phase === "invincible_complete"
      ? "Invincible complete"
      : phase === "season" && season
        ? `Match ${Math.min(season.currentMatchday + 1, 38)}/38`
        : phase === "complete"
          ? "Complete"
          : phase === "exhibition"
            ? "Exhibition"
            : league
              ? `Round ${Math.min(league.currentRound + 1, 5)}/5`
              : "Not joined";
  const humanStanding = standings.find((standing) => standing.managerId === "human");
  const seasonHumanStanding = seasonStandings.find((standing) => standing.managerId === "human");
  const seasonOutOfFormSubs = useMemo(() => {
    const human = seasonDisplayManagers.find((manager) => manager.id === "human");
    return human && seasonDecision?.outOfForm
      ? availableSeasonBench(human, season?.injuryGamesByPlayerId ?? {}, [seasonDecision.outOfForm.playerId], season?.suspensionGamesByPlayerId ?? {})
      : [];
  }, [season, seasonDecision, seasonDisplayManagers]);
  const seasonUnavailableStartersList = useMemo(
    () =>
      season && seasonHumanManager
        ? seasonUnavailableStarters({
            human: seasonHumanManager,
            injuryGamesByPlayerId: season.injuryGamesByPlayerId,
            suspensionGamesByPlayerId: season.suspensionGamesByPlayerId
          })
        : [],
    [season, seasonHumanManager]
  );
  const seasonMissingSubstitutions = useMemo(
    () =>
      season && seasonHumanManager
        ? seasonMissingRequiredSubstitutions({
            human: seasonHumanManager,
            injuryGamesByPlayerId: season.injuryGamesByPlayerId,
            suspensionGamesByPlayerId: season.suspensionGamesByPlayerId
          })
        : [],
    [season, seasonHumanManager]
  );
  const pendingCandidate = spin?.candidates.find((candidate) => candidate.player.i === slotPickerCandidateId) ?? null;
  const latestHumanInjury = [...visibleEvents]
    .reverse()
    .find((event) => event.code === "injury" && event.teamId === "human" && !selectedSub);

  function loadData() {
    setDataError(false);
    loadFootballData()
      .then(() => setDataReady(true))
      .catch(() => setDataError(true));
  }

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    function applyHashView() {
      const hashView = window.location.hash.replace("#", "");
      if (hashView === "leaderboards" || hashView === "personal" || hashView === "play") {
        setView(hashView);
      }
    }

    applyHashView();
    window.addEventListener("hashchange", applyHashView);
    return () => window.removeEventListener("hashchange", applyHashView);
  }, []);

  useEffect(() => {
    if (!langMenuOpen) return;
    function handlePointer(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (target && !target.closest(".lang-menu")) setLangMenuOpen(false);
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setLangMenuOpen(false);
    }
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [langMenuOpen]);

  useEffect(() => {
    const storedTheme = window.localStorage.getItem("footyrush.theme");
    const initialTheme: "light" | "dark" =
      storedTheme === "dark" || storedTheme === "light" ? storedTheme : "dark";
    document.documentElement.dataset.theme = initialTheme;
    setTheme(initialTheme);

    const storedProfile = window.localStorage.getItem(profileKey);
    const resetAnonymousVisit =
      !storedProfile &&
      (TESTING_MODE || window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
    if (resetAnonymousVisit) {
      clearLocalRunState();
    }

    if (storedProfile) {
      setProfile(JSON.parse(storedProfile) as LocalProfile);
    }

    const storedRecords = window.localStorage.getItem(recordsKey);
    if (storedRecords) {
      setLeaderboardRecords(JSON.parse(storedRecords) as LeaderboardRecord[]);
    }

    // One-time reset when the score model changes, so returning testers re-appoint a manager
    // and start from 0 on the current model instead of carrying stale scores from an old scale.
    if (window.localStorage.getItem(scoreModelKey) !== SCORE_MODEL) {
      window.localStorage.removeItem(managerKey);
      window.localStorage.removeItem(managerScoreKey);
      window.localStorage.removeItem(managerSpinsKey);
      window.localStorage.removeItem(expertUnlockedKey);
      window.localStorage.setItem(scoreModelKey, SCORE_MODEL);
    }

    const storedManager = window.localStorage.getItem(managerKey);
    const parsedManager = storedManager ? (JSON.parse(storedManager) as SelectedManager) : null;
    if (parsedManager) {
      setSelectedManager(parsedManager);
    }
    const storedScoreRaw = window.localStorage.getItem(managerScoreKey);
    const storedManagerScore = storedScoreRaw !== null ? Number(storedScoreRaw) : parsedManager?.rating ?? STARTING_MANAGER_SCORE;
    setManagerScore(storedManagerScore);
    setManagerSpinsLeft(Number(window.localStorage.getItem(managerSpinsKey) ?? MANAGER_SPIN_LIMIT));
    setCompletedLeagues(Number(window.localStorage.getItem(completedLeaguesKey) ?? 0));
    setExpertUnlockedEarned(window.localStorage.getItem(expertUnlockedKey) === "true" || isExpertUnlocked(storedManagerScore));

    if (resetAnonymousVisit) {
      setGuestStatus({ allowed: true, played: false });
    } else {
      fetch("/api/guest-plays")
        .then((response) => response.json())
        .then((status: GuestStatus) => {
          const localPlayed = window.localStorage.getItem(localGuestKey) === "true";
          setGuestStatus(localPlayed ? { allowed: false, played: true } : status);
        })
        .catch(() => undefined);
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      return;
    }

    const applySession = (session: Session | null) => {
      if (!session?.user) {
        return;
      }
      const email = session.user.email ?? "";
      const admin = session.user.app_metadata?.role === "admin";
      setIsAdmin(admin);
      persistProfile({
        id: session.user.id,
        displayName: admin ? "Admin (tester)" : email.split("@")[0] || "Manager",
        email,
        demo: false
      });
    };

    supabase.auth.getSession().then(({ data }) => applySession(data.session));
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => applySession(session));
    return () => authListener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!isPlaying) {
      return;
    }
    const timer = window.setInterval(() => {
      setLiveSecond((second) => {
        if (second >= 90) {
          window.clearInterval(timer);
          setIsPlaying(false);
          setReadyToRecord(true);
          return 90;
        }
        return second + 1;
      });
    }, 1000 / matchSpeed);

    return () => window.clearInterval(timer);
  }, [isPlaying, matchSpeed]);

  useEffect(() => {
    if (!exhibitionPlaying) {
      return;
    }
    const timer = window.setInterval(() => {
      setExhibitionSecond((second) => {
        if (second >= 90) {
          window.clearInterval(timer);
          setExhibitionPlaying(false);
          return 90;
        }
        return second + 1;
      });
    }, 1000 / matchSpeed);

    return () => window.clearInterval(timer);
  }, [exhibitionPlaying, matchSpeed]);

  useEffect(() => {
    if (leagueCommentaryRef.current) {
      leagueCommentaryRef.current.scrollTop = leagueCommentaryRef.current.scrollHeight;
    }
  }, [visibleEvents.length]);

  useEffect(() => {
    if (exhibitionCommentaryRef.current) {
      exhibitionCommentaryRef.current.scrollTop = exhibitionCommentaryRef.current.scrollHeight;
    }
  }, [exhibitionEvents.length]);

  useEffect(() => {
    const goalCount = visibleEvents.filter((e) => e.code === "goal").length;
    if (goalCount > lastFlashedGoalCount) {
      setScoreFlashing(true);
      setLastFlashedGoalCount(goalCount);
      const t = window.setTimeout(() => setScoreFlashing(false), 700);
      return () => window.clearTimeout(t);
    }
  }, [visibleEvents, lastFlashedGoalCount]);

  function persistProfile(nextProfile: LocalProfile) {
    setProfile(nextProfile);
    window.localStorage.setItem(profileKey, JSON.stringify(nextProfile));
    setShowAuthGate(false);
  }

  // Appoint a random real manager from the pool. Their finish-derived rating becomes the
  // starting manager score (replacing the old flat 1000) and grants a slight simulation edge.
  function shuffleManager() {
    if (managerSpinning || managerSpinsLeft <= 0) {
      return;
    }
    const nextSpinsLeft = managerSpinsLeft - 1;
    setManagerSpinsLeft(nextSpinsLeft);
    window.localStorage.setItem(managerSpinsKey, String(nextSpinsLeft));
    setManagerSpinning(true);

    window.setTimeout(() => {
      const entry = MANAGER_POOL[Math.floor(Math.random() * MANAGER_POOL.length)];
      const rating = managerRatingForPosition(entry.position);
      let teamName = entry.teamCode;
      try {
        teamName = getFootballData().teams[entry.teamCode]?.name ?? entry.teamCode;
      } catch {
        // Football data not loaded yet — fall back to the team code.
      }
      const next: SelectedManager = {
        teamCode: entry.teamCode,
        teamName,
        year: entry.year,
        manager: entry.manager,
        position: entry.position,
        rating
      };
      setSelectedManager(next);
      window.localStorage.setItem(managerKey, JSON.stringify(next));
      setManagerScore(rating);
      window.localStorage.setItem(managerScoreKey, String(rating));
      setManagerSpinning(false);
    }, 820);
  }

  function resetDraft(nextPhase: Phase = "setup") {
    setPicks([]);
    setSpin(null);
    setLeague(null);
    setCurrentResult(null);
    setLiveSecond(0);
    setIsPlaying(false);
    setReadyToRecord(false);
    setSelectedSub(null);
    setSlotPickerCandidateId(null);
    setDraftReshufflesLeft(DRAFT_RESHUFFLE_LIMIT);
    setExhibition(null);
    setExhibitionSecond(0);
    setExhibitionPlaying(false);
    setSeason(null);
    setSeasonDecision(null);
    setSeasonOutOfFormChoice(null);
    setSeasonOutOfFormSubId(null);
    setSeasonTeamTalkActive(false);
    setSeasonAttemptMessage("");
    setExpertUnlockedThisRun(false);
    setPhase(nextPhase);
  }

  function startDraft() {
    resetDraft("draft");
  }

  function switchView(nextView: MainView) {
    setView(nextView);
    const nextHash = nextView === "play" ? "" : `#${nextView}`;
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${nextHash}`);
  }

  function spinRound() {
    if (openSlots.length === 0 || spinning || !dataReady) {
      return;
    }
    const consumesReshuffle = Boolean(spin);
    if (consumesReshuffle && draftReshufflesLeft <= 0) {
      return;
    }
    if (consumesReshuffle) {
      setDraftReshufflesLeft((left) => Math.max(0, left - 1));
    }
    setSpin(null);
    setSlotPickerCandidateId(null);
    setSpinning(true);
    const seed = `${Date.now()}:${picks.length}:${formationId}`;
    window.setTimeout(() => {
      setSpin(spinForOpenSlots(openSlots, usedPlayerIds, seed));
      setSpinning(false);
    }, 650);
  }

  function queueSpinForOpenSlots(nextPicks: DraftPick[]) {
    const nextOpenSlots = getOpenDraftSlots(formationId, nextPicks);
    if (nextOpenSlots.length === 0) {
      setSpin(null);
      setSlotPickerCandidateId(null);
      return;
    }
    setSpin(null);
    setSlotPickerCandidateId(null);
    setSpinning(true);
    const nextUsedPlayerIds = new Set(nextPicks.map((pick) => pick.player.i));
    const seed = `${Date.now()}:${nextPicks.length}:${formationId}`;
    window.setTimeout(() => {
      setSpin(spinForOpenSlots(nextOpenSlots, nextUsedPlayerIds, seed));
      setSpinning(false);
    }, 500);
  }

  function handleSubSelection(injuredPlayerId: number, subPlayerId: number, subName: string) {
    if (!league) return;
    const updatedManagers = applySubstitution(league.managers, injuredPlayerId, subPlayerId);
    setLeague({ ...league, managers: updatedManagers });
    setSelectedSub(subName);
  }

  function choosePlayer(candidateIndex: number, slotId?: string) {
    if (!spin) {
      return;
    }
    const candidate = spin.candidates[candidateIndex];
    if (!candidate || usedPlayerIds.has(candidate.player.i)) {
      return;
    }
    const slotOption =
      slotId !== undefined
        ? candidate.slotOptions.find((option) => option.slotId === slotId)
        : candidate.slotOptions.length === 1
          ? candidate.slotOptions[0]
          : null;
    if (!slotOption) {
      setSlotPickerCandidateId(candidate.player.i);
      return;
    }
    const slot = draftSlots.find((entry) => entry.id === slotOption.slotId);
    if (!slot) {
      return;
    }

    const nextPick = makeDraftPick({
      slot,
      teamCode: spin.teamCode,
      teamName: spin.teamName,
      year: spin.year,
      candidate,
      slotOption,
      boostActive: Boolean(candidate.boost && activeBoostCount < BOOST_LIMIT)
    });
    const nextPicks = [...picks, nextPick];
    setPicks(nextPicks);
    queueSpinForOpenSlots(nextPicks);
  }

  function canEnterLeague(): boolean {
    return TESTING_MODE || Boolean(profile || guestStatus.allowed);
  }

  async function createInvincibleAttempt(): Promise<string> {
    const response = await fetch("/api/invincible-attempts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId: profile?.id })
    });
    if (!response.ok) {
      throw new Error("Invincible attempt could not be registered.");
    }
    const result = (await response.json()) as { attemptId?: string };
    if (!result.attemptId) {
      throw new Error("Invincible attempt response was missing an id.");
    }
    return result.attemptId;
  }

  function prepareSeasonMatch(nextSeason: InvincibleSeason): InvincibleSeason {
    const human = nextSeason.managers.find((manager) => manager.id === "human");
    if (!human) {
      return nextSeason;
    }
    const prepared = createSeasonPregame({
      human,
      matchday: nextSeason.currentMatchday,
      injuryGamesByPlayerId: nextSeason.injuryGamesByPlayerId,
      seed: `${nextSeason.id}:pregame:${nextSeason.currentMatchday}:${nextSeason.results.length}`
    });
    setSeasonDecision(prepared.decision);
    setSeasonOutOfFormChoice(null);
    setSeasonOutOfFormSubId(null);
    setSeasonTeamTalkActive(false);
    return { ...nextSeason, injuryGamesByPlayerId: prepared.injuryGamesByPlayerId };
  }

  async function enterLeague() {
    if (!draftComplete) {
      return;
    }
    if (!canEnterLeague()) {
      setShowAuthGate(true);
      return;
    }

    if (gameMode === "be_invincible") {
      let attemptId = `local-${Date.now()}`;
      setSeasonAttemptMessage("");
      try {
        attemptId = await createInvincibleAttempt();
      } catch {
        setSeasonAttemptMessage("Local Invincible attempt fallback is active. Official awards require the server gate.");
      }
      const nextSeason = createInvincibleSeason({
        humanPicks: picks,
        humanName: profile?.displayName ?? "Guest Manager",
        formationId,
        mode: draftMode,
        completedLeagues,
        mmr: managerScore,
        managerRating: selectedManager?.rating ?? managerScore,
        attemptId,
        seed: `${Date.now()}:${profile?.id ?? "guest"}:invincible`
      });
      const preparedSeason = prepareSeasonMatch(nextSeason);
      setSeason(preparedSeason);
      setCurrentResult(null);
      setPhase("season");
      return;
    }

    const nextLeague = createMinileague({
      humanPicks: picks,
      humanName: profile?.displayName ?? "Guest Manager",
      formationId,
      mode: draftMode,
      completedLeagues,
      mmr: managerScore,
      managerRating: selectedManager?.rating ?? managerScore,
      seed: `${Date.now()}:${profile?.id ?? "guest"}`
    });

    setLeague({ ...nextLeague, currentRound: 0, results: [] });
    setCurrentResult(null);
    setLiveSecond(0);
    setReadyToRecord(false);
    setPhase("league");
  }

  function startCurrentMatch() {
    if (!league || !currentHumanFixture) {
      return;
    }
    const home = managerById.get(currentHumanFixture.homeId);
    const away = managerById.get(currentHumanFixture.awayId);
    if (!home || !away) {
      return;
    }
    const result = simulateFixture({
      fixture: currentHumanFixture,
      home,
      away,
      seed: `${league.id}:${currentHumanFixture.id}:${league.results.length}`
    });
    setCurrentResult(result);
    setLiveSecond(0);
    setIsPlaying(true);
    setReadyToRecord(false);
    setSelectedSub(null);
    setLastFlashedGoalCount(0);
  }

  function finishNow() {
    setLiveSecond(90);
    setIsPlaying(false);
    setReadyToRecord(true);
  }

  function canKickOffSeasonMatch(): boolean {
    if (!season || !currentSeasonFixture) {
      return false;
    }
    if (seasonMissingSubstitutions.length > 0) {
      return false;
    }
    if (seasonDecision?.outOfForm && !seasonOutOfFormChoice) {
      return false;
    }
    if (seasonOutOfFormChoice === "bench" && seasonOutOfFormSubId === null) {
      return false;
    }
    return true;
  }

  function handleSeasonSubSelection(unavailablePlayerId: number, subPlayerId: number) {
    if (!season) {
      return;
    }
    const nextManagers = season.managers.map((manager) =>
      manager.id === "human"
        ? {
            ...manager,
            substitutions: { ...manager.substitutions, [unavailablePlayerId]: subPlayerId }
          }
        : manager
    );
    setSeason({ ...season, managers: nextManagers });
  }

  async function playSeasonMatchAndAdvance() {
    if (!season || !currentSeasonFixture || !canKickOffSeasonMatch()) {
      return;
    }
    const baseHome = season.managers.find((manager) => manager.id === currentSeasonFixture.homeId);
    const baseAway = season.managers.find((manager) => manager.id === currentSeasonFixture.awayId);
    const human = season.managers.find((manager) => manager.id === "human");
    if (!baseHome || !baseAway || !human) {
      return;
    }

    const matchHuman = managerForSeasonMatch({
      human,
      injuryGamesByPlayerId: season.injuryGamesByPlayerId,
      suspensionGamesByPlayerId: season.suspensionGamesByPlayerId,
      outOfFormPlayerId: seasonOutOfFormChoice === "bench" ? seasonDecision?.outOfForm?.playerId : undefined,
      outOfFormSubstituteId: seasonOutOfFormChoice === "bench" ? seasonOutOfFormSubId ?? undefined : undefined
    });
    const home = currentSeasonFixture.homeId === "human" ? matchHuman : baseHome;
    const away = currentSeasonFixture.awayId === "human" ? matchHuman : baseAway;
    const humanModifier =
      (seasonTeamTalkActive ? TEAM_TALK_EXPECTED_GOALS_BONUS : 0) -
      (seasonOutOfFormChoice === "keep" ? OUT_OF_FORM_EXPECTED_GOALS_PENALTY : 0);
    const result = simulateFixture({
      fixture: currentSeasonFixture,
      home,
      away,
      seed: `${season.id}:${currentSeasonFixture.id}:${season.results.length}`,
      homeExpectedGoalsModifier: currentSeasonFixture.homeId === "human" ? humanModifier : 0,
      awayExpectedGoalsModifier: currentSeasonFixture.awayId === "human" ? humanModifier : 0
    });
    await recordSeasonMatchAndAdvance(result);
  }

  async function completeInvincibleAttempt(completedSeason: InvincibleSeason, completedStandings: ReturnType<typeof computeStandings>) {
    const human = completedStandings.find((standing) => standing.managerId === "human");
    if (!human) {
      return { officialAward: false, production: false };
    }
    const response = await fetch(`/api/invincible-attempts/${completedSeason.attemptId}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        unbeaten: human.losses === 0,
        points: human.points,
        wins: human.wins,
        draws: human.draws,
        losses: human.losses,
        goalDifference: human.goalDifference
      })
    });
    if (!response.ok) {
      return { officialAward: false, production: false };
    }
    return (await response.json()) as { officialAward: boolean; production: boolean };
  }

  async function recordSeasonMatchAndAdvance(humanResult: FixtureResult) {
    if (!season) {
      return;
    }

    const currentRound = season.rounds[season.currentMatchday] ?? [];
    const nextResults = [...season.results, humanResult];
    const otherFixtures = currentRound.filter((fixture) => fixture.id !== humanResult.fixtureId);
    otherFixtures.forEach((fixture) => {
      const home = season.managers.find((manager) => manager.id === fixture.homeId);
      const away = season.managers.find((manager) => manager.id === fixture.awayId);
      if (!home || !away) {
        return;
      }
      nextResults.push(
        simulateFixture({
          fixture,
          home,
          away,
          seed: `${season.id}:${fixture.id}:${nextResults.length}`
        })
      );
    });

    const postMatchInjuries = applySeasonFixtureInjuries({
      injuryGamesByPlayerId: decrementSeasonAbsences(season.injuryGamesByPlayerId),
      result: humanResult,
      seed: `${season.id}:post-injury:${season.currentMatchday}`
    });
    const postMatchSuspensions = applySeasonFixtureSuspensions({
      suspensionGamesByPlayerId: decrementSeasonAbsences(season.suspensionGamesByPlayerId),
      result: humanResult
    });
    const nextMatchday = season.currentMatchday + 1;
    const nextTeamTalksUsedByHalf = seasonTeamTalkActive ? markSeasonTeamTalkUsed(season) : season.teamTalksUsedByHalf;
    let nextSeason: InvincibleSeason = {
      ...season,
      results: nextResults,
      currentMatchday: nextMatchday,
      injuryGamesByPlayerId: postMatchInjuries.injuryGamesByPlayerId,
      suspensionGamesByPlayerId: postMatchSuspensions.suspensionGamesByPlayerId,
      teamTalksUsedByHalf: nextTeamTalksUsedByHalf,
      boostsRemaining: remainingSeasonTeamTalks({ teamTalksUsedByHalf: nextTeamTalksUsedByHalf }),
      boostsUsed: seasonTeamTalkActive ? season.boostsUsed + 1 : season.boostsUsed
    };

    setSeasonOutOfFormChoice(null);
    setSeasonOutOfFormSubId(null);
    setSeasonTeamTalkActive(false);

    if (nextMatchday >= season.rounds.length) {
      const finalStandings = computeStandings(nextSeason.managers, nextSeason.results);
      const completion = await completeInvincibleAttempt(nextSeason, finalStandings);
      nextSeason = { ...nextSeason, officialAward: completion.officialAward, awardProduction: completion.production };
      setSeason(nextSeason);
      setSeasonDecision(null);
      setPhase("invincible_complete");
      return;
    }

    nextSeason = prepareSeasonMatch(nextSeason);
    setSeason(nextSeason);
  }

  function recordRoundAndAdvance() {
    if (!league || !currentResult) {
      return;
    }

    let nextManagers = applyFixtureInjuries(league.managers, currentResult);
    const nextResults = [...league.results, currentResult];
    const otherFixtures = currentRoundFixtures.filter((fixture) => fixture.id !== currentResult.fixtureId);
    const roundFixtureResults: FixtureResult[] = [currentResult];

    otherFixtures.forEach((fixture) => {
      const home = nextManagers.find((manager) => manager.id === fixture.homeId);
      const away = nextManagers.find((manager) => manager.id === fixture.awayId);
      if (!home || !away) {
        return;
      }
      const result = simulateFixture({
        fixture,
        home,
        away,
        seed: `${league.id}:${fixture.id}:${nextResults.length}`
      });
      nextResults.push(result);
      roundFixtureResults.push(result);
      nextManagers = applyFixtureInjuries(nextManagers, result);
    });

    // Clear suspensions after one round
    nextManagers = nextManagers.map((manager) => ({ ...manager, suspendedPlayerIds: [] }));

    const nextRound = league.currentRound + 1;
    const nextLeague = { ...league, managers: nextManagers, results: nextResults, currentRound: nextRound };
    setLeague(nextLeague);
    setCurrentResult(null);
    setLiveSecond(0);
    setReadyToRecord(false);
    setSelectedSub(null);

    if (nextRound >= league.rounds.length) {
      completeLeague(nextLeague);
    } else {
      setRoundSummaryData({ round: league.currentRound + 1, fixtures: roundFixtureResults, managers: league.managers });
    }
  }

  function dismissRoundSummary() {
    setRoundSummaryData(null);
  }

  function completeLeague(completedLeague: LeagueState) {
    const finalStandings = computeStandings(completedLeague.managers, completedLeague.results);
    const completedAt = new Date().toISOString();
    const newRecords = recordsFromLeague({
      managers: completedLeague.managers,
      standings: finalStandings,
      completedAt
    });
    const mergedRecords = [...leaderboardRecords, ...newRecords];
    setLeaderboardRecords(mergedRecords);
    window.localStorage.setItem(recordsKey, JSON.stringify(mergedRecords));
    const nextCompletedLeagues = completedLeagues + 1;
    setCompletedLeagues(nextCompletedLeagues);
    window.localStorage.setItem(completedLeaguesKey, String(nextCompletedLeagues));

    const human = finalStandings.find((standing) => standing.managerId === "human");
    if (human) {
      const currentScore = Number(window.localStorage.getItem(managerScoreKey) ?? managerScore);
      const wonTitle = finalStandings[0]?.managerId === "human";
      const delta = scoreDeltaForStanding(human, wonTitle);
      const nextScore = Math.max(MIN_MANAGER_SCORE, currentScore + delta);
      const wasExpert = hasExpertAccess(currentScore, expertUnlockedEarned);
      const nextExpert = hasExpertAccess(nextScore, wasExpert);
      setManagerScore(nextScore);
      setLastScoreDelta(delta);
      setExpertUnlockedEarned(nextExpert);
      setExpertUnlockedThisRun(!wasExpert && nextExpert);
      window.localStorage.setItem(managerScoreKey, String(nextScore));
      window.localStorage.setItem(expertUnlockedKey, String(nextExpert));
    }

    if (!profile && !TESTING_MODE) {
      window.localStorage.setItem(localGuestKey, "true");
      fetch("/api/guest-plays", { method: "POST" }).catch(() => undefined);
      setGuestStatus({ allowed: false, played: true });
    }

    saveCommunitySnapshot(completedLeague);
    setPhase("complete");
  }

  function readCommunitySnapshots(): ManagerSquad[] {
    try {
      const stored = window.localStorage.getItem(snapshotsKey);
      return stored ? (JSON.parse(stored) as ManagerSquad[]) : [];
    } catch {
      return [];
    }
  }

  function saveCommunitySnapshot(completedLeague: LeagueState) {
    const human = completedLeague.managers.find((manager) => manager.id === "human");
    if (!human) {
      return;
    }
    const snapshot: ManagerSquad = {
      ...human,
      id: `snapshot-${Date.now()}`,
      displayName: `${profile?.displayName ?? "Guest Manager"} XI`,
      kind: "reserve",
      source: "snapshot",
      injuredPlayerIds: [],
      suspendedPlayerIds: [],
      substitutions: {}
    };
    const snapshots = [snapshot, ...readCommunitySnapshots()].slice(0, 8);
    window.localStorage.setItem(snapshotsKey, JSON.stringify(snapshots));
  }

  function buildDemoSnapshot(): ManagerSquad | null {
    try {
      const demo = autoDraftManager({
        id: "snapshot-demo",
        displayName: "Northbank 98 XI",
        formationId: "4-3-3",
        seed: "footyrush-community-demo",
        mmr: 640,
        completedLeagues: 4
      });
      return {
        ...demo,
        kind: "reserve",
        source: "snapshot",
        managerRating: 58,
        injuredPlayerIds: [],
        suspendedPlayerIds: [],
        substitutions: {}
      };
    } catch {
      return null;
    }
  }

  function getCommunityOpponent(): ManagerSquad | null {
    const snapshots = readCommunitySnapshots();
    return snapshots[1] ?? buildDemoSnapshot();
  }

  function startExhibition() {
    if (!league || !dataReady) {
      return;
    }
    const human = league.managers.find((manager) => manager.id === "human");
    const opponent = getCommunityOpponent();
    if (!human || !opponent) {
      return;
    }
    const home: ManagerSquad = {
      ...human,
      injuredPlayerIds: [],
      suspendedPlayerIds: [],
      substitutions: {}
    };
    const away: ManagerSquad = {
      ...opponent,
      id: opponent.id === "human" ? "snapshot-opponent" : opponent.id,
      kind: "reserve",
      source: "snapshot",
      injuredPlayerIds: [],
      suspendedPlayerIds: [],
      substitutions: {}
    };
    const fixture = { id: `exhibition-${Date.now()}`, round: 1, homeId: "human", awayId: away.id };
    const result = simulateFixture({
      fixture,
      home,
      away,
      seed: `${fixture.id}:${home.displayName}:${away.displayName}`
    });
    setExhibition({ home, away, result });
    setExhibitionSecond(0);
    setExhibitionPlaying(true);
    setPhase("exhibition");
  }

  function finishExhibitionNow() {
    setExhibitionSecond(90);
    setExhibitionPlaying(false);
  }

  function returnFromExhibition() {
    setExhibition(null);
    setExhibitionSecond(0);
    setExhibitionPlaying(false);
    setPhase("complete");
  }

  async function signInWithGoogle() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setAuthMessage("Add Supabase environment variables to enable Google login. Email demo login is available locally.");
      return;
    }
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/${locale}`
      }
    });
  }

  async function signInWithPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthMessage("");
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setAuthMessage("Sign-in is unavailable until Supabase is configured.");
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({ email: authEmail.trim(), password: authPassword });
    if (error) {
      setAuthMessage(error.message);
      return;
    }
    // onAuthStateChange applies the profile. Clear the password field.
    setAuthPassword("");
    setAuthMessage("");
  }

  async function signUpWithPassword() {
    setAuthMessage("");
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setAuthMessage("Sign-up is unavailable until Supabase is configured.");
      return;
    }
    const email = authEmail.trim();
    if (!email || authPassword.length < 6) {
      setAuthMessage("Enter an email and a password of at least 6 characters.");
      return;
    }
    const { data, error } = await supabase.auth.signUp({ email, password: authPassword });
    if (error) {
      setAuthMessage(error.message);
      return;
    }
    setAuthPassword("");
    setAuthMessage(data.session ? "Account created. You're signed in." : "Account created. Check your email to confirm, then sign in.");
  }

  async function signOut() {
    const supabase = getSupabaseBrowserClient();
    await supabase?.auth.signOut();
    setProfile(null);
    setIsAdmin(false);
    window.localStorage.removeItem(profileKey);
    setAuthEmail("");
    setAuthPassword("");
    setAuthMessage("");
    setShowAuthGate(false);
  }

  async function signInWithEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthMessage("");
    const response = await fetch("/api/auth/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: authEmail })
    });
    const result = (await response.json()) as { ok: boolean; reason?: string; email?: string };
    if (!response.ok || !result.ok || !result.email) {
      setAuthMessage(result.reason ?? "Email could not be verified.");
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (supabase) {
      const { error } = await supabase.auth.signInWithOtp({
        email: result.email,
        options: { emailRedirectTo: `${window.location.origin}/${locale}` }
      });
      setAuthMessage(error ? error.message : "Check your email for the login link.");
      return;
    }

    persistProfile({
      id: `demo-${result.email}`,
      displayName: result.email.split("@")[0] || "Manager",
      email: result.email,
      demo: true
    });
    setAuthMessage("Demo profile saved locally.");
  }

  function startAnotherRun() {
    if (!TESTING_MODE && !profile && guestStatus.played) {
      setShowAuthGate(true);
      return;
    }
    resetDraft("setup");
  }

  const assistantMood =
    phase === "complete" && humanStanding && humanStanding.points >= 8
      ? "happy"
      : phase === "complete" && humanStanding && humanStanding.points <= 3
        ? "sad"
        : phase === "draft" || phase === "league" || phase === "exhibition" || phase === "season"
          ? "thinking"
          : "ready";
  const assistantLine =
    phase === "setup"
      ? selectedManager
        ? `You have ${managerSpinsLeft} manager spin${managerSpinsLeft === 1 ? "" : "s"} left. Pick a shape and start the draft.`
        : "Spin the manager wheel, then pick a shape for the squad."
      : phase === "draft"
        ? draftComplete
          ? "Squad is full. Take it into the historical league."
          : spin
            ? `This draw is ${spin.teamName} ${spin.year}. Pick any player, then assign their role.`
            : `Open roles: ${openSlots.slice(0, 4).map((slot) => slot.label).join(", ")}${openSlots.length > 4 ? "..." : ""}. Spin a club-season when ready.`
        : phase === "league"
          ? "These are historical opponents. Your season result goes to the real-player leaderboard."
          : phase === "season"
            ? "Thirty-eight matches. Stay unbeaten, manage the knocks, and use team talks carefully."
          : phase === "exhibition"
            ? "This exhibition is just for pride. No score, injuries or leaderboard points are changed."
            : phase === "invincible_complete"
              ? "Invincible season complete. The official award depends on the hidden eligibility gate."
            : "Season recorded. Try the community exhibition or build another squad.";

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <FootyRushLogo />
          <div>
            <p className="eyebrow">{copy.appName}</p>
            <h1>{copy.tagline}</h1>
          </div>
        </div>
        <nav className="banner-nav" aria-label="Primary">
          <button
            type="button"
            className={`banner-tab${view === "play" ? " active" : ""}`}
            onClick={() => switchView("play")}
          >
            {copy.tabPlay}
          </button>
          <button
            type="button"
            className={`banner-tab${view === "leaderboards" ? " active" : ""}`}
            onClick={() => !isPlaying && !exhibitionPlaying && switchView("leaderboards")}
            disabled={isPlaying || exhibitionPlaying}
            title={isPlaying || exhibitionPlaying ? copy.tabLockedHint : undefined}
          >
            {copy.tabLeaderboards}
            {(isPlaying || exhibitionPlaying) && <span className="tab-lock">· {copy.tabLive}</span>}
          </button>
          <button
            type="button"
            className={`banner-tab${view === "personal" ? " active" : ""}`}
            onClick={() => !isPlaying && !exhibitionPlaying && switchView("personal")}
            disabled={isPlaying || exhibitionPlaying}
            title={isPlaying || exhibitionPlaying ? copy.tabLockedHint : undefined}
          >
            {copy.tabProgress}
          </button>
        </nav>
        <div className="topbar-actions">
          <div className="lang-menu">
            <button
              type="button"
              className="lang-menu-button"
              onClick={() => setLangMenuOpen((open) => !open)}
              aria-haspopup="menu"
              aria-expanded={langMenuOpen}
              aria-label="Language"
            >
              <Globe size={16} />
              <span>{locale.toUpperCase()}</span>
            </button>
            {langMenuOpen && (
              <div className="lang-menu-list" role="menu">
                {(["en", "es", "fr", "pt"] as const).map((lang) => (
                  <a
                    key={lang}
                    href={`/${lang}`}
                    className={`lang-menu-item${locale === lang ? " active" : ""}`}
                    role="menuitem"
                  >
                    {lang.toUpperCase()}
                  </a>
                ))}
              </div>
            )}
          </div>
          <button
            className="icon-button theme-toggle"
            type="button"
            onClick={() => {
              const next = theme === "light" ? "dark" : "light";
              document.documentElement.dataset.theme = next;
              window.localStorage.setItem("footyrush.theme", next);
              setTheme(next);
            }}
            aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
            title={theme === "light" ? "Dark mode" : "Light mode"}
          >
            {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
          </button>
          <button className="profile-pill" type="button" onClick={() => setShowAuthGate(true)}>
            <LogIn size={16} />
            <span>{profile?.displayName ?? "Sign in"}</span>
          </button>
        </div>
      </header>

      {phase !== "setup" && (
        <section className={`status-strip${phase === "draft" ? " draft-status-strip" : ""}`} aria-label="Game status">
          {phase !== "draft" && (
            <div>
              <span>Draft</span>
              <strong>{draftStatus}</strong>
            </div>
          )}
          {phase !== "draft" && (
            <div>
              <span>League</span>
              <strong>{leagueStatus}</strong>
            </div>
          )}
          <div>
            <span>Score</span>
            <strong>{selectedManager ? managerScore : "—"}</strong>
          </div>
          <div>
            <span>Draft level</span>
            <strong>{expertUnlocked ? "Expert" : "Assisted"}</strong>
          </div>
        </section>
      )}

      {view === "play" && phase !== "setup" && (
        <section className="assistant-strip" aria-label="Assistant tip">
          <ManagerAvatar mood={assistantMood} line={assistantLine} compact />
        </section>
      )}

      {view === "leaderboards" && (
        <LeaderboardsScreen
          entries={leaderboard}
          period={leaderboardPeriod}
          setPeriod={setLeaderboardPeriod}
          copy={copy}
        />
      )}

      {view === "personal" && (
        <PersonalProgressScreen
          records={leaderboardRecords}
          managerScore={managerScore}
          completedLeagues={completedLeagues}
          expertUnlocked={expertUnlocked}
        />
      )}

      {view === "play" && phase === "setup" && (
        <>
          <section className="setup-home">
            <div className="setup-left">
              <div className="setup-feature-grid" aria-label="Setup flow">
                <div>
                  <span>01</span>
                  <strong>Pick manager</strong>
                  <small>Set your starting score and match edge.</small>
                </div>
                <div>
                  <span>02</span>
                  <strong>Choose the run</strong>
                  <small>Mini league or full invincible season.</small>
                </div>
                <div>
                  <span>03</span>
                  <strong>Draft the XI</strong>
                  <small>Build around your manager, then chase the table.</small>
                </div>
              </div>

              <div className="manager-pick">
                {managerSpinning ? (
                  <>
                    <p className="eyebrow">Choose manager</p>
                    <div className="manager-wheel" aria-live="polite">
                      <span>Guardiola</span>
                      <span>Klopp</span>
                      <span>Arteta</span>
                      <span>Tuchel</span>
                    </div>
                    <p className="manager-pick-prompt">Revealing your appointment...</p>
                  </>
                ) : selectedManager ? (
                  <>
                    <div className="manager-panel-head">
                      <div>
                        <p className="eyebrow">Choose manager</p>
                      </div>
                      <span>Stage 01</span>
                    </div>
                    <div className="manager-pick-head">
                      <div>
                        <strong className="manager-pick-name">{selectedManager.manager}</strong>
                        <span className="manager-pick-club">
                          {selectedManager.teamName} {selectedManager.year} · finished {ordinal(selectedManager.position)}
                        </span>
                      </div>
                      <span className="manager-pick-rating">{selectedManager.rating}</span>
                    </div>
                    <div className="manager-impact">
                      <div>
                        <strong>Starting score</strong>
                      <span>Higher finish gives a stronger manager score.</span>
                    </div>
                    <div>
                        <strong>Match edge</strong>
                        <span>Better managers add a small simulation boost.</span>
                      </div>
                    </div>
                    <div className="manager-pick-actions">
                      <span className="spin-bank">{managerSpinsLeft} manager spin{managerSpinsLeft === 1 ? "" : "s"} left</span>
                    <button className="secondary-button" type="button" onClick={shuffleManager} disabled={managerSpinsLeft <= 0 || managerSpinning}>
                        <Shuffle size={16} />
                        Re-shuffle manager
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="manager-panel-head">
                      <p className="eyebrow">Choose manager</p>
                      <span>Stage 01</span>
                    </div>
                    <div className="manager-impact">
                      <div>
                        <strong>Starting score</strong>
                      <span>Your manager sets the score you defend.</span>
                    </div>
                    <div>
                      <strong>Match edge</strong>
                      <span>Strong appointments help tight fixtures.</span>
                    </div>
                  </div>
                  <div className="manager-pick-actions">
                    <span className="spin-bank">{managerSpinsLeft} manager spins available</span>
                    <button className="primary-button" type="button" onClick={shuffleManager} disabled={managerSpinsLeft <= 0 || managerSpinning}>
                        <Shuffle size={16} />
                        Shuffle manager
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="setup-stack">
              <div className="setup-control">
                <div className="setup-section-head">
                  <p className="eyebrow">Game mode</p>
                  <span>Stage 02</span>
                </div>
                <div className="mode-grid" aria-label="Game mode">
                  <button
                    type="button"
                    className={`choice-card${gameMode === "minileague" ? " active" : ""}`}
                    onClick={() => setGameMode("minileague")}
                  >
                    <span className="eyebrow">Mini league</span>
                    <strong>Five-match rush</strong>
                    <small>Draft once, climb a compact historical table.</small>
                  </button>
                  <button
                    type="button"
                    className={`choice-card${gameMode === "be_invincible" ? " active" : ""}`}
                    onClick={() => setGameMode("be_invincible")}
                  >
                    <span className="eyebrow">Be Invincible</span>
                    <strong>38-game season</strong>
                    <small>Stay unbeaten through injuries, form dips and tight fixtures.</small>
                  </button>
                </div>
              </div>

              <button className="primary-button" type="button" onClick={startDraft} disabled={!selectedManager || managerSpinning}>
                <Play size={18} />
                {copy.startDraft}
              </button>
            </div>
          </section>

          <footer className="site-footer">
            <div>
              <strong>FootyRush</strong>
              <span>© 2026 FootyRush. All rights reserved.</span>
            </div>
            <nav aria-label="Footer">
              <a href="mailto:hello@footyrush.app">Contact</a>
              <a href="mailto:support@footyrush.app">Support</a>
              <button type="button">Privacy</button>
              <button type="button">Terms</button>
            </nav>
          </footer>
        </>
      )}

      {view === "play" && phase === "draft" && (
        <section className="draft-grid">
          <div className="panel draft-board">
            <div className="draft-bar">
              <p className="eyebrow draft-round-label">
                {draftComplete
                  ? "Squad complete"
                  : `${copy.draftRound} ${Math.min(picks.length + 1, draftSlots.length)} / ${draftSlots.length}`}
              </p>
              {dataError ? (
                <button className="secondary-button" type="button" onClick={loadData}>
                  <Shuffle size={17} />
                  Data failed to load — retry
                </button>
              ) : (
                <div className="draft-spin-controls">
                  <span className="spin-bank">{draftReshufflesLeft} left</span>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={spinRound}
                    disabled={draftComplete || spinning || !dataReady || (Boolean(spin) && draftReshufflesLeft <= 0)}
                  >
                    <Shuffle size={17} className={spinning ? "spin-icon" : ""} />
                    {!dataReady ? "Loading..." : spinning ? "Drawing..." : spin ? "Re-spin" : copy.spin}
                  </button>
                </div>
              )}
            </div>

            {spin ? (
              <div className="spin-result">
                <div className="draw-ticket">
                  <strong>{spin.teamCode}</strong>
                  <span>·</span>
                  <strong>{spin.year}</strong>
                  <small>{spin.teamName}</small>
                </div>
                {pendingCandidate && (
                  <div
                    className="slot-picker-overlay"
                    role="dialog"
                    aria-modal="true"
                    aria-label={`Assign a role to ${pendingCandidate.player.n}`}
                    onClick={() => setSlotPickerCandidateId(null)}
                  >
                    <div className="slot-picker" onClick={(event) => event.stopPropagation()}>
                    <div className="slot-picker-head">
                      <div>
                        <p className="eyebrow">Assign role</p>
                        <strong>{pendingCandidate.player.n}</strong>
                        <span className="slot-picker-positions">{pendingCandidate.player.p.join(" / ")}</span>
                      </div>
                      <button
                        className="slot-picker-close"
                        type="button"
                        onClick={() => setSlotPickerCandidateId(null)}
                        aria-label="Cancel role selection"
                      >
                        ×
                      </button>
                    </div>
                    <div className="slot-option-grid">
                      {pendingCandidate.slotOptions.map((option) => {
                        const optionFitLabel = fitLabelFor(option.fit);
                        const candidateIndex = spin.candidates.findIndex((entry) => entry.player.i === pendingCandidate.player.i);
                        return (
                          <button
                            key={option.slotId}
                            type="button"
                            className={`slot-option ${optionFitLabel}`}
                            onClick={() => choosePlayer(candidateIndex, option.slotId)}
                          >
                            <span>{option.slotLabel}</span>
                            <strong>{fitTextFor(option.fit)}</strong>
                            {draftMode === "classic" && <small>{Math.round(option.effectiveRating)} OVR</small>}
                          </button>
                        );
                      })}
                    </div>
                    </div>
                  </div>
                )}
                <div className="candidate-list">
                  {spin.candidates.map((candidate, index) => {
                    const fitLabel = fitLabelFor(candidate.fit);
                    const fitText = fitTextFor(candidate.fit);
                    const cardFitClass = draftMode === "classic" ? ` ${fitLabel}` : "";
                    const boostWillActivate = Boolean(candidate.boost && activeBoostCount < BOOST_LIMIT);
                    const roleTargets = candidate.slotOptions.slice(0, 3).map((option) => option.slotLabel).join(" · ") + (candidate.slotOptions.length > 3 ? " · +" : "");
                    return (
                      <div className={`fm-row${cardFitClass}`} key={candidate.player.i}>
                        {draftMode === "classic" ? (
                          <span className="fm-row-ovr">{Math.round(candidate.effectiveRating)}</span>
                        ) : (
                          <span className="fm-row-ovr hidden">?</span>
                        )}
                        <div className="fm-row-main">
                          <div className="fm-row-name">
                            <strong>{candidate.player.n}</strong>
                            {candidate.boost && (
                              <span className={`boost-badge${boostWillActivate ? "" : " inactive"}`}>
                                <Sparkles size={12} />
                                {candidate.boost.label}{boostWillActivate ? "" : " (inactive)"}
                              </span>
                            )}
                          </div>
                          <div className="fm-row-sub">
                            <span className="card-positions">{candidate.player.p.join(" / ")}</span>
                            <span className="role-targets">→ {roleTargets}</span>
                          </div>
                        </div>
                        {draftMode === "classic" && (
                          <div className="fm-row-stats">
                            <span>PAC {candidate.player.pac}</span>
                            <span>SHO {candidate.player.sho}</span>
                            <span>PAS {candidate.player.pas}</span>
                            <span>DEF {candidate.player.def}</span>
                          </div>
                        )}
                        {draftMode === "classic" && <span className={`fit-badge ${fitLabel}`}>{fitText}</span>}
                        <button className="primary-button pick-button" type="button" onClick={() => choosePlayer(index)}>
                          {candidate.slotOptions.length === 1 ? `Add to ${candidate.slotOptions[0].slotLabel}` : "Pick role"}
                          <ChevronRight size={16} />
                        </button>
                      </div>
                    );
                  })}
                </div>
                {spin.redraws > 0 && <p className="fine-print">Auto-redrew {spin.redraws} unavailable draw{spin.redraws === 1 ? "" : "s"}.</p>}
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-state-card">
                  <span className="empty-state-icon">
                    <Shuffle size={28} />
                  </span>
                  <p>Spin a club-season draw for the remaining open roles.</p>
                </div>
              </div>
            )}

            {draftComplete && (
              <button className="primary-button wide" type="button" onClick={enterLeague}>
                <Users size={18} />
                {gameMode === "be_invincible" ? "Start Be Invincible season" : copy.enterLeague}
              </button>
            )}
          </div>

          <div className="draft-right">
            <SquadPanel picks={picks} formationId={formationId} mode={draftMode} />

            <div className="panel formation-panel">
              <div className="formation-panel-head">
                <p className="eyebrow">Formation</p>
                {picks.length > 0 && <span className="fine-print">Locked</span>}
              </div>
              <div className="formation-grid">
                {FORMATION_LIST.map((formation) => (
                  <button
                    key={formation.id}
                    type="button"
                    className={formationId === formation.id ? "formation-button active" : "formation-button"}
                    onClick={() => {
                      if (picks.length === 0) setFormationId(formation.id);
                    }}
                    disabled={picks.length > 0 && formationId !== formation.id}
                    title={picks.length > 0 ? "Formation locks once you start assigning players" : undefined}
                  >
                    <FormationGlyph formationId={formation.id} />
                    <span>{formation.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {selectedManager && (
              <ProgressionPanel
                score={managerScore}
                completedLeagues={completedLeagues}
                expertUnlocked={expertUnlocked}
              />
            )}
          </div>
        </section>
      )}

      {view === "play" && phase === "league" && league && (
        <section className="league-layout matchday">
          <div className="panel match-panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Historical league · {league.skillBand}</p>
                <h2>Round {league.currentRound + 1}</h2>
              </div>
              <div className="timer">
                <Timer size={18} />
                {liveSecond}&apos;
              </div>
            </div>

            {currentHumanFixture && (
              <MatchHeader
                home={managerById.get(currentHumanFixture.homeId)}
                away={managerById.get(currentHumanFixture.awayId)}
                started={Boolean(currentResult)}
                homeGoals={liveHomeGoals}
                awayGoals={liveAwayGoals}
                flashing={scoreFlashing}
              />
            )}

            {!currentResult && currentHumanFixture && (
              <PreMatchPanel
                opponent={currentHumanFixture.homeId === "human"
                  ? managerById.get(currentHumanFixture.awayId)
                  : managerById.get(currentHumanFixture.homeId)}
                standings={standings}
                fixtureId={currentHumanFixture.id}
                onStart={startCurrentMatch}
              />
            )}

            {currentResult && (
              <>
                <div className="commentary-log" aria-live="polite" ref={leagueCommentaryRef}>
                  {visibleEvents.map((event) => (
                    <div
                      className={`commentary-line${event.code === "goal" ? " goal-flash" : event.code === "red_card" ? " red-flash" : ""}`}
                      key={event.id}
                    >
                      <span>{event.second}&apos;</span>
                      <p>
                        {event.code === "goal" && <Goal className="goal-icon" size={18} aria-label="Goal" />}
                        {renderCommentary(event, locale)}
                      </p>
                    </div>
                  ))}
                </div>

                {latestHumanInjury && (
                  (() => {
                    const humanManager = league.managers.find((manager) => manager.id === "human");
                    const availableSubs =
                      humanManager?.picks
                        .filter((pick) => pick.target === "SUB" && !humanManager.injuredPlayerIds.includes(pick.player.i))
                        .slice(0, 5) ?? [];
                    const assistantPick = [...availableSubs].sort((a, b) => b.effectiveRating - a.effectiveRating)[0];
                    return (
                      <div className="injury-prompt">
                        <strong>Substitution needed</strong>
                        <p>{latestHumanInjury.playerName} cannot continue. Pick a bench option or let the assistant choose.</p>
                        <div className="sub-row">
                          {availableSubs.map((pick) => (
                            <button
                              key={pick.player.i}
                              type="button"
                              className="sub-option"
                              onClick={() => {
                                if (latestHumanInjury?.playerId !== undefined) {
                                  handleSubSelection(latestHumanInjury.playerId, pick.player.i, pick.player.n);
                                } else {
                                  setSelectedSub(pick.player.n);
                                }
                              }}
                            >
                              <span className="sub-option-num">{pick.player.num}</span>
                              <span className="sub-option-name">{pick.player.n.split(/[\s.]+/).filter(Boolean).slice(-1)[0]}</span>
                              <span className="sub-option-pos">{pick.player.p[0]}</span>
                            </button>
                          ))}
                          <button
                            type="button"
                            className="sub-option assistant-pick"
                            onClick={() => {
                              if (latestHumanInjury?.playerId !== undefined && assistantPick) {
                                handleSubSelection(latestHumanInjury.playerId, assistantPick.player.i, assistantPick.player.n);
                              } else {
                                setSelectedSub("Assistant");
                              }
                            }}
                          >
                            <span className="sub-option-num">AI</span>
                            <span className="sub-option-name">Assistant</span>
                            <span className="sub-option-pos">Pick</span>
                          </button>
                        </div>
                      </div>
                    );
                  })()
                )}

                <div className="match-actions">
                  <div className="speed-controls" aria-label="Match speed">
                    {([1, 2, 4] as const).map((speed) => (
                      <button
                        key={speed}
                        type="button"
                        className={matchSpeed === speed ? "active" : ""}
                        onClick={() => setMatchSpeed(speed)}
                      >
                        {speed}x
                      </button>
                    ))}
                  </div>
                  {isPlaying ? (
                    <button className="secondary-button" type="button" onClick={finishNow}>
                      Finish now
                    </button>
                  ) : (
                    <button className="primary-button" type="button" onClick={recordRoundAndAdvance} disabled={!readyToRecord && liveSecond < 90}>
                      Continue league
                    </button>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="side-stack">
            <StandingsPanel standings={standings} />
            <InjuryPanel managers={league.managers} />
          </div>
        </section>
      )}

      {view === "play" && phase === "season" && season && (
        <section className="season-dashboard">
          <div className="season-dashboard-grid">
            <div className="season-main-stack">
              <div className="panel match-panel season-control-panel">
                <div className="panel-header">
                  <div>
                    <p className="eyebrow">Be Invincible · {season.skillBand}</p>
                    <h2>Match {season.currentMatchday + 1} of 38</h2>
                  </div>
                  <div className="timer season-stage-chip">Stage {season.currentMatchday + 1}</div>
                </div>

                {seasonAttemptMessage && <p className="fine-print compact-note">{seasonAttemptMessage}</p>}

                {currentSeasonFixture && (
                  <MatchHeader
                    home={seasonManagerById.get(currentSeasonFixture.homeId)}
                    away={seasonManagerById.get(currentSeasonFixture.awayId)}
                    started={false}
                    homeGoals={0}
                    awayGoals={0}
                  />
                )}

                {currentSeasonFixture && seasonHumanManager && (
                  <SeasonPreMatchPanel
                    opponent={currentSeasonFixture.homeId === "human"
                      ? seasonManagerById.get(currentSeasonFixture.awayId)
                      : seasonManagerById.get(currentSeasonFixture.homeId)}
                    human={seasonHumanManager}
                    humanStanding={seasonHumanStanding}
                    decision={seasonDecision}
                    season={season}
                    teamTalkActive={seasonTeamTalkActive}
                    outOfFormChoice={seasonOutOfFormChoice}
                    outOfFormSubId={seasonOutOfFormSubId}
                    availableSubs={seasonOutOfFormSubs}
                    unavailableStarters={seasonUnavailableStartersList}
                    missingSubstitutions={seasonMissingSubstitutions}
                    onChooseSub={handleSeasonSubSelection}
                    onUseTeamTalk={() => canUseSeasonTeamTalk(season) && setSeasonTeamTalkActive(true)}
                    onSkipTeamTalk={() => setSeasonTeamTalkActive(false)}
                    onKeepOutOfForm={() => {
                      setSeasonOutOfFormChoice("keep");
                      setSeasonOutOfFormSubId(null);
                    }}
                    onBenchOutOfForm={(subId) => {
                      setSeasonOutOfFormChoice("bench");
                      setSeasonOutOfFormSubId(subId);
                    }}
                    onStart={playSeasonMatchAndAdvance}
                    canStart={canKickOffSeasonMatch()}
                  />
                )}
              </div>

              <StandingsPanel standings={seasonStandings} eyebrow="Be Invincible" title="Season table" scrollable />
            </div>

            <div className="side-stack season-side-stack">
              {seasonHumanManager && (
                <div className="panel season-pitch-panel">
                  <div className="panel-header">
                    <div>
                      <p className="eyebrow">Your XI</p>
                      <h2>{seasonHumanManager.formationId}</h2>
                    </div>
                    <strong className="rating-chip">{Math.round(calculateSquadStrength(seasonHumanManager).overall)}</strong>
                  </div>
                  <FormationPitch
                    picks={seasonHumanManager.picks}
                    formationId={seasonHumanManager.formationId}
                    injuredPlayerIds={seasonUnavailablePlayerIds(season.injuryGamesByPlayerId)}
                    suspendedPlayerIds={seasonUnavailablePlayerIds({}, season.suspensionGamesByPlayerId)}
                  />
                </div>
              )}
              <SeasonStatusPanel season={season} />
              <SeasonResultsList season={season} managers={season.managers} />
              <InjuryPanel managers={seasonDisplayManagers} />
            </div>
          </div>
        </section>
      )}

      {view === "play" && phase === "complete" && league && (
        <section className="layout-grid complete-grid">
          <div className="panel intro-panel">
            <p className="eyebrow">League complete</p>
            <h2>{humanStanding ? `${humanStanding.points} points from five games` : "Final whistle"}</h2>
            <p>Your cumulative leaderboard score has been recorded for daily, weekly and monthly tables.</p>
            <div className={`score-change-card${expertUnlockedThisRun ? " unlocked" : ""}`}>
              <div>
                <span>Manager score</span>
                <strong>{managerScore}</strong>
              </div>
              <div>
                <span>This league</span>
                <strong>{lastScoreDelta === null ? "0" : `${lastScoreDelta >= 0 ? "+" : ""}${lastScoreDelta}`}</strong>
              </div>
              <p>
                {expertUnlockedThisRun
                  ? "Expert mode unlocked. Your next draft will hide ratings until the squad is complete."
                  : expertUnlocked
                    ? "Expert mode is active for your next draft."
                    : `${Math.max(0, EXPERT_SCORE_THRESHOLD - managerScore)} score to expert mode.`}
              </p>
            </div>
            <div className="complete-actions">
              <button className="primary-button" type="button" onClick={startAnotherRun}>
                <Shuffle size={18} />
                Build another squad
              </button>
              <button className="secondary-button" type="button" onClick={startExhibition} disabled={!dataReady}>
                <Users size={18} />
                Community exhibition
              </button>
              <button className="secondary-button" type="button" onClick={() => setView("leaderboards")}>
                <BarChart3 size={18} />
                View leaderboards
              </button>
            </div>
          </div>
          <StandingsPanel standings={standings} />
        </section>
      )}

      {view === "play" && phase === "invincible_complete" && season && (
        <section className="layout-grid complete-grid">
          <div className="panel intro-panel">
            <p className="eyebrow">Be Invincible complete</p>
            <h2>
              {seasonHumanStanding?.losses === 0
                ? season.officialAward && season.awardProduction !== false
                  ? "Official Invincible run awarded"
                  : "Unbeaten, but not an official assigned run"
                : `${seasonHumanStanding?.losses ?? 0} loss${seasonHumanStanding?.losses === 1 ? "" : "es"} ended the dream`}
            </h2>
            <p>
              Final record: {seasonHumanStanding?.wins ?? 0}W-{seasonHumanStanding?.draws ?? 0}D-{seasonHumanStanding?.losses ?? 0}L,
              {" "}{seasonHumanStanding?.points ?? 0} points, GD {seasonHumanStanding?.goalDifference ?? 0}.
            </p>
            <div className={`score-change-card${season.officialAward && season.awardProduction !== false ? " unlocked" : ""}`}>
              <div>
                <span>Unbeaten</span>
                <strong>{seasonHumanStanding?.losses === 0 ? "Yes" : "No"}</strong>
              </div>
              <div>
                <span>Team talks</span>
                <strong>{season.boostsUsed}/3</strong>
              </div>
              <p>
                {season.officialAward && season.awardProduction !== false
                  ? "The hidden eligibility gate confirmed this as an official Be Invincible achievement."
                  : seasonHumanStanding?.losses === 0
                    ? "This was an unbeaten season, but official Invincible awards are only granted to randomly assigned attempts."
                    : "Only unbeaten seasons can qualify for the official Invincible award."}
                {season.awardProduction === false ? " Local fallback mode was used, so production awards require the server gate." : ""}
              </p>
            </div>
            <div className="complete-actions">
              <button className="primary-button" type="button" onClick={startAnotherRun}>
                <Shuffle size={18} />
                Build another squad
              </button>
              <button className="secondary-button" type="button" onClick={() => setView("leaderboards")}>
                <BarChart3 size={18} />
                View leaderboards
              </button>
            </div>
          </div>
          <StandingsPanel standings={seasonStandings} eyebrow="Be Invincible" title="Final table" />
        </section>
      )}

      {view === "play" && phase === "exhibition" && exhibition && (
        <section className="league-layout matchday exhibition-layout">
          <div className="panel match-panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Community exhibition</p>
                <h2>One-off match</h2>
              </div>
              <div className="timer">
                <Timer size={18} />
                {exhibitionSecond}&apos;
              </div>
            </div>
            <MatchHeader
              home={exhibition.home}
              away={exhibition.away}
              started
              homeGoals={exhibitionHomeGoals}
              awayGoals={exhibitionAwayGoals}
            />
            <div className="commentary-log" aria-live="polite" ref={exhibitionCommentaryRef}>
              {exhibitionEvents.map((event) => (
                <div
                  className={`commentary-line${event.code === "goal" ? " goal-flash" : event.code === "red_card" ? " red-flash" : ""}`}
                  key={event.id}
                >
                  <span>{event.second}&apos;</span>
                  <p>
                    {event.code === "goal" && <Goal className="goal-icon" size={18} aria-label="Goal" />}
                    {renderCommentary(event, locale)}
                  </p>
                </div>
              ))}
            </div>
            <div className="match-actions">
              <div className="speed-controls" aria-label="Match speed">
                {([1, 2, 4] as const).map((speed) => (
                  <button
                    key={speed}
                    type="button"
                    className={matchSpeed === speed ? "active" : ""}
                    onClick={() => setMatchSpeed(speed)}
                  >
                    {speed}x
                  </button>
                ))}
              </div>
              {exhibitionPlaying ? (
                <button className="secondary-button" type="button" onClick={finishExhibitionNow}>
                  Finish now
                </button>
              ) : (
                <button className="primary-button" type="button" onClick={returnFromExhibition}>
                  Back to season review
                </button>
              )}
            </div>
          </div>
          <div className="side-stack">
            <div className="panel exhibition-note">
              <p className="eyebrow">No stakes</p>
              <h2>Friendly only</h2>
              <p>This match does not change manager score, injuries, standings or leaderboard points.</p>
            </div>
            <div className="panel squad-panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Opponent snapshot</p>
                  <h2>{exhibition.away.displayName}</h2>
                </div>
              </div>
              <FormationPitch picks={exhibition.away.picks} formationId={exhibition.away.formationId} />
            </div>
          </div>
        </section>
      )}

      {roundSummaryData && (
        <div className="modal-backdrop" role="presentation" onClick={dismissRoundSummary}>
          <section className="auth-modal round-summary-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="panel-header">
              <div>
                <p className="eyebrow">Round {roundSummaryData.round} results</p>
                <h2>Full-time scores</h2>
              </div>
              <Trophy size={22} />
            </div>
            <div className="table">
              {roundSummaryData.fixtures.map((result) => {
                const home = roundSummaryData.managers.find((m) => m.id === result.homeId);
                const away = roundSummaryData.managers.find((m) => m.id === result.awayId);
                return (
                  <div className="summary-row" key={result.fixtureId}>
                    <span className={result.homeId === "human" ? "you-label" : ""}>{home?.displayName ?? result.homeId}</span>
                    <strong className="summary-score">{result.homeGoals} – {result.awayGoals}</strong>
                    <span className={result.awayId === "human" ? "you-label" : ""}>{away?.displayName ?? result.awayId}</span>
                  </div>
                );
              })}
            </div>
            <button className="primary-button wide" type="button" onClick={dismissRoundSummary} style={{ marginTop: "16px" }}>
              Next round →
            </button>
          </section>
        </div>
      )}

      {showAuthGate && (
        <div className="modal-backdrop" role="presentation" onClick={() => setShowAuthGate(false)}>
          <section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title" onClick={(event) => event.stopPropagation()}>
            <div className="panel-header">
              <div>
                <p className="eyebrow">Private beta</p>
                <h2 id="auth-title">{copy.signInTitle}</h2>
              </div>
              <Shield size={22} />
            </div>
            {profile ? (
              <>
                <p>
                  Signed in as <strong>{profile.displayName}</strong>
                  {profile.email ? ` (${profile.email})` : ""}.
                  {isAdmin ? " Admin testing mode — signed-in progress is preserved for returning-user checks." : ""}
                </p>
                <button className="primary-button wide" type="button" onClick={signOut}>
                  <LogIn size={18} />
                  Sign out
                </button>
              </>
            ) : (
              <>
                <p>{copy.signInCopy}</p>
                <form className="auth-stack" onSubmit={signInWithPassword}>
                  <input
                    value={authEmail}
                    onChange={(event) => setAuthEmail(event.target.value)}
                    placeholder="you@example.com"
                    inputMode="email"
                    autoComplete="email"
                  />
                  <input
                    value={authPassword}
                    onChange={(event) => setAuthPassword(event.target.value)}
                    placeholder="Password"
                    type="password"
                    autoComplete="current-password"
                  />
                  <button className="primary-button wide" type="submit">
                    <LogIn size={18} />
                    Sign in
                  </button>
                  <button className="secondary-button wide" type="button" onClick={signUpWithPassword}>
                    Create account
                  </button>
                </form>
                <p className="auth-divider">or</p>
                <button className="secondary-button wide" type="button" onClick={signInWithGoogle}>
                  <LogIn size={16} />
                  {copy.google}
                </button>
                <form className="email-form" onSubmit={signInWithEmail}>
                  <button className="secondary-button wide" type="submit">
                    <Mail size={16} />
                    {copy.email}
                  </button>
                </form>
              </>
            )}
            {!hasSupabaseConfig() && <p className="fine-print">Local demo mode is active until Supabase env vars are added.</p>}
            {authMessage && <p className="auth-message">{authMessage}</p>}
          </section>
        </div>
      )}
    </main>
  );
}

function FootyRushLogo() {
  return (
    <div className="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 64 64" className="brand-logo">
        <path className="brand-logo-trail" d="M 8 40 C 17 28 28 22 46 20" />
        <path className="brand-logo-trail short" d="M 11 49 C 22 39 34 34 55 33" />
        <circle className="brand-logo-ball" cx="40" cy="26" r="13" />
        <path className="brand-logo-seam" d="M 32 18 L 40 13 L 48 18 L 45 29 L 35 29 Z" />
        <path className="brand-logo-seam" d="M 28 27 L 35 29 M 45 29 L 53 27 M 32 18 L 28 27 M 48 18 L 53 27" />
      </svg>
      <span>FR</span>
    </div>
  );
}

function ProgressionPanel({
  score,
  completedLeagues,
  expertUnlocked
}: {
  score: number;
  completedLeagues: number;
  expertUnlocked: boolean;
}) {
  const progress = expertProgress(score);
  const pointsToExpert = Math.max(0, EXPERT_SCORE_THRESHOLD - score);

  return (
    <div className={`progression-panel${expertUnlocked ? " unlocked" : ""}`}>
      <div className="progression-head">
        <div>
          <p className="eyebrow">Manager score</p>
          <strong>{score}</strong>
        </div>
        <span className="progression-level-chip">{expertUnlocked ? "Expert" : "Assist"}</span>
      </div>
      <div className="progress-track" aria-label="Progress to expert mode">
        <span style={{ width: `${progress}%` }} />
      </div>
      <div className="progression-meta">
        <span>{completedLeagues} leagues completed</span>
        <span>{expertUnlocked ? "Expert mode active" : `${pointsToExpert} score to expert`}</span>
      </div>
      <p>
        {expertUnlocked
          ? "Expert mode unlocked. Future drafts hide ratings until the squad is complete."
          : `Reach ${EXPERT_SCORE_THRESHOLD} manager score to unlock expert mode.`}
      </p>
    </div>
  );
}

function SquadPanel({ picks, formationId, mode }: { picks: DraftPick[]; formationId: string; mode: DraftMode }) {
  const activeBoosts = picks.filter((pick) => pick.boostActive).length;
  const strength = picks.length === 16
    ? calculateSquadStrength({
        id: "preview",
        displayName: "Preview",
        kind: "human",
        formationId,
        mode,
        picks,
        mmr: STARTING_MANAGER_SCORE,
        managerRating: 50,
        completedLeagues: 0,
        injuredPlayerIds: [],
        suspendedPlayerIds: [],
        substitutions: {}
      })
    : null;

  return (
    <div className="panel squad-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Matchday squad</p>
          <h2>{formationId}</h2>
        </div>
        {strength && <strong className="rating-chip">{Math.round(strength.overall)}</strong>}
      </div>
      <FormationPitch picks={picks} formationId={formationId} />
      {picks.length > 0 && (
        <div className="boost-cap">
          <Sparkles size={14} />
          <span>{activeBoosts}/{BOOST_LIMIT} active player boosts</span>
        </div>
      )}
    </div>
  );
}

function FormationPitch({
  picks,
  formationId,
  injuredPlayerIds = [],
  suspendedPlayerIds = []
}: {
  picks: DraftPick[];
  formationId: string;
  injuredPlayerIds?: number[];
  suspendedPlayerIds?: number[];
}) {
  const slots = getStarterSlots(formationId);
  const lineYPct: Record<string, number> = { keeper: 88, defense: 66, midfield: 42, attack: 17 };

  const byLine: Record<string, FormationSlot[]> = {};
  slots.forEach((slot) => {
    const line = slot.line;
    if (!byLine[line]) byLine[line] = [];
    byLine[line].push(slot);
  });

  const bench = picks.filter((p) => p.target === "SUB");

  return (
    <div>
      <div className="pitch-container">
        <div className="pitch-turf" aria-hidden />
        <svg className="pitch-markings" viewBox="0 0 100 150" preserveAspectRatio="none">
          <rect x="3" y="3" width="94" height="144" rx="1" stroke="rgba(255,255,255,0.32)" strokeWidth="0.7" fill="none" />
          <line x1="3" y1="75" x2="97" y2="75" stroke="rgba(255,255,255,0.28)" strokeWidth="0.6" />
          <circle cx="50" cy="75" r="11" stroke="rgba(255,255,255,0.28)" strokeWidth="0.6" fill="none" />
          <circle cx="50" cy="75" r="0.9" fill="rgba(255,255,255,0.4)" />
          {/* bottom (own) box */}
          <rect x="22" y="128" width="56" height="19" stroke="rgba(255,255,255,0.24)" strokeWidth="0.6" fill="none" />
          <rect x="36" y="140" width="28" height="7" stroke="rgba(255,255,255,0.24)" strokeWidth="0.6" fill="none" />
          <path d="M 38 128 A 12 12 0 0 1 62 128" stroke="rgba(255,255,255,0.24)" strokeWidth="0.6" fill="none" />
          <circle cx="50" cy="134" r="0.8" fill="rgba(255,255,255,0.32)" />
          {/* top (attacking) box */}
          <rect x="22" y="3" width="56" height="19" stroke="rgba(255,255,255,0.24)" strokeWidth="0.6" fill="none" />
          <rect x="36" y="3" width="28" height="7" stroke="rgba(255,255,255,0.24)" strokeWidth="0.6" fill="none" />
          <path d="M 38 22 A 12 12 0 0 0 62 22" stroke="rgba(255,255,255,0.24)" strokeWidth="0.6" fill="none" />
          <circle cx="50" cy="16" r="0.8" fill="rgba(255,255,255,0.32)" />
        </svg>
        {Object.entries(byLine).map(([line, lineSlots]) => {
          const yPct = lineYPct[line] ?? 50;
          return lineSlots.map((slot, idx) => {
            const count = lineSlots.length;
            const xPct = count === 1 ? 50 : 12 + (idx / (count - 1)) * 76;
            const pick = picks.find((p) => p.slotId === slot.id);
            if (!pick) {
              return (
                <div
                  key={slot.id}
                  className="pitch-player pitch-player-ghost"
                  style={{ left: `${xPct}%`, top: `${yPct}%`, animationDelay: `${(idx % 4) * 0.3}s` }}
                >
                  <span className="pitch-token ghost">
                    <Shirt size={34} strokeWidth={1.5} className="kit-icon" />
                  </span>
                  <span className="pitch-pos">{slot.target}</span>
                </div>
              );
            }
            const isInjured = injuredPlayerIds.includes(pick.player.i);
            const isSuspended = suspendedPlayerIds.includes(pick.player.i);
            const tokenClass = `pitch-token${isInjured ? " injured" : isSuspended ? " suspended" : ""}`;
            const lastName = pick.player.n.split(/[\s.]+/).filter(Boolean).slice(-1)[0] ?? pick.player.n;
            return (
              <div
                key={pick.slotId}
                className="pitch-player"
                style={{ left: `${xPct}%`, top: `${yPct}%` }}
                title={`${pick.player.n} · ${pick.slotLabel} · ${pick.teamCode} '${String(pick.year).slice(2)}${pick.boostActive && pick.boost ? ` · ${pick.boost.label}` : ""}`}
              >
                <span className={tokenClass}>
                  <Shirt size={34} strokeWidth={1.5} className="kit-icon" />
                  <span className="kit-num">{pick.player.num}</span>
                  {isInjured && <span className="token-flag injury">＋</span>}
                  {isSuspended && <span className="token-flag susp">▌</span>}
                  {pick.boostActive && <span className="token-flag boost">B</span>}
                </span>
                <span className="pitch-name">{lastName}</span>
                <span className="pitch-pos">{pick.slotLabel}</span>
              </div>
            );
          });
        })}
      </div>
      {bench.length > 0 && (
        <div className="bench-row">
          <span className="bench-label">Bench</span>
          {bench.map((pick) => {
            const isOut = injuredPlayerIds.includes(pick.player.i) || suspendedPlayerIds.includes(pick.player.i);
            return (
              <div key={pick.slotId} className={`bench-player${isOut ? " out" : ""}`} title={pick.player.n}>
                <span className="bench-num">{pick.player.num}</span>
                <span>{pick.player.n.split(/[\s.]+/).filter(Boolean).slice(-1)[0]}</span>
                <small>{pick.benchRole}</small>
                {pick.boostActive && <span className="bench-boost">B</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FormationGlyph({ formationId }: { formationId: string }) {
  const slots = getStarterSlots(formationId);
  const lineYPct: Record<string, number> = { attack: 14, midfield: 40, defense: 66, keeper: 90 };

  const byLine: Record<string, number> = {};
  slots.forEach((slot) => {
    byLine[slot.line] = (byLine[slot.line] ?? 0) + 1;
  });

  return (
    <svg className="formation-glyph" viewBox="0 0 60 100" aria-hidden="true">
      <rect x="2" y="2" width="56" height="96" rx="4" className="formation-glyph-pitch" />
      <line x1="2" y1="50" x2="58" y2="50" className="formation-glyph-stroke" />
      <circle cx="30" cy="50" r="8" className="formation-glyph-stroke" />
      {Object.entries(byLine).map(([line, count]) =>
        Array.from({ length: count }, (_, idx) => {
          const xPct = count === 1 ? 50 : 14 + (idx / (count - 1)) * 72;
          return (
            <circle
              key={`${line}-${idx}`}
              cx={(xPct / 100) * 56 + 2}
              cy={((lineYPct[line] ?? 50) / 100) * 96 + 2}
              r="3.4"
              className="formation-glyph-dot"
            />
          );
        })
      )}
    </svg>
  );
}

function MatchHeader({
  home,
  away,
  started,
  homeGoals,
  awayGoals,
  flashing
}: {
  home?: ManagerSquad;
  away?: ManagerSquad;
  started: boolean;
  homeGoals: number;
  awayGoals: number;
  flashing?: boolean;
}) {
  return (
    <div className="scoreboard">
      <div>
        <span>{managerSourceLabel(home)}</span>
        <strong>{home?.displayName}</strong>
      </div>
      <div className={`score${flashing ? " flashing" : ""}`}>
        {started ? `${homeGoals} – ${awayGoals}` : "v"}
      </div>
      <div>
        <span>{managerSourceLabel(away)}</span>
        <strong>{away?.displayName}</strong>
      </div>
    </div>
  );
}

function managerSourceLabel(manager?: ManagerSquad): string {
  if (!manager) return "";
  if (manager.kind === "human" || manager.source === "human") return "You";
  if (manager.source === "historical") return "Historical";
  if (manager.source === "snapshot") return "Community";
  return "Reserve";
}

function StandingsPanel({
  standings,
  eyebrow = "Historical league",
  title = "Standings",
  scrollable = false
}: {
  standings: ReturnType<typeof computeStandings>;
  eyebrow?: string;
  title?: string;
  scrollable?: boolean;
}) {
  return (
    <div className={`panel table-panel${scrollable ? " scrollable-table-panel" : ""}`}>
      <div className="panel-header">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
        </div>
        <Trophy size={21} />
      </div>
      <div className="table">
        <div className="table-row table-head">
          <span>Club</span>
          <span>P</span>
          <span>GD</span>
          <span>Pts</span>
        </div>
        {standings.map((standing) => (
          <div className="table-row" key={standing.managerId}>
            <strong>{standing.displayName}</strong>
            <span>{standing.played}</span>
            <span>{standing.goalDifference}</span>
            <span>{standing.points}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function InjuryPanel({ managers }: { managers: ManagerSquad[] }) {
  const injuries = managers.flatMap((manager) =>
    manager.injuredPlayerIds.map((playerId) => ({
      manager,
      pick: manager.picks.find((p) => p.player.i === playerId),
      type: "injury" as const
    }))
  );
  const suspensions = managers.flatMap((manager) =>
    manager.suspendedPlayerIds.map((playerId) => ({
      manager,
      pick: manager.picks.find((p) => p.player.i === playerId),
      type: "suspended" as const
    }))
  );
  const all = [...injuries, ...suspensions];
  return (
    <div className="panel injury-panel">
      <p className="eyebrow">Medical room</p>
      {all.length === 0 ? (
        <p className="muted">No injuries yet.</p>
      ) : (
        all.slice(0, 10).map(({ manager, pick, type }) => (
          <div className="injury-row" key={`${manager.id}-${pick?.player.i}-${type}`}>
            <span>{manager.displayName}</span>
            <strong className={type === "suspended" ? "suspended-label" : "injury-label"}>
              {type === "suspended" ? <span className="status-icon suspended-icon">🟥</span> : <HeartPulse size={14} className="status-icon injury-icon" />}
              {pick?.player.n}
            </strong>
          </div>
        ))
      )}
    </div>
  );
}

const managerQuotes = [
  "We've been working hard in training. The boys are ready.",
  "Their squad looks solid, but we've seen better. No fear.",
  "Three points is all I'm interested in. Simple as that.",
  "We know their weak spots. Trust the system.",
  "The pitch is where it all gets settled. Focus."
];

function hashStr(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function PreMatchPanel({
  opponent,
  standings,
  fixtureId,
  onStart
}: {
  opponent?: ManagerSquad;
  standings: ReturnType<typeof computeStandings>;
  fixtureId: string;
  onStart: () => void;
}) {
  if (!opponent) {
    return (
      <button className="primary-button wide" type="button" onClick={onStart}>
        <Activity size={18} />
        Start live sim
      </button>
    );
  }

  const oppStrength = calculateSquadStrength(opponent);
  const oppStanding = standings.find((s) => s.managerId === opponent.id);
  const quote = managerQuotes[hashStr(fixtureId) % managerQuotes.length];

  return (
    <div className="prematch-panel">
      <div className="prematch-header">
        <div className="prematch-team">
          <span className="you-label">You</span>
          <strong>Your squad</strong>
        </div>
        <span className="prematch-vs">v</span>
        <div className="prematch-team">
          <span>{opponent.displayName}</span>
          <strong>{opponent.formationId}</strong>
        </div>
      </div>
      <div className="prematch-stats">
        <div className="prematch-stat">
          <span>OVR </span>{Math.round(oppStrength.overall)}
        </div>
        {oppStanding && (
          <>
            <div className="prematch-stat">
              <span>P </span>{oppStanding.played}
            </div>
            <div className="prematch-stat">
              <span>W </span>{oppStanding.wins}
            </div>
            <div className="prematch-stat">
              <span>Pts </span>{oppStanding.points}
            </div>
          </>
        )}
      </div>
      <ManagerAvatar mood="thinking" line={quote} />
      <button className="primary-button wide" type="button" onClick={onStart}>
        <Activity size={18} />
        Kick off
      </button>
    </div>
  );
}

function SeasonPreMatchPanel({
  opponent,
  human,
  humanStanding,
  decision,
  season,
  teamTalkActive,
  outOfFormChoice,
  outOfFormSubId,
  availableSubs,
  unavailableStarters,
  missingSubstitutions,
  canStart,
  onChooseSub,
  onUseTeamTalk,
  onSkipTeamTalk,
  onKeepOutOfForm,
  onBenchOutOfForm,
  onStart
}: {
  opponent?: ManagerSquad;
  human: ManagerSquad;
  humanStanding?: ReturnType<typeof computeStandings>[number];
  decision: SeasonPregameDecision | null;
  season: InvincibleSeason;
  teamTalkActive: boolean;
  outOfFormChoice: "keep" | "bench" | null;
  outOfFormSubId: number | null;
  availableSubs: DraftPick[];
  unavailableStarters: DraftPick[];
  missingSubstitutions: DraftPick[];
  canStart: boolean;
  onChooseSub: (unavailablePlayerId: number, subPlayerId: number) => void;
  onUseTeamTalk: () => void;
  onSkipTeamTalk: () => void;
  onKeepOutOfForm: () => void;
  onBenchOutOfForm: (subId: number) => void;
  onStart: () => void;
}) {
  const oppStrength = opponent ? calculateSquadStrength(opponent) : null;
  const talkHalf = teamTalkHalfForMatchday(season.currentMatchday);
  const teamTalkAvailable = canUseSeasonTeamTalk(season);
  const usedSubIds = new Set(
    unavailableStarters
      .map((starter) => human.substitutions[starter.player.i])
      .filter((playerId): playerId is number => playerId !== undefined)
  );
  const unavailableIds = new Set(seasonUnavailablePlayerIds(season.injuryGamesByPlayerId, season.suspensionGamesByPlayerId));
  const absenceLabel = (playerId: number) => {
    const injuryGames = season.injuryGamesByPlayerId[playerId] ?? 0;
    const suspensionGames = season.suspensionGamesByPlayerId[playerId] ?? 0;
    if (injuryGames > 0) return `Injured · ${injuryGames} match${injuryGames === 1 ? "" : "es"} out`;
    if (suspensionGames > 0) return `Red card · ${suspensionGames} match${suspensionGames === 1 ? "" : "es"} out`;
    return "Unavailable";
  };
  const availableReplacementOptions = (starter: DraftPick) => {
    const selectedForStarter = human.substitutions[starter.player.i];
    return human.picks.filter(
      (pick) =>
        pick.target === "SUB" &&
        !unavailableIds.has(pick.player.i) &&
        (!usedSubIds.has(pick.player.i) || pick.player.i === selectedForStarter)
    );
  };
  const latestHumanResult = season.results
    .filter((result) => result.homeId === "human" || result.awayId === "human")
    .slice(-1)[0];
  const latestSummary = latestHumanResult
    ? {
        opponentId: latestHumanResult.homeId === "human" ? latestHumanResult.awayId : latestHumanResult.homeId,
        humanGoals: latestHumanResult.homeId === "human" ? latestHumanResult.homeGoals : latestHumanResult.awayGoals,
        opponentGoals: latestHumanResult.homeId === "human" ? latestHumanResult.awayGoals : latestHumanResult.homeGoals
      }
    : null;
  return (
    <div className="prematch-panel season-pregame">
      <div className="season-primary-action">
        <div>
          <span>Next up</span>
          <strong>{opponent?.displayName ?? "Opponent"}</strong>
          <small>{missingSubstitutions.length > 0 ? "Choose replacements to continue" : "Ready for the next fixture"}</small>
        </div>
        <button className="primary-button season-next-button" type="button" onClick={onStart} disabled={!canStart}>
          <Play size={18} />
          Next game
        </button>
      </div>

      {latestSummary && (
        <div className="season-last-result">
          <span>Last result</span>
          <strong>
            {latestSummary.humanGoals} – {latestSummary.opponentGoals}
          </strong>
          <small>{season.managers.find((manager) => manager.id === latestSummary.opponentId)?.displayName ?? latestSummary.opponentId}</small>
        </div>
      )}

      <div className="prematch-header">
        <div className="prematch-team">
          <span className="you-label">You</span>
          <strong>{humanStanding ? `${humanStanding.wins}-${humanStanding.draws}-${humanStanding.losses}` : "0-0-0"}</strong>
        </div>
        <span className="prematch-vs">v</span>
        <div className="prematch-team">
          <span>{opponent?.displayName ?? "Opponent"}</span>
          <strong>{opponent?.formationId ?? ""}</strong>
        </div>
      </div>
      <div className="prematch-stats">
        {oppStrength && (
          <div className="prematch-stat">
            <span>Opp OVR </span>{Math.round(oppStrength.overall)}
          </div>
        )}
        <div className="prematch-stat">
          <span>Talks </span>{remainingSeasonTeamTalks(season)}/2
        </div>
        <div className="prematch-stat">
          <span>Pts </span>{humanStanding?.points ?? 0}
        </div>
      </div>

      {decision?.trainingInjury && (
        <div className="season-event-card danger">
          <strong>Training injury</strong>
          <p>{decision.trainingInjury.playerName} is out for {decision.trainingInjury.games} game{decision.trainingInjury.games === 1 ? "" : "s"}.</p>
        </div>
      )}

      {unavailableStarters.length > 0 && (
        <div className="season-event-card danger season-sub-card">
          <strong>Selection required</strong>
          <p>Choose replacements before the next game. Injured and suspended players return automatically when their match counter reaches zero.</p>
          <div className="season-absence-list">
            {unavailableStarters.map((starter) => {
              const selectedSubId = human.substitutions[starter.player.i];
              const options = availableReplacementOptions(starter);
              return (
                <div className="season-absence-row" key={starter.player.i}>
                  <div>
                    <strong>{starter.player.n}</strong>
                    <span>{absenceLabel(starter.player.i)}</span>
                  </div>
                  <div className="sub-row">
                    {options.length === 0 ? (
                      <p className="fine-print">No available substitutes.</p>
                    ) : (
                      options.map((pick) => (
                        <button
                          key={pick.player.i}
                          className={`sub-option${selectedSubId === pick.player.i ? " assistant-pick" : ""}`}
                          type="button"
                          onClick={() => onChooseSub(starter.player.i, pick.player.i)}
                        >
                          <span className="sub-option-num">{pick.player.num}</span>
                          <span className="sub-option-name">{pick.player.n.split(/[\s.]+/).filter(Boolean).slice(-1)[0]}</span>
                          <span className="sub-option-pos">{pick.benchRole ?? pick.player.p[0]}</span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {missingSubstitutions.length > 0 && <p className="fine-print">Pick {missingSubstitutions.length} more replacement{missingSubstitutions.length === 1 ? "" : "s"} to unlock Next game.</p>}
        </div>
      )}

      {decision?.outOfForm && (
        <div className="season-event-card">
          <strong>Out of form</strong>
          <p>{decision.outOfForm.playerName} looks off the pace. Keep them in or bench them for one match.</p>
          <div className="sub-row">
            <button className={`sub-option${outOfFormChoice === "keep" ? " assistant-pick" : ""}`} type="button" onClick={onKeepOutOfForm}>
              <span className="sub-option-num">XI</span>
              <span className="sub-option-name">Keep</span>
              <span className="sub-option-pos">Risk</span>
            </button>
            {availableSubs.map((pick) => (
              <button
                key={pick.player.i}
                className={`sub-option${outOfFormSubId === pick.player.i ? " assistant-pick" : ""}`}
                type="button"
                onClick={() => onBenchOutOfForm(pick.player.i)}
              >
                <span className="sub-option-num">{pick.player.num}</span>
                <span className="sub-option-name">{pick.player.n.split(/[\s.]+/).filter(Boolean).slice(-1)[0]}</span>
                <span className="sub-option-pos">{pick.benchRole ?? pick.player.p[0]}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className={`season-event-card${teamTalkActive ? " active" : ""}`}>
        <strong>Team talk</strong>
        <p>
          {teamTalkActive
            ? "One-match boost active. It helps, but it will not force a win."
            : teamTalkAvailable
              ? `Available for the ${talkHalf === "first" ? "first" : "second"} half of the season. You get one team talk per half.`
              : `The ${talkHalf === "first" ? "first" : "second"}-half team talk has already been used.`}
        </p>
        <div className="match-actions inline-actions">
          <button className="secondary-button" type="button" onClick={onUseTeamTalk} disabled={teamTalkActive || !teamTalkAvailable}>
            <Sparkles size={16} />
            Use team talk
          </button>
          {teamTalkActive && (
            <button className="secondary-button" type="button" onClick={onSkipTeamTalk}>
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function SeasonResultsList({ season, managers }: { season: InvincibleSeason; managers: ManagerSquad[] }) {
  const latest = season.results
    .filter((result) => result.homeId === "human" || result.awayId === "human")
    .slice(-6)
    .reverse();
  const managerById = new Map(managers.map((manager) => [manager.id, manager]));
  return (
    <div className="season-results">
      <div className="panel-header compact-header">
        <div>
          <p className="eyebrow">Results</p>
          <h2>Latest scores</h2>
        </div>
      </div>
      {latest.length === 0 ? (
        <p className="muted">No season matches played yet.</p>
      ) : (
        <div className="table">
          {latest.map((result) => {
            const opponentId = result.homeId === "human" ? result.awayId : result.homeId;
            const humanGoals = result.homeId === "human" ? result.homeGoals : result.awayGoals;
            const opponentGoals = result.homeId === "human" ? result.awayGoals : result.homeGoals;
            const outcome = humanGoals > opponentGoals ? "W" : humanGoals === opponentGoals ? "D" : "L";
            return (
              <div className={`season-result-row outcome-${outcome.toLowerCase()}`} key={result.fixtureId}>
                <span>{outcome}</span>
                <strong>{humanGoals} – {opponentGoals}</strong>
                <small>{managerById.get(opponentId)?.displayName ?? opponentId}</small>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SeasonStatusPanel({ season }: { season: InvincibleSeason }) {
  const standings = computeStandings(season.managers, season.results);
  const human = standings.find((standing) => standing.managerId === "human");
  const injuries = Object.entries(season.injuryGamesByPlayerId).filter(([, games]) => games > 0);
  const suspensions = Object.entries(season.suspensionGamesByPlayerId).filter(([, games]) => games > 0);
  return (
    <div className="panel season-status-panel">
      <p className="eyebrow">Season status</p>
      <div className="season-stat-grid">
        <div>
          <span>Record</span>
          <strong>{human ? `${human.wins}-${human.draws}-${human.losses}` : "0-0-0"}</strong>
        </div>
        <div>
          <span>Unbeaten</span>
          <strong>{(human?.losses ?? 0) === 0 ? "Alive" : "Gone"}</strong>
        </div>
        <div>
          <span>Team talks</span>
          <strong>{remainingSeasonTeamTalks(season)}/2</strong>
        </div>
        <div>
          <span>Absences</span>
          <strong>{injuries.length + suspensions.length}</strong>
        </div>
      </div>
      <p className="fine-print">Official Invincible eligibility is hidden until the season ends.</p>
    </div>
  );
}

const VISIBLE_LEADERBOARD_ROWS = 15;

function LeaderboardsScreen({
  entries,
  period,
  setPeriod,
  copy
}: {
  entries: ReturnType<typeof aggregateLeaderboard>;
  period: Period;
  setPeriod: (period: Period) => void;
  copy: Copy;
}) {
  const visible = entries.slice(0, VISIBLE_LEADERBOARD_ROWS);
  const isPlayer = (entry: (typeof entries)[number]) => entry.kind === "human";
  const playerEntries = entries.filter(isPlayer);
  const playerBest = playerEntries.length
    ? playerEntries.reduce((best, entry) => (entry.rank < best.rank ? entry : best))
    : null;
  const playerVisible = playerBest ? playerBest.rank <= VISIBLE_LEADERBOARD_ROWS : false;
  const periodLabel = period[0].toUpperCase() + period.slice(1);

  return (
    <section className="leaderboards-screen">
      <div className="panel leaderboards-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">{copy.leaderboard}</p>
            <h2>{periodLabel} rankings</h2>
          </div>
          <Trophy size={22} />
        </div>

        <div className="segmented segmented-lg">
          {(["daily", "weekly", "monthly"] as Period[]).map((item) => (
            <button className={period === item ? "active" : ""} key={item} type="button" onClick={() => setPeriod(item)}>
              {copy[item]}
            </button>
          ))}
        </div>

        {playerBest && (
          <div className="your-rank-card">
            <div className="your-rank-badge">#{playerBest.rank}</div>
            <div className="your-rank-meta">
              <span>{copy.yourRank}</span>
              <strong>{playerBest.displayName}</strong>
            </div>
            <div className="your-rank-stats">
              <div><span>Pts</span><strong>{playerBest.matchPoints}</strong></div>
              <div><span>GD</span><strong>{playerBest.goalDifference}</strong></div>
              <div><span>GF</span><strong>{playerBest.goalsFor}</strong></div>
            </div>
          </div>
        )}

        {visible.length === 0 ? (
          <p className="muted leaderboard-empty">{copy.leaderboardEmpty}</p>
        ) : (
          <div className="table leaderboard-table">
            <div className="lb-row lb-head">
              <span>#</span>
              <span>Manager</span>
              <span>Pts</span>
              <span>GD</span>
              <span>GF</span>
            </div>
            {visible.map((entry) => (
              <div className={`lb-row${isPlayer(entry) ? " is-you" : ""}${entry.rank <= 3 ? ` podium p${entry.rank}` : ""}`} key={entry.id}>
                <span className="lb-rank">{entry.rank <= 3 ? ["🥇", "🥈", "🥉"][entry.rank - 1] : entry.rank}</span>
                <strong>{entry.displayName}{isPlayer(entry) ? <span className="you-tag">YOU</span> : null}</strong>
                <span>{entry.matchPoints}</span>
                <span>{entry.goalDifference}</span>
                <span>{entry.goalsFor}</span>
              </div>
            ))}
            {playerBest && !playerVisible && (
              <>
                <div className="lb-gap">···</div>
                <div className="lb-row is-you" key={`you-${playerBest.id}`}>
                  <span className="lb-rank">{playerBest.rank}</span>
                  <strong>{playerBest.displayName}<span className="you-tag">YOU</span></strong>
                  <span>{playerBest.matchPoints}</span>
                  <span>{playerBest.goalDifference}</span>
                  <span>{playerBest.goalsFor}</span>
                </div>
              </>
            )}
          </div>
        )}
        <p className="fine-print">Ranked by points, then goal difference, goals scored, titles and strength of schedule. Tables reset {period === "daily" ? "every day" : period === "weekly" ? "every Monday" : "on the 1st"}.</p>
      </div>
    </section>
  );
}

const PERSONAL_PERIODS: Period[] = ["daily", "weekly", "monthly"];

function PersonalProgressScreen({
  records,
  managerScore,
  completedLeagues,
  expertUnlocked
}: {
  records: LeaderboardRecord[];
  managerScore: number;
  completedLeagues: number;
  expertUnlocked: boolean;
}) {
  const personalRecords = records.filter((record) => record.kind === "human");
  const totalPoints = personalRecords.reduce((sum, record) => sum + record.matchPoints, 0);
  const totalGoalDifference = personalRecords.reduce((sum, record) => sum + record.goalDifference, 0);
  const totalGoalsFor = personalRecords.reduce((sum, record) => sum + record.goalsFor, 0);
  const totalTitles = personalRecords.reduce((sum, record) => sum + record.leagueTitles, 0);
  const averagePoints = personalRecords.length ? (totalPoints / personalRecords.length).toFixed(1) : "0.0";
  const bestPoints = bestRecordBy(personalRecords, (record) => record.matchPoints);
  const bestGoalDifference = bestRecordBy(personalRecords, (record) => record.goalDifference);
  const bestGoalsFor = bestRecordBy(personalRecords, (record) => record.goalsFor);
  const recentRuns = [...personalRecords]
    .sort((first, second) => new Date(second.completedAt).getTime() - new Date(first.completedAt).getTime())
    .slice(0, 5);
  const periodRanks = PERSONAL_PERIODS.map((period) => ({
    period,
    entry: aggregateLeaderboard([...demoLeaderboardRecords(), ...personalRecords], period).find((entry) => entry.kind === "human")
  }));

  return (
    <section className="personal-screen">
      <div className="panel personal-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Personal leaderboard</p>
            <h2>Your progress</h2>
          </div>
          <Activity size={22} />
        </div>

        <div className="personal-hero">
          <div>
            <span>Manager score</span>
            <strong>{managerScore}</strong>
            <p>{expertUnlocked ? "Expert drafting unlocked." : `${Math.max(0, EXPERT_SCORE_THRESHOLD - managerScore)} score to expert mode.`}</p>
          </div>
          <div>
            <span>Mini leagues</span>
            <strong>{completedLeagues}</strong>
            <p>{personalRecords.length} recorded run{personalRecords.length === 1 ? "" : "s"} in your history.</p>
          </div>
        </div>

        <div className="personal-stat-grid">
          <PersonalStat label="All-time points" value={totalPoints} />
          <PersonalStat label="Goal difference" value={signedNumber(totalGoalDifference)} />
          <PersonalStat label="Goals scored" value={totalGoalsFor} />
          <PersonalStat label="Titles" value={totalTitles} />
          <PersonalStat label="Average points" value={averagePoints} />
          <PersonalStat label="Best points" value={bestPoints?.matchPoints ?? "-"} />
        </div>

        <div className="personal-grid">
          <div className="personal-card">
            <p className="eyebrow">Best of all time</p>
            <div className="personal-best-grid">
              <PersonalBest label="Best run" value={bestPoints ? `${bestPoints.matchPoints} pts` : "-"} note={bestPoints ? formatShortDate(bestPoints.completedAt) : "No run yet"} />
              <PersonalBest label="Best GD" value={bestGoalDifference ? signedNumber(bestGoalDifference.goalDifference) : "-"} note={bestGoalDifference ? `${bestGoalDifference.matchPoints} pts` : "No run yet"} />
              <PersonalBest label="Most goals" value={bestGoalsFor?.goalsFor ?? "-"} note={bestGoalsFor ? `${bestGoalsFor.matchPoints} pts` : "No run yet"} />
              <PersonalBest label="Best finish" value={totalTitles > 0 ? `${totalTitles} title${totalTitles === 1 ? "" : "s"}` : "-"} note={totalTitles > 0 ? "Champion run recorded" : "No title yet"} />
            </div>
          </div>

          <div className="personal-card">
            <p className="eyebrow">Current ranks</p>
            <div className="period-rank-grid">
              {periodRanks.map(({ period, entry }) => (
                <div className="period-rank-row" key={period}>
                  <span>{period}</span>
                  {entry ? (
                    <>
                      <strong>#{entry.rank}</strong>
                      <small>{entry.matchPoints} pts / GD {signedNumber(entry.goalDifference)}</small>
                    </>
                  ) : (
                    <>
                      <strong>-</strong>
                      <small>No run in this period</small>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="personal-card">
          <p className="eyebrow">Recent runs</p>
          {recentRuns.length === 0 ? (
            <p className="muted personal-empty">Complete a mini league to start building your personal history.</p>
          ) : (
            <div className="recent-run-list">
              {recentRuns.map((record) => (
                <div className="recent-run-row" key={record.id}>
                  <strong>{record.matchPoints} pts</strong>
                  <span>GD {signedNumber(record.goalDifference)}</span>
                  <span>GF {record.goalsFor}</span>
                  <span>{record.leagueTitles ? "Title" : "Run"}</span>
                  <small>{formatShortDate(record.completedAt)}</small>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function PersonalStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function PersonalBest({ label, value, note }: { label: string; value: number | string; note: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}

function bestRecordBy(records: LeaderboardRecord[], score: (record: LeaderboardRecord) => number): LeaderboardRecord | null {
  return records.reduce<LeaderboardRecord | null>((best, record) => (!best || score(record) > score(best) ? record : best), null);
}

function signedNumber(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

function formatShortDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const MANAGER_MOOD: Record<string, { brow: string; mouth: string; arm: string }> = {
  ready: {
    brow: "M 42 21 L 49 21 M 51 21 L 58 21",
    mouth: "M 46 30 Q 50 31.5 54 30",
    arm: "manager-arm-ready"
  },
  thinking: {
    brow: "M 42 21.5 L 49 20 M 51 20 L 58 21.5",
    mouth: "M 47 30.5 L 53 30.5",
    arm: "manager-arm-think"
  },
  happy: {
    brow: "M 42 20 Q 45.5 18 49 20 M 51 20 Q 54.5 18 58 20",
    mouth: "M 45 29 Q 50 34.5 55 29",
    arm: "manager-arm-happy"
  },
  sad: {
    brow: "M 42 22 L 49 19 M 51 19 L 58 22",
    mouth: "M 45 31.5 Q 50 27 55 31.5",
    arm: "manager-arm-sad"
  }
};

function ManagerAvatar({
  mood = "ready",
  line,
  compact = false
}: {
  mood?: "ready" | "thinking" | "happy" | "sad";
  line: string;
  compact?: boolean;
}) {
  const config = MANAGER_MOOD[mood] ?? MANAGER_MOOD.ready;
  return (
    <div className={`manager-avatar${compact ? " compact" : ""}`}>
      <div className={`manager-figure ${config.arm}`}>
        <svg viewBox="0 0 100 120" width="76" height="92" role="img" aria-label="Team manager">
          {/* ground shadow */}
          <ellipse className="manager-shadow" cx="50" cy="116" rx="22" ry="3" fill="rgba(0,0,0,0.24)" />

          {/* legs + boots */}
          <rect x="39" y="83" width="9" height="24" rx="4" fill="#1c2226" />
          <rect x="52" y="83" width="9" height="24" rx="4" fill="#1c2226" />
          <rect x="36" y="103" width="15" height="7" rx="3" fill="#0c1112" />
          <rect x="49" y="103" width="15" height="7" rx="3" fill="#0c1112" />

          {/* tracksuit jacket */}
          <path d="M 34 42 Q 50 35 66 42 L 71 87 Q 50 95 29 87 Z" fill="#232b30" />
          {/* slim accent piping */}
          <path d="M 35.5 43 L 31 87 L 33.5 87 L 38 44 Z" fill="var(--accent)" />
          <path d="M 64.5 43 L 69 87 L 66.5 87 L 62 44 Z" fill="var(--accent)" />
          {/* zip */}
          <rect x="49" y="40" width="2" height="49" rx="1" fill="#11171a" />
          {/* collar */}
          <path d="M 42 40 L 50 47.5 L 58 40 L 55.5 37.5 L 50 42.5 L 44.5 37.5 Z" fill="var(--accent)" />

          {/* static arm holding tactics board */}
          <g>
            <path d="M 34 45 Q 23 51 22 63 L 31 66 Q 32 55 40 49 Z" fill="#232b30" />
            <circle cx="24" cy="67" r="5.5" fill="#e7c39c" />
            <g transform="rotate(-6 24 75)">
              <rect x="14" y="63" width="20" height="24" rx="2" fill="#e9e1cf" stroke="#9c8a6b" strokeWidth="1" />
              <line x1="17" y1="69" x2="31" y2="69" stroke="#a9986f" strokeWidth="1.4" />
              <line x1="17" y1="74" x2="31" y2="74" stroke="#a9986f" strokeWidth="1.4" />
              <line x1="17" y1="79" x2="27" y2="79" stroke="#a9986f" strokeWidth="1.4" />
            </g>
          </g>

          {/* animated arm */}
          <g className="manager-arm">
            <path d="M 66 45 Q 77 51 78 63 L 69 66 Q 68 55 61 49 Z" fill="#232b30" />
            <circle cx="76" cy="65" r="6" fill="#e7c39c" />
          </g>

          {/* neck + head */}
          <rect x="46" y="33" width="8" height="9" fill="#e7c39c" />
          <g className="manager-head">
            <circle cx="50" cy="24" r="12.5" fill="#f0d3ac" />
            {/* ears */}
            <circle cx="38.3" cy="25" r="2.2" fill="#e7c39c" />
            <circle cx="61.7" cy="25" r="2.2" fill="#e7c39c" />
            {/* hair */}
            <path d="M 37 23 Q 35 10 50 10 Q 65 10 63 23 Q 63 16.5 50 16.5 Q 37 16.5 37 23 Z" fill="#3a2e23" />
            {/* blush */}
            <ellipse cx="43" cy="28" rx="2.6" ry="1.5" fill="#e8a98b" opacity="0.5" />
            <ellipse cx="57" cy="28" rx="2.6" ry="1.5" fill="#e8a98b" opacity="0.5" />
            {/* eyes */}
            <g className="manager-eyes">
              <circle cx="45.5" cy="24" r="1.6" fill="#1c1c1c" />
              <circle cx="54.5" cy="24" r="1.6" fill="#1c1c1c" />
            </g>
            {/* brow + mouth (mood) */}
            <path d={config.brow} stroke="#3a2e23" strokeWidth="1.6" fill="none" strokeLinecap="round" />
            <path d={config.mouth} stroke="#9c5b3c" strokeWidth="1.4" fill="none" strokeLinecap="round" />
          </g>
        </svg>
      </div>
      <div className="manager-speech">
        <p>{line}</p>
      </div>
    </div>
  );
}
