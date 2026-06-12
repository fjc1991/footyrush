"use client";

import { Activity, BarChart3, Gamepad2, HeartPulse, LogIn, Mail, Moon, Play, Shield, Shirt, Shuffle, Sun, Timer, Trophy, Users } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { en } from "@/lib/i18n/en";
import { FORMATION_LIST, getStarterSlots } from "@/lib/game/formations";
import { getNextDraftSlot, makeDraftPick } from "@/lib/game/draft";
import { loadFootballData, spinForSlot, getFootballData } from "@/lib/game/data";
import { MANAGER_POOL, managerRatingForPosition } from "@/lib/game/managers";
import { createMinileague } from "@/lib/game/matchmaking";
import { renderCommentary } from "@/lib/game/commentary";
import { aggregateLeaderboard, demoLeaderboardRecords, recordsFromLeague } from "@/lib/game/leaderboard";
import {
  EXPERT_SCORE_THRESHOLD,
  MAX_MANAGER_SCORE,
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
type Theme = "dark" | "light";
type Phase = "setup" | "draft" | "league" | "complete";
type MainView = "play" | "leaderboards";

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

const profileKey = "footyrush.profile";
const recordsKey = "footyrush.leaderboardRecords";
const localGuestKey = "footyrush.guestPlayed";
const managerScoreKey = "footyrush.mmr";
const managerKey = "footyrush.manager";
const completedLeaguesKey = "footyrush.completedLeagues";
const expertUnlockedKey = "footyrush.expertUnlocked";
const TESTING_MODE = process.env.NEXT_PUBLIC_TESTING_MODE === "true";

export default function FootyRushApp({ copy, locale }: { copy: Copy; locale: string }) {
  const [theme, setTheme] = useState<Theme>("dark");
  const [view, setView] = useState<MainView>("play");
  const [phase, setPhase] = useState<Phase>("setup");
  const [formationId, setFormationId] = useState("4-3-3");
  const [picks, setPicks] = useState<DraftPick[]>([]);
  const [spin, setSpin] = useState<SpinResult | null>(null);
  const [profile, setProfile] = useState<LocalProfile | null>(null);
  const [guestStatus, setGuestStatus] = useState<GuestStatus>({ allowed: true, played: false });
  const [showAuthGate, setShowAuthGate] = useState(false);
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
  const [dataReady, setDataReady] = useState(false);
  const [dataError, setDataError] = useState(false);
  const [managerScore, setManagerScore] = useState(STARTING_MANAGER_SCORE);
  const [selectedManager, setSelectedManager] = useState<SelectedManager | null>(null);
  const [completedLeagues, setCompletedLeagues] = useState(0);
  const [expertUnlockedEarned, setExpertUnlockedEarned] = useState(false);
  const [lastScoreDelta, setLastScoreDelta] = useState<number | null>(null);
  const [expertUnlockedThisRun, setExpertUnlockedThisRun] = useState(false);
  const [matchSpeed, setMatchSpeed] = useState<1 | 2 | 4>(1);
  const [scoreFlashing, setScoreFlashing] = useState(false);
  const [lastFlashedGoalCount, setLastFlashedGoalCount] = useState(0);
  const [roundSummaryData, setRoundSummaryData] = useState<{ round: number; fixtures: FixtureResult[]; managers: ManagerSquad[] } | null>(null);

  const nextSlot = useMemo(() => getNextDraftSlot(formationId, picks), [formationId, picks]);
  const draftComplete = picks.length === 16;
  const usedPlayerIds = useMemo(() => new Set(picks.map((pick) => pick.player.i)), [picks]);
  const standings = useMemo(() => (league ? computeStandings(league.managers, league.results) : []), [league]);
  const currentRoundFixtures = league?.rounds[league.currentRound] ?? [];
  const currentHumanFixture = currentRoundFixtures.find((fixture) => fixture.homeId === "human" || fixture.awayId === "human");
  const managerById = useMemo(() => new Map(league?.managers.map((manager) => [manager.id, manager]) ?? []), [league]);
  const visibleEvents = useMemo(
    () => currentResult?.events.filter((event) => event.second <= liveSecond) ?? [],
    [currentResult, liveSecond]
  );
  // Live score = goals that have actually happened by the current minute, not the final result.
  const liveHomeGoals = visibleEvents.filter((event) => event.code === "goal" && event.teamId === currentHumanFixture?.homeId).length;
  const liveAwayGoals = visibleEvents.filter((event) => event.code === "goal" && event.teamId === currentHumanFixture?.awayId).length;
  const leaderboard = useMemo(
    () => aggregateLeaderboard([...demoLeaderboardRecords(), ...leaderboardRecords], leaderboardPeriod),
    [leaderboardPeriod, leaderboardRecords]
  );
  const expertUnlocked = hasExpertAccess(managerScore, expertUnlockedEarned);
  const draftMode: DraftMode = expertUnlocked ? "expert" : "classic";
  const draftStatus = phase === "complete" ? "Complete" : `${picks.length}/16`;
  const leagueStatus = phase === "complete" ? "Complete" : league ? `Round ${Math.min(league.currentRound + 1, 5)}/5` : "Not joined";
  const humanStanding = standings.find((standing) => standing.managerId === "human");
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
    const storedTheme = window.localStorage.getItem("footyrush.theme") as Theme | null;
    const nextTheme = storedTheme === "light" || storedTheme === "dark" ? storedTheme : "dark";
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;

    const storedProfile = window.localStorage.getItem(profileKey);
    if (storedProfile) {
      setProfile(JSON.parse(storedProfile) as LocalProfile);
    }

    const storedRecords = window.localStorage.getItem(recordsKey);
    if (storedRecords) {
      setLeaderboardRecords(JSON.parse(storedRecords) as LeaderboardRecord[]);
    }

    const storedManager = window.localStorage.getItem(managerKey);
    let parsedManager = storedManager ? (JSON.parse(storedManager) as SelectedManager) : null;
    // Migration: discard data from the old 1000-centred scale (ratings were ~700–1300) so
    // returning testers re-appoint a manager on the new 0–100 scale instead of seeing stale numbers.
    if (parsedManager && parsedManager.rating > MAX_MANAGER_SCORE) {
      parsedManager = null;
      window.localStorage.removeItem(managerKey);
      window.localStorage.removeItem(managerScoreKey);
    }
    if (parsedManager) {
      setSelectedManager(parsedManager);
    }
    const storedScoreRaw = window.localStorage.getItem(managerScoreKey);
    let storedManagerScore = storedScoreRaw !== null ? Number(storedScoreRaw) : parsedManager?.rating ?? STARTING_MANAGER_SCORE;
    if (storedManagerScore > MAX_MANAGER_SCORE) {
      storedManagerScore = parsedManager?.rating ?? STARTING_MANAGER_SCORE;
    }
    setManagerScore(storedManagerScore);
    setCompletedLeagues(Number(window.localStorage.getItem(completedLeaguesKey) ?? 0));
    setExpertUnlockedEarned(window.localStorage.getItem(expertUnlockedKey) === "true" || isExpertUnlocked(storedManagerScore));

    fetch("/api/guest-plays")
      .then((response) => response.json())
      .then((status: GuestStatus) => {
        const localPlayed = window.localStorage.getItem(localGuestKey) === "true";
        setGuestStatus(localPlayed ? { allowed: false, played: true } : status);
      })
      .catch(() => undefined);

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
      // The admin testing account always starts from zero.
      if (admin) {
        resetToNewUser();
      }
    };

    supabase.auth.getSession().then(({ data }) => applySession(data.session));
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => applySession(session));
    return () => authListener.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("footyrush.theme", theme);
  }, [theme]);

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
  }

  // Wipe all local progress back to a brand-new-user state. Used by the admin testing
  // account, which resets on every load so the new-user experience can be replayed endlessly.
  function resetToNewUser() {
    window.localStorage.removeItem(recordsKey);
    window.localStorage.removeItem(managerScoreKey);
    window.localStorage.removeItem(completedLeaguesKey);
    window.localStorage.removeItem(expertUnlockedKey);
    window.localStorage.removeItem(localGuestKey);
    window.localStorage.removeItem(managerKey);
    setLeaderboardRecords([]);
    setManagerScore(STARTING_MANAGER_SCORE);
    setSelectedManager(null);
    setCompletedLeagues(0);
    setExpertUnlockedEarned(false);
    setExpertUnlockedThisRun(false);
    setLastScoreDelta(null);
    setGuestStatus({ allowed: true, played: false });
    resetDraft("setup");
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
    setExpertUnlockedThisRun(false);
    setPhase(nextPhase);
  }

  function startDraft() {
    resetDraft("draft");
  }

  function spinRound() {
    if (!nextSlot || spinning) {
      return;
    }
    setSpin(null);
    setSpinning(true);
    const seed = `${Date.now()}:${picks.length}:${formationId}`;
    window.setTimeout(() => {
      setSpin(spinForSlot(nextSlot, usedPlayerIds, seed));
      setSpinning(false);
    }, 650);
  }

  function queueSpinForSlot(slot: FormationSlot, nextPicks: DraftPick[]) {
    setSpin(null);
    setSpinning(true);
    const nextUsedPlayerIds = new Set(nextPicks.map((pick) => pick.player.i));
    const seed = `${Date.now()}:${nextPicks.length}:${formationId}`;
    window.setTimeout(() => {
      setSpin(spinForSlot(slot, nextUsedPlayerIds, seed));
      setSpinning(false);
    }, 500);
  }

  function handleSubSelection(injuredPlayerId: number, subPlayerId: number, subName: string) {
    if (!league) return;
    const updatedManagers = applySubstitution(league.managers, injuredPlayerId, subPlayerId);
    setLeague({ ...league, managers: updatedManagers });
    setSelectedSub(subName);
  }

  function choosePlayer(candidateIndex: number) {
    if (!spin) {
      return;
    }
    const candidate = spin.candidates[candidateIndex];
    if (!candidate || usedPlayerIds.has(candidate.player.i)) {
      return;
    }

    const nextPick = makeDraftPick({
      slot: spin.slot,
      teamCode: spin.teamCode,
      teamName: spin.teamName,
      year: spin.year,
      candidate
    });
    const nextPicks = [...picks, nextPick];
    setPicks(nextPicks);
    const upcomingSlot = getNextDraftSlot(formationId, nextPicks);
    if (upcomingSlot) {
      queueSpinForSlot(upcomingSlot, nextPicks);
    } else {
      setSpin(null);
    }
  }

  function canEnterLeague(): boolean {
    return TESTING_MODE || Boolean(profile || guestStatus.allowed);
  }

  function enterLeague() {
    if (!draftComplete) {
      return;
    }
    if (!canEnterLeague()) {
      setShowAuthGate(true);
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
      const nextScore = Math.min(MAX_MANAGER_SCORE, Math.max(MIN_MANAGER_SCORE, currentScore + delta));
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
    // onAuthStateChange applies the profile (and admin reset). Clear the password field.
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

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark">FR</div>
          <div>
            <p className="eyebrow">{copy.appName}</p>
            <h1>{copy.tagline}</h1>
          </div>
        </div>
        <div className="topbar-actions">
          <div className="lang-switcher">
            {(["en", "es", "fr", "pt"] as const).map((lang) => (
              <a
                key={lang}
                href={`/${lang}`}
                className={`lang-btn${locale === lang ? " active" : ""}`}
                aria-label={lang.toUpperCase()}
              >
                {lang.toUpperCase()}
              </a>
            ))}
          </div>
          <button className="icon-button" type="button" aria-label="Toggle theme" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button className="profile-pill" type="button" onClick={() => setShowAuthGate(true)}>
            <LogIn size={16} />
            <span>{profile?.displayName ?? "Sign in"}</span>
          </button>
        </div>
      </header>

      <section className="status-strip" aria-label="Game status">
        <div>
          <span>Draft</span>
          <strong>{draftStatus}</strong>
        </div>
        <div>
          <span>League</span>
          <strong>{leagueStatus}</strong>
        </div>
        <div>
          <span>Score</span>
          <strong>{selectedManager ? managerScore : "—"}</strong>
        </div>
        <div>
          <span>Draft level</span>
          <strong>{expertUnlocked ? "Expert" : "Assisted"}</strong>
        </div>
      </section>

      <nav className="main-tabs" aria-label="Primary">
        <button
          type="button"
          className={`tab-button${view === "play" ? " active" : ""}`}
          onClick={() => setView("play")}
        >
          <Gamepad2 size={17} />
          {copy.tabPlay}
        </button>
        <button
          type="button"
          className={`tab-button${view === "leaderboards" ? " active" : ""}`}
          onClick={() => !isPlaying && setView("leaderboards")}
          disabled={isPlaying}
          title={isPlaying ? copy.tabLockedHint : undefined}
        >
          <BarChart3 size={17} />
          {copy.tabLeaderboards}
          {isPlaying && <span className="tab-lock">· {copy.tabLive}</span>}
        </button>
      </nav>

      {view === "leaderboards" && (
        <LeaderboardsScreen
          entries={leaderboard}
          period={leaderboardPeriod}
          setPeriod={setLeaderboardPeriod}
          copy={copy}
        />
      )}

      {view === "play" && phase === "setup" && (
        <section className="layout-grid setup-grid">
          <div className="panel intro-panel">
            <p className="eyebrow">{copy.setupTitle}</p>
            <h2>Draft fast, then manage the damage.</h2>
            <p>{copy.setupCopy}</p>

            <div className="manager-pick">
              {selectedManager ? (
                <>
                  <div className="manager-pick-head">
                    <p className="eyebrow">Your manager</p>
                    <span className="manager-pick-rating">{selectedManager.rating}</span>
                  </div>
                  <strong className="manager-pick-name">{selectedManager.manager}</strong>
                  <span className="manager-pick-club">
                    {selectedManager.teamName} {selectedManager.year} · finished {ordinal(selectedManager.position)}
                  </span>
                  <button className="secondary-button wide" type="button" onClick={shuffleManager}>
                    <Shuffle size={16} />
                    Re-shuffle manager
                  </button>
                </>
              ) : (
                <>
                  <p className="eyebrow">Appoint your manager</p>
                  <p className="manager-pick-prompt">
                    Shuffle to draw a real manager. Their league finish sets your starting score and a slight match-day edge.
                  </p>
                  <button className="primary-button wide" type="button" onClick={shuffleManager}>
                    <Shuffle size={16} />
                    Shuffle manager
                  </button>
                </>
              )}
            </div>

            {selectedManager && (
              <ProgressionPanel
                score={managerScore}
                completedLeagues={completedLeagues}
                expertUnlocked={expertUnlocked}
              />
            )}
            <button className="primary-button" type="button" onClick={startDraft} disabled={!selectedManager}>
              <Play size={18} />
              {copy.startDraft}
            </button>
          </div>

          <div className="panel formation-panel">
            <p className="eyebrow">Formation</p>
            <div className="formation-grid">
              {FORMATION_LIST.map((formation) => (
                <button
                  key={formation.id}
                  type="button"
                  className={formationId === formation.id ? "formation-button active" : "formation-button"}
                  onClick={() => setFormationId(formation.id)}
                >
                  <FormationGlyph formationId={formation.id} />
                  <span>{formation.name}</span>
                </button>
              ))}
            </div>
            <ManagerAvatar
              mood="ready"
              line="Pick your shape, gaffer. We'll draft the bodies to fit it."
            />
          </div>
        </section>
      )}

      {view === "play" && phase === "draft" && (
        <section className="draft-layout">
          <div className="panel draft-board">
            <div className="panel-header">
              <div>
                <p className="eyebrow">
                  {copy.draftRound} {Math.min(picks.length + 1, 16)} / 16
                </p>
                <h2>{nextSlot ? `Fill ${nextSlot.label}` : "Squad complete"}</h2>
              </div>
              {dataError ? (
                <button className="secondary-button" type="button" onClick={loadData}>
                  <Shuffle size={17} />
                  Data failed to load — retry
                </button>
              ) : (
                <button className="secondary-button" type="button" onClick={spinRound} disabled={!nextSlot || spinning || !dataReady}>
                  <Shuffle size={17} className={spinning ? "spin-icon" : ""} />
                  {!dataReady ? "Loading…" : spinning ? "Drawing…" : copy.spin}
                </button>
              )}
            </div>

            {spin ? (
              <div className="spin-result">
                <div className="draw-ticket">
                  <span>TEAM</span>
                  <strong>{spin.teamCode}</strong>
                  <span>YEAR</span>
                  <strong>{spin.year}</strong>
                  <small>{spin.teamName}</small>
                </div>
                <div className="candidate-grid">
                  {spin.candidates.map((candidate, index) => {
                    const fitLabel = candidate.fit >= 1 ? "perfect" : candidate.fit >= 0.9 ? "good" : "okay";
                    const fitText = candidate.fit >= 1 ? "■ Perfect" : candidate.fit >= 0.9 ? "▲ Good fit" : "● Okay";
                    const cardFitClass = draftMode === "classic" ? ` ${fitLabel}` : "";
                    return (
                      <button className={`player-card fm-card${cardFitClass}`} key={candidate.player.i} type="button" onClick={() => choosePlayer(index)}>
                        <div className="fm-card-top">
                          <span className="card-pos">{spin.slot.label}</span>
                          {draftMode === "classic" ? (
                            <span className="card-ovr">{Math.round(candidate.effectiveRating)}</span>
                          ) : (
                            <span className="card-ovr hidden">?</span>
                          )}
                        </div>
                        <span className="shirt">#{candidate.player.num}</span>
                        <strong>{candidate.player.n}</strong>
                        <span className="card-positions">{candidate.player.p.join(" / ")}</span>
                        {draftMode === "classic" ? (
                          <>
                            <span className={`fit-badge ${fitLabel}`}>{fitText}</span>
                            <div className="ovr-bar-wrap">
                              <div className="ovr-bar-fill" style={{ width: `${Math.round(candidate.effectiveRating)}%` }} />
                            </div>
                            <div className="stat-row">
                              <span>PAC {candidate.player.pac}</span>
                              <span>SHO {candidate.player.sho}</span>
                              <span>PAS {candidate.player.pas}</span>
                              <span>DEF {candidate.player.def}</span>
                            </div>
                          </>
                        ) : (
                          <div className="hidden-stats">Stats hidden</div>
                        )}
                        <span className="team-chip">{spin.teamCode} &apos;{String(spin.year).slice(2)}</span>
                      </button>
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
                  <p>Spin a club-season draw for the next open slot.</p>
                </div>
              </div>
            )}

            <ManagerAvatar
              mood={draftComplete ? "happy" : "thinking"}
              line={
                draftComplete
                  ? "That's a squad I can work with. Take us to the league."
                  : nextSlot
                    ? `Need a ${nextSlot.label} next. Spin the draw and I'll size up the options.`
                    : "Spin the draw and let's see who turns up."
              }
            />

            {draftComplete && (
              <button className="primary-button wide" type="button" onClick={enterLeague}>
                <Users size={18} />
                {copy.enterLeague}
              </button>
            )}
          </div>

          <SquadPanel picks={picks} formationId={formationId} mode={draftMode} />
        </section>
      )}

      {view === "play" && phase === "league" && league && (
        <section className="league-layout matchday">
          <div className="panel match-panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Minileague · {league.skillBand}</p>
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
                <div className="commentary-log" aria-live="polite">
                  {visibleEvents.map((event) => (
                    <div
                      className={`commentary-line${event.code === "goal" ? " goal-flash" : event.code === "red_card" ? " red-flash" : ""}`}
                      key={event.id}
                    >
                      <span>{event.second}&apos;</span>
                      <p>{renderCommentary(event, locale)}</p>
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
              <button className="secondary-button" type="button" onClick={() => setView("leaderboards")}>
                <BarChart3 size={18} />
                View leaderboards
              </button>
            </div>
            <ManagerAvatar
              mood={
                humanStanding && humanStanding.points >= 8
                  ? "happy"
                  : humanStanding && humanStanding.points <= 3
                    ? "sad"
                    : "thinking"
              }
              line={
                humanStanding && humanStanding.points >= 8
                  ? "Top work out there. The board's noticed — check the tables."
                  : humanStanding && humanStanding.points <= 3
                    ? "Tough window. The board wants answers — let's go again."
                    : "We live to fight another window. Reload and go again."
              }
            />
          </div>
          <StandingsPanel standings={standings} />
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
                  {isAdmin ? " Admin testing mode — your progress resets to a brand-new user on every load." : ""}
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
  const strength = picks.length === 16
    ? calculateSquadStrength({
        id: "preview",
        displayName: "Preview",
        kind: "human",
        formationId,
        mode,
        picks,
        mmr: STARTING_MANAGER_SCORE,
        managerRating: STARTING_MANAGER_SCORE,
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
                title={`${pick.player.n} · ${pick.target} · ${pick.teamCode} '${String(pick.year).slice(2)}`}
              >
                <span className={tokenClass}>
                  <Shirt size={34} strokeWidth={1.5} className="kit-icon" />
                  <span className="kit-num">{pick.player.num}</span>
                  {isInjured && <span className="token-flag injury">＋</span>}
                  {isSuspended && <span className="token-flag susp">▌</span>}
                </span>
                <span className="pitch-name">{lastName}</span>
                <span className="pitch-pos">{pick.target}</span>
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
        <span>{home?.kind === "reserve" ? "Reserve" : "You"}</span>
        <strong>{home?.displayName}</strong>
      </div>
      <div className={`score${flashing ? " flashing" : ""}`}>
        {started ? `${homeGoals} – ${awayGoals}` : "v"}
      </div>
      <div>
        <span>{away?.kind === "reserve" ? "Reserve" : "You"}</span>
        <strong>{away?.displayName}</strong>
      </div>
    </div>
  );
}

function StandingsPanel({ standings }: { standings: ReturnType<typeof computeStandings> }) {
  return (
    <div className="panel table-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Minileague</p>
          <h2>Standings</h2>
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

function ManagerAvatar({ mood = "ready", line }: { mood?: "ready" | "thinking" | "happy" | "sad"; line: string }) {
  const config = MANAGER_MOOD[mood] ?? MANAGER_MOOD.ready;
  return (
    <div className="manager-avatar">
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
