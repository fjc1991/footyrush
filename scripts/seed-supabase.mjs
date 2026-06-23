// DEPRECATED / OPTIONAL: the running app reads team/squad/player data from the
// bundled `/data.json`, NOT from Supabase. These seeded tables (teams, seasons,
// players, squad_players, ...) are not used at runtime, so seeding them is
// unnecessary at the current scale and is kept only for possible future use.
// The competitive tables that ARE used (profiles, leaderboard_entries,
// invincible_attempts, guest_play_allowances) are populated by the app/server,
// not by this script. Prefer NOT running `npm run seed:supabase` unless you are
// intentionally migrating game data into the database.

import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const data = JSON.parse(await readFile(new URL("../data.json", import.meta.url), "utf8"));
const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false }
});

async function upsert(table, rows, options = {}) {
  const { size = 500, ...upsertOptions } = options;
  for (let index = 0; index < rows.length; index += size) {
    const chunk = rows.slice(index, index + size);
    const { error } = await supabase.from(table).upsert(chunk, upsertOptions);
    if (error) {
      throw new Error(`${table}: ${error.message}`);
    }
  }
}

const teams = Object.entries(data.teams).map(([code, value]) => ({
  code,
  name: value.name,
  badge: value.badge ?? ""
}));
const seasons = data.years.map((year) => ({ year }));
const teamSeasons = data.combos.map(([team_code, year]) => ({ team_code, year }));
const playersById = new Map();
const squadRows = [];

for (const [key, squad] of Object.entries(data.squads)) {
  const [teamCode, yearValue] = key.split("|");
  const year = Number(yearValue);
  for (const player of squad) {
    playersById.set(player.i, { id: player.i, name: player.n });
    squadRows.push({
      team_code: teamCode,
      year,
      player_id: player.i,
      positions: player.p,
      overall: player.o,
      age: player.a,
      shirt_number: player.num,
      pac: player.pac,
      sho: player.sho,
      pas: player.pas,
      dri: player.dri,
      def: player.def,
      phy: player.phy
    });
  }
}

console.log("Seeding teams, seasons, players and squad rows...");
await upsert("teams", teams, { onConflict: "code" });
await upsert("seasons", seasons, { onConflict: "year" });
await upsert("team_seasons", teamSeasons, { onConflict: "team_code,year" });
await upsert("players", Array.from(playersById.values()), { onConflict: "id" });

const { data: teamSeasonRows, error } = await supabase.from("team_seasons").select("id,team_code,year");
if (error) {
  throw new Error(error.message);
}
const teamSeasonId = new Map(teamSeasonRows.map((row) => [`${row.team_code}|${row.year}`, row.id]));
const normalizedSquads = squadRows.map((row) => ({
  team_season_id: teamSeasonId.get(`${row.team_code}|${row.year}`),
  player_id: row.player_id,
  positions: row.positions,
  overall: row.overall,
  age: row.age,
  shirt_number: row.shirt_number,
  pac: row.pac,
  sho: row.sho,
  pas: row.pas,
  dri: row.dri,
  def: row.def,
  phy: row.phy
}));

// A handful of source squads list the same player twice; Postgres rejects a batch that
// targets the same (team_season_id, player_id) conflict key more than once, so de-duplicate.
const dedupedSquads = Array.from(
  new Map(normalizedSquads.map((row) => [`${row.team_season_id}|${row.player_id}`, row])).values()
);

await upsert("squad_players", dedupedSquads, { onConflict: "team_season_id,player_id", size: 400 });
console.log(`Seed complete: ${teams.length} teams, ${seasons.length} seasons, ${playersById.size} players, ${dedupedSquads.length} squad rows.`);
