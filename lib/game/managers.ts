// Pilot manager pool — Premier League seasons 2019-20 (year 2020) through 2025-26 (year 2026).
//
// Each entry is a club's START-OF-SEASON manager plus the club's FINAL league position that
// season. Compiled from public records (Premier League / Wikipedia). The 2025-26 data is
// verified against premierleague.com; earlier seasons are from well-known historical records.
// This is reference data — spot-check / edit freely; nothing else depends on the names.
//
// The manager's rating is derived from finishing position (see managerRatingForPosition):
// 1st ≈ 1300, mid-table ≈ 1000, 20th ≈ 700. Selecting a manager sets the player's starting
// manager score and grants a slight simulation edge.

export interface ManagerEntry {
  teamCode: string;
  year: number;
  manager: string;
  /** Final league position that season, 1 (champions) … 20 (bottom). */
  position: number;
}

export const MANAGER_POOL: ManagerEntry[] = [
  // ── 2019-20 (year 2020) ──────────────────────────────
  { teamCode: "LIV", year: 2020, manager: "Jürgen Klopp", position: 1 },
  { teamCode: "MCI", year: 2020, manager: "Pep Guardiola", position: 2 },
  { teamCode: "MUN", year: 2020, manager: "Ole Gunnar Solskjær", position: 3 },
  { teamCode: "CHE", year: 2020, manager: "Frank Lampard", position: 4 },
  { teamCode: "LEI", year: 2020, manager: "Brendan Rodgers", position: 5 },
  { teamCode: "TOT", year: 2020, manager: "Mauricio Pochettino", position: 6 },
  { teamCode: "WOL", year: 2020, manager: "Nuno Espírito Santo", position: 7 },
  { teamCode: "ARS", year: 2020, manager: "Unai Emery", position: 8 },
  { teamCode: "SHU", year: 2020, manager: "Chris Wilder", position: 9 },
  { teamCode: "BUR", year: 2020, manager: "Sean Dyche", position: 10 },
  { teamCode: "SOU", year: 2020, manager: "Ralph Hasenhüttl", position: 11 },
  { teamCode: "EVE", year: 2020, manager: "Marco Silva", position: 12 },
  { teamCode: "NEW", year: 2020, manager: "Steve Bruce", position: 13 },
  { teamCode: "CRY", year: 2020, manager: "Roy Hodgson", position: 14 },
  { teamCode: "BHA", year: 2020, manager: "Graham Potter", position: 15 },
  { teamCode: "WHU", year: 2020, manager: "Manuel Pellegrini", position: 16 },
  { teamCode: "AVL", year: 2020, manager: "Dean Smith", position: 17 },
  { teamCode: "BOU", year: 2020, manager: "Eddie Howe", position: 18 },
  { teamCode: "WAT", year: 2020, manager: "Javi Gracia", position: 19 },
  { teamCode: "NOR", year: 2020, manager: "Daniel Farke", position: 20 },

  // ── 2020-21 (year 2021) ──────────────────────────────
  { teamCode: "MCI", year: 2021, manager: "Pep Guardiola", position: 1 },
  { teamCode: "MUN", year: 2021, manager: "Ole Gunnar Solskjær", position: 2 },
  { teamCode: "LIV", year: 2021, manager: "Jürgen Klopp", position: 3 },
  { teamCode: "CHE", year: 2021, manager: "Frank Lampard", position: 4 },
  { teamCode: "LEI", year: 2021, manager: "Brendan Rodgers", position: 5 },
  { teamCode: "WHU", year: 2021, manager: "David Moyes", position: 6 },
  { teamCode: "TOT", year: 2021, manager: "José Mourinho", position: 7 },
  { teamCode: "ARS", year: 2021, manager: "Mikel Arteta", position: 8 },
  { teamCode: "LEE", year: 2021, manager: "Marcelo Bielsa", position: 9 },
  { teamCode: "EVE", year: 2021, manager: "Carlo Ancelotti", position: 10 },
  { teamCode: "AVL", year: 2021, manager: "Dean Smith", position: 11 },
  { teamCode: "NEW", year: 2021, manager: "Steve Bruce", position: 12 },
  { teamCode: "WOL", year: 2021, manager: "Nuno Espírito Santo", position: 13 },
  { teamCode: "CRY", year: 2021, manager: "Roy Hodgson", position: 14 },
  { teamCode: "SOU", year: 2021, manager: "Ralph Hasenhüttl", position: 15 },
  { teamCode: "BHA", year: 2021, manager: "Graham Potter", position: 16 },
  { teamCode: "BUR", year: 2021, manager: "Sean Dyche", position: 17 },
  { teamCode: "FUL", year: 2021, manager: "Scott Parker", position: 18 },
  { teamCode: "WBA", year: 2021, manager: "Slaven Bilić", position: 19 },
  { teamCode: "SHU", year: 2021, manager: "Chris Wilder", position: 20 },

  // ── 2021-22 (year 2022) ──────────────────────────────
  { teamCode: "MCI", year: 2022, manager: "Pep Guardiola", position: 1 },
  { teamCode: "LIV", year: 2022, manager: "Jürgen Klopp", position: 2 },
  { teamCode: "CHE", year: 2022, manager: "Thomas Tuchel", position: 3 },
  { teamCode: "TOT", year: 2022, manager: "Nuno Espírito Santo", position: 4 },
  { teamCode: "ARS", year: 2022, manager: "Mikel Arteta", position: 5 },
  { teamCode: "MUN", year: 2022, manager: "Ole Gunnar Solskjær", position: 6 },
  { teamCode: "WHU", year: 2022, manager: "David Moyes", position: 7 },
  { teamCode: "LEI", year: 2022, manager: "Brendan Rodgers", position: 8 },
  { teamCode: "BHA", year: 2022, manager: "Graham Potter", position: 9 },
  { teamCode: "WOL", year: 2022, manager: "Bruno Lage", position: 10 },
  { teamCode: "NEW", year: 2022, manager: "Steve Bruce", position: 11 },
  { teamCode: "CRY", year: 2022, manager: "Patrick Vieira", position: 12 },
  { teamCode: "BRE", year: 2022, manager: "Thomas Frank", position: 13 },
  { teamCode: "AVL", year: 2022, manager: "Dean Smith", position: 14 },
  { teamCode: "SOU", year: 2022, manager: "Ralph Hasenhüttl", position: 15 },
  { teamCode: "EVE", year: 2022, manager: "Rafael Benítez", position: 16 },
  { teamCode: "LEE", year: 2022, manager: "Marcelo Bielsa", position: 17 },
  { teamCode: "BUR", year: 2022, manager: "Sean Dyche", position: 18 },
  { teamCode: "WAT", year: 2022, manager: "Xisco Muñoz", position: 19 },
  { teamCode: "NOR", year: 2022, manager: "Daniel Farke", position: 20 },

  // ── 2022-23 (year 2023) ──────────────────────────────
  { teamCode: "MCI", year: 2023, manager: "Pep Guardiola", position: 1 },
  { teamCode: "ARS", year: 2023, manager: "Mikel Arteta", position: 2 },
  { teamCode: "MUN", year: 2023, manager: "Erik ten Hag", position: 3 },
  { teamCode: "NEW", year: 2023, manager: "Eddie Howe", position: 4 },
  { teamCode: "LIV", year: 2023, manager: "Jürgen Klopp", position: 5 },
  { teamCode: "BHA", year: 2023, manager: "Graham Potter", position: 6 },
  { teamCode: "AVL", year: 2023, manager: "Steven Gerrard", position: 7 },
  { teamCode: "TOT", year: 2023, manager: "Antonio Conte", position: 8 },
  { teamCode: "BRE", year: 2023, manager: "Thomas Frank", position: 9 },
  { teamCode: "FUL", year: 2023, manager: "Marco Silva", position: 10 },
  { teamCode: "CRY", year: 2023, manager: "Patrick Vieira", position: 11 },
  { teamCode: "CHE", year: 2023, manager: "Thomas Tuchel", position: 12 },
  { teamCode: "WOL", year: 2023, manager: "Bruno Lage", position: 13 },
  { teamCode: "WHU", year: 2023, manager: "David Moyes", position: 14 },
  { teamCode: "BOU", year: 2023, manager: "Scott Parker", position: 15 },
  { teamCode: "NFO", year: 2023, manager: "Steve Cooper", position: 16 },
  { teamCode: "EVE", year: 2023, manager: "Frank Lampard", position: 17 },
  { teamCode: "LEI", year: 2023, manager: "Brendan Rodgers", position: 18 },
  { teamCode: "LEE", year: 2023, manager: "Jesse Marsch", position: 19 },
  { teamCode: "SOU", year: 2023, manager: "Ralph Hasenhüttl", position: 20 },

  // ── 2023-24 (year 2024) ──────────────────────────────
  { teamCode: "MCI", year: 2024, manager: "Pep Guardiola", position: 1 },
  { teamCode: "ARS", year: 2024, manager: "Mikel Arteta", position: 2 },
  { teamCode: "LIV", year: 2024, manager: "Jürgen Klopp", position: 3 },
  { teamCode: "AVL", year: 2024, manager: "Unai Emery", position: 4 },
  { teamCode: "TOT", year: 2024, manager: "Ange Postecoglou", position: 5 },
  { teamCode: "CHE", year: 2024, manager: "Mauricio Pochettino", position: 6 },
  { teamCode: "NEW", year: 2024, manager: "Eddie Howe", position: 7 },
  { teamCode: "MUN", year: 2024, manager: "Erik ten Hag", position: 8 },
  { teamCode: "WHU", year: 2024, manager: "David Moyes", position: 9 },
  { teamCode: "CRY", year: 2024, manager: "Roy Hodgson", position: 10 },
  { teamCode: "BHA", year: 2024, manager: "Roberto De Zerbi", position: 11 },
  { teamCode: "BOU", year: 2024, manager: "Andoni Iraola", position: 12 },
  { teamCode: "FUL", year: 2024, manager: "Marco Silva", position: 13 },
  { teamCode: "WOL", year: 2024, manager: "Gary O'Neil", position: 14 },
  { teamCode: "EVE", year: 2024, manager: "Sean Dyche", position: 15 },
  { teamCode: "BRE", year: 2024, manager: "Thomas Frank", position: 16 },
  { teamCode: "NFO", year: 2024, manager: "Steve Cooper", position: 17 },
  { teamCode: "LUT", year: 2024, manager: "Rob Edwards", position: 18 },
  { teamCode: "BUR", year: 2024, manager: "Vincent Kompany", position: 19 },
  { teamCode: "SHU", year: 2024, manager: "Paul Heckingbottom", position: 20 },

  // ── 2024-25 (year 2025) ──────────────────────────────
  { teamCode: "LIV", year: 2025, manager: "Arne Slot", position: 1 },
  { teamCode: "ARS", year: 2025, manager: "Mikel Arteta", position: 2 },
  { teamCode: "MCI", year: 2025, manager: "Pep Guardiola", position: 3 },
  { teamCode: "CHE", year: 2025, manager: "Enzo Maresca", position: 4 },
  { teamCode: "NEW", year: 2025, manager: "Eddie Howe", position: 5 },
  { teamCode: "AVL", year: 2025, manager: "Unai Emery", position: 6 },
  { teamCode: "NFO", year: 2025, manager: "Nuno Espírito Santo", position: 7 },
  { teamCode: "BHA", year: 2025, manager: "Fabian Hürzeler", position: 8 },
  { teamCode: "BOU", year: 2025, manager: "Andoni Iraola", position: 9 },
  { teamCode: "BRE", year: 2025, manager: "Thomas Frank", position: 10 },
  { teamCode: "FUL", year: 2025, manager: "Marco Silva", position: 11 },
  { teamCode: "CRY", year: 2025, manager: "Oliver Glasner", position: 12 },
  { teamCode: "EVE", year: 2025, manager: "Sean Dyche", position: 13 },
  { teamCode: "WHU", year: 2025, manager: "Julen Lopetegui", position: 14 },
  { teamCode: "MUN", year: 2025, manager: "Erik ten Hag", position: 15 },
  { teamCode: "WOL", year: 2025, manager: "Gary O'Neil", position: 16 },
  { teamCode: "TOT", year: 2025, manager: "Ange Postecoglou", position: 17 },
  { teamCode: "LEI", year: 2025, manager: "Steve Cooper", position: 18 },
  { teamCode: "IPS", year: 2025, manager: "Kieran McKenna", position: 19 },
  { teamCode: "SOU", year: 2025, manager: "Russell Martin", position: 20 },

  // ── 2025-26 (year 2026) — verified vs premierleague.com ──
  { teamCode: "ARS", year: 2026, manager: "Mikel Arteta", position: 1 },
  { teamCode: "MCI", year: 2026, manager: "Pep Guardiola", position: 2 },
  { teamCode: "MUN", year: 2026, manager: "Ruben Amorim", position: 3 },
  { teamCode: "AVL", year: 2026, manager: "Unai Emery", position: 4 },
  { teamCode: "LIV", year: 2026, manager: "Arne Slot", position: 5 },
  { teamCode: "BOU", year: 2026, manager: "Andoni Iraola", position: 6 },
  { teamCode: "SUN", year: 2026, manager: "Régis Le Bris", position: 7 },
  { teamCode: "BHA", year: 2026, manager: "Fabian Hürzeler", position: 8 },
  { teamCode: "BRE", year: 2026, manager: "Keith Andrews", position: 9 },
  { teamCode: "CHE", year: 2026, manager: "Enzo Maresca", position: 10 },
  { teamCode: "FUL", year: 2026, manager: "Marco Silva", position: 11 },
  { teamCode: "NEW", year: 2026, manager: "Eddie Howe", position: 12 },
  { teamCode: "EVE", year: 2026, manager: "David Moyes", position: 13 },
  { teamCode: "LEE", year: 2026, manager: "Daniel Farke", position: 14 },
  { teamCode: "CRY", year: 2026, manager: "Oliver Glasner", position: 15 },
  { teamCode: "NFO", year: 2026, manager: "Nuno Espírito Santo", position: 16 },
  { teamCode: "TOT", year: 2026, manager: "Thomas Frank", position: 17 },
  { teamCode: "WHU", year: 2026, manager: "Graham Potter", position: 18 },
  { teamCode: "BUR", year: 2026, manager: "Scott Parker", position: 19 },
  { teamCode: "WOL", year: 2026, manager: "Vítor Pereira", position: 20 }
];

/**
 * Map a final league position (1 = champions … 20 = bottom) to a manager rating.
 * 1st ≈ 1300, 10th–11th ≈ 1000, 20th ≈ 700. Replaces the old flat 1000 start.
 */
export function managerRatingForPosition(position: number): number {
  const clamped = Math.min(20, Math.max(1, position));
  return Math.round(1300 - (clamped - 1) * (600 / 19));
}
