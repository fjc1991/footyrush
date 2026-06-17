import type { BenchRole, Formation, FormationSlot, Position } from "./types";

const benchSlots: FormationSlot[] = [
  benchSlot("SUB_GK", "SUB GK", "GK"),
  benchSlot("SUB_DEF", "SUB DEF", "DEF"),
  benchSlot("SUB_MID1", "SUB MID 1", "MID"),
  benchSlot("SUB_MID2", "SUB MID 2", "MID"),
  benchSlot("SUB_ATT", "SUB ATT", "ATT")
];

function benchSlot(id: string, label: string, benchRole: BenchRole): FormationSlot {
  return { id, label, target: "SUB", line: "bench", benchRole };
}

function slot(id: string, target: Position, line: FormationSlot["line"]): FormationSlot {
  return { id, label: id, target, line };
}

export const FORMATIONS: Record<string, Formation> = {
  "4-3-3": {
    id: "4-3-3",
    name: "4-3-3",
    slots: [
      slot("GK", "GK", "keeper"),
      slot("LB", "LB", "defense"),
      slot("LCB", "CB", "defense"),
      slot("RCB", "CB", "defense"),
      slot("RB", "RB", "defense"),
      slot("LCM", "CM", "midfield"),
      slot("CM", "CM", "midfield"),
      slot("RCM", "CM", "midfield"),
      slot("LW", "LW", "attack"),
      slot("ST", "ST", "attack"),
      slot("RW", "RW", "attack")
    ]
  },
  "4-4-2": {
    id: "4-4-2",
    name: "4-4-2",
    slots: [
      slot("GK", "GK", "keeper"),
      slot("LB", "LB", "defense"),
      slot("LCB", "CB", "defense"),
      slot("RCB", "CB", "defense"),
      slot("RB", "RB", "defense"),
      slot("LM", "LM", "midfield"),
      slot("LCM", "CM", "midfield"),
      slot("RCM", "CM", "midfield"),
      slot("RM", "RM", "midfield"),
      slot("LST", "ST", "attack"),
      slot("RST", "ST", "attack")
    ]
  },
  "4-2-4": {
    id: "4-2-4",
    name: "4-2-4",
    slots: [
      slot("GK", "GK", "keeper"),
      slot("LB", "LB", "defense"),
      slot("LCB", "CB", "defense"),
      slot("RCB", "CB", "defense"),
      slot("RB", "RB", "defense"),
      slot("LCM", "CM", "midfield"),
      slot("RCM", "CM", "midfield"),
      slot("LW", "LW", "attack"),
      slot("LST", "ST", "attack"),
      slot("RST", "ST", "attack"),
      slot("RW", "RW", "attack")
    ]
  },
  "3-4-3": {
    id: "3-4-3",
    name: "3-4-3",
    slots: [
      slot("GK", "GK", "keeper"),
      slot("LCB", "CB", "defense"),
      slot("CB", "CB", "defense"),
      slot("RCB", "CB", "defense"),
      slot("LM", "LM", "midfield"),
      slot("LCM", "CM", "midfield"),
      slot("RCM", "CM", "midfield"),
      slot("RM", "RM", "midfield"),
      slot("LW", "LW", "attack"),
      slot("ST", "ST", "attack"),
      slot("RW", "RW", "attack")
    ]
  },
  "3-5-2": {
    id: "3-5-2",
    name: "3-5-2",
    slots: [
      slot("GK", "GK", "keeper"),
      slot("LCB", "CB", "defense"),
      slot("CB", "CB", "defense"),
      slot("RCB", "CB", "defense"),
      slot("LM", "LM", "midfield"),
      slot("LCM", "CM", "midfield"),
      slot("CAM", "CAM", "midfield"),
      slot("RCM", "CM", "midfield"),
      slot("RM", "RM", "midfield"),
      slot("LST", "ST", "attack"),
      slot("RST", "ST", "attack")
    ]
  },
  "5-3-2": {
    id: "5-3-2",
    name: "5-3-2",
    slots: [
      slot("GK", "GK", "keeper"),
      slot("LWB", "LWB", "defense"),
      slot("LCB", "CB", "defense"),
      slot("CB", "CB", "defense"),
      slot("RCB", "CB", "defense"),
      slot("RWB", "RWB", "defense"),
      slot("LCM", "CM", "midfield"),
      slot("CM", "CM", "midfield"),
      slot("RCM", "CM", "midfield"),
      slot("LST", "ST", "attack"),
      slot("RST", "ST", "attack")
    ]
  },
  "5-4-1": {
    id: "5-4-1",
    name: "5-4-1",
    slots: [
      slot("GK", "GK", "keeper"),
      slot("LWB", "LWB", "defense"),
      slot("LCB", "CB", "defense"),
      slot("CB", "CB", "defense"),
      slot("RCB", "CB", "defense"),
      slot("RWB", "RWB", "defense"),
      slot("LM", "LM", "midfield"),
      slot("LCM", "CM", "midfield"),
      slot("RCM", "CM", "midfield"),
      slot("RM", "RM", "midfield"),
      slot("ST", "ST", "attack")
    ]
  }
};

export const FORMATION_LIST = Object.values(FORMATIONS);

export function getFormationWithBench(formationId: string): Formation {
  const formation = FORMATIONS[formationId] ?? FORMATIONS["4-3-3"];
  return {
    ...formation,
    slots: [...formation.slots, ...benchSlots]
  };
}

export function getStarterSlots(formationId: string): FormationSlot[] {
  return FORMATIONS[formationId]?.slots ?? FORMATIONS["4-3-3"].slots;
}
