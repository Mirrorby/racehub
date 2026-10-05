/**
 * Канонические id/имена команд — те же, что в standings_cache, team_colors,
 * team_details и constructor_career. Старые строки результатов и fast-путь
 * OpenF1 местами писали "red_bull_racing"/"racing_bulls"; Jolpica для
 * constructorStandings отдаёт те же два алиаса.
 */
const ALIASES: Record<string, { id: string; name: string }> = {
  red_bull_racing: { id: "red_bull", name: "Red Bull" },
  racing_bulls: { id: "rb", name: "RB F1 Team" },
};

export function canonicalConstructorId(id: string): string {
  return ALIASES[id]?.id ?? id;
}

/** Каноническое имя для алиасов; для остальных — undefined (брать из данных). */
export function canonicalConstructorName(id: string): string | undefined {
  return ALIASES[id]?.name;
}
