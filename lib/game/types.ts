export type Position =
  | "GK"
  | "RB"
  | "RWB"
  | "CB"
  | "LB"
  | "LWB"
  | "CDM"
  | "CM"
  | "CAM"
  | "RM"
  | "LM"
  | "RW"
  | "LW"
  | "CF"
  | "ST";

export type DraftMode = "classic" | "expert";
export type ManagerKind = "human" | "reserve";
export type ManagerSource = "human" | "reserve" | "historical" | "snapshot";
export type Period = "daily" | "weekly" | "monthly";
export type BenchRole = "GK" | "DEF" | "MID" | "ATT";
export type PlayerBoostId = "talisman" | "playmaker" | "poacher" | "engine" | "stopper" | "sweeper_keeper";

export interface PlayerBoost {
  id: PlayerBoostId;
  label: string;
  description: string;
  ratingBonus: number;
}

export interface Player {
  i: number;
  n: string;
  p: Position[];
  o: number;
  a: number;
  num: number;
  pac: number;
  sho: number;
  pas: number;
  dri: number;
  def: number;
  phy: number;
}

export interface TeamMeta {
  name: string;
  badge: string;
}

export interface RawFootballData {
  teams: Record<string, TeamMeta>;
  years: number[];
  combos: [string, number][];
  squads: Record<string, Player[]>;
}

export interface FormationSlot {
  id: string;
  label: string;
  target: Position | "SUB";
  line: "keeper" | "defense" | "midfield" | "attack" | "bench";
  benchRole?: BenchRole;
}

export interface Formation {
  id: string;
  name: string;
  slots: FormationSlot[];
}

export interface DraftPick {
  slotId: string;
  slotLabel: string;
  target: Position | "SUB";
  line: FormationSlot["line"];
  benchRole?: BenchRole;
  roleTarget?: Position;
  teamCode: string;
  teamName: string;
  year: number;
  player: Player;
  fit: number;
  baseEffectiveRating: number;
  effectiveRating: number;
  boost?: PlayerBoost;
  boostActive: boolean;
}

export interface SpinResult {
  teamCode: string;
  teamName: string;
  year: number;
  slot: FormationSlot;
  openSlots: FormationSlot[];
  candidates: DraftCandidate[];
  redraws: number;
}

export interface DraftSlotOption {
  slotId: string;
  slotLabel: string;
  target: Position | "SUB";
  line: FormationSlot["line"];
  benchRole?: BenchRole;
  roleTarget?: Position;
  fit: number;
  effectiveRating: number;
}

export interface DraftCandidate {
  player: Player;
  fit: number;
  effectiveRating: number;
  slotOptions: DraftSlotOption[];
  boost?: PlayerBoost;
}

export interface ManagerSquad {
  id: string;
  displayName: string;
  kind: ManagerKind;
  source?: ManagerSource;
  formationId: string;
  mode: DraftMode;
  picks: DraftPick[];
  mmr: number;
  /** Inherent manager quality (from the chosen real-world manager's finish); drives a slight sim edge. */
  managerRating: number;
  completedLeagues: number;
  injuredPlayerIds: number[];
  suspendedPlayerIds: number[];
  /** injuredPlayerId → substitutePlayerId chosen by the user */
  substitutions: Record<number, number>;
}

export interface Fixture {
  id: string;
  round: number;
  homeId: string;
  awayId: string;
}

export type SeasonCasualtyKind = "injury" | "redCard";

/**
 * Directs simulateFixture to force one specific casualty on a side instead of the default random
 * rolls. Used by the Be Invincible season to spend its whole-season casualty budget deterministically
 * while still letting the victim be chosen with weighted randomness.
 */
export interface CasualtyDirective {
  kind: SeasonCasualtyKind;
  /** playerId → relative likelihood of being the one who goes off. Missing players default to weight 1. */
  weightByPlayerId?: Record<number, number>;
}

export type MatchEventCode =
  | "kickoff"
  | "chance"
  | "goal"
  | "save"
  | "injury"
  | "substitution"
  | "red_card"
  | "near_miss"
  | "half_time"
  | "full_time";

export interface MatchEvent {
  id: string;
  second: number;
  code: MatchEventCode;
  teamId?: string;
  playerId?: number;
  playerName?: string;
  params: Record<string, string | number>;
}

export interface FixtureResult {
  fixtureId: string;
  round: number;
  homeId: string;
  awayId: string;
  homeGoals: number;
  awayGoals: number;
  events: MatchEvent[];
  homeInjuries: number[];
  awayInjuries: number[];
  homeRedCards: number[];
  awayRedCards: number[];
  playedAt: string;
}

export interface Standing {
  managerId: string;
  displayName: string;
  kind: ManagerKind;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}

export interface LeaderboardRecord {
  id: string;
  userId: string;
  displayName: string;
  kind: ManagerKind;
  periodAt: string;
  matchPoints: number;
  goalDifference: number;
  goalsFor: number;
  leagueTitles: number;
  opponentStrength: number;
  completedAt: string;
}

export interface LeaderboardEntry extends LeaderboardRecord {
  rank: number;
}
