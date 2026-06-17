import { clamp } from "./rng";
import type { Player, PlayerBoost, Position } from "./types";

export const BOOST_LIMIT = 2;

export const PLAYER_BOOSTS: Record<PlayerBoost["id"], PlayerBoost> = {
  talisman: {
    id: "talisman",
    label: "Talisman",
    description: "Elite all-round influence. Adds +3 to this player's role rating.",
    ratingBonus: 3
  },
  playmaker: {
    id: "playmaker",
    label: "Playmaker",
    description: "Creative passer. Adds +2 to this player's role rating.",
    ratingBonus: 2
  },
  poacher: {
    id: "poacher",
    label: "Poacher",
    description: "Box finisher. Adds +2 to this player's role rating.",
    ratingBonus: 2
  },
  engine: {
    id: "engine",
    label: "Engine",
    description: "High-energy runner. Adds +1 to this player's role rating.",
    ratingBonus: 1
  },
  stopper: {
    id: "stopper",
    label: "Stopper",
    description: "Dominant defender. Adds +2 to this player's role rating.",
    ratingBonus: 2
  },
  sweeper_keeper: {
    id: "sweeper_keeper",
    label: "Sweeper Keeper",
    description: "Reliable keeper profile. Adds +2 to this player's role rating.",
    ratingBonus: 2
  }
};

const attackingPositions: Position[] = ["ST", "CF", "LW", "RW"];
const midfieldPositions: Position[] = ["CDM", "CM", "CAM", "LM", "RM"];
const defensivePositions: Position[] = ["CB", "LB", "RB", "LWB", "RWB"];

function hasAny(player: Player, positions: Position[]): boolean {
  return player.p.some((position) => positions.includes(position));
}

export function getPlayerBoost(player: Player): PlayerBoost | undefined {
  if (player.o >= 90 || (player.o >= 88 && player.pas + player.sho + player.dri >= 250)) {
    return PLAYER_BOOSTS.talisman;
  }
  if (player.p.includes("GK") && player.def >= 84) {
    return PLAYER_BOOSTS.sweeper_keeper;
  }
  if (hasAny(player, attackingPositions) && player.sho >= 84) {
    return PLAYER_BOOSTS.poacher;
  }
  if (hasAny(player, midfieldPositions) && player.pas >= 84) {
    return PLAYER_BOOSTS.playmaker;
  }
  if (hasAny(player, defensivePositions) && player.def >= 84) {
    return PLAYER_BOOSTS.stopper;
  }
  if (hasAny(player, [...midfieldPositions, ...attackingPositions]) && player.pac >= 84 && player.phy >= 74) {
    return PLAYER_BOOSTS.engine;
  }
  return undefined;
}

export function applyBoostToRating(rating: number, boost?: PlayerBoost, active = false): number {
  return active && boost ? clamp(rating + boost.ratingBonus, 1, 99) : rating;
}
