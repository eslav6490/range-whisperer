const CLUB_ORDER = [
  "Lob Wedge",
  "LW",
  "Sand Wedge",
  "SW",
  "Gap Wedge",
  "Approach Wedge",
  "Attack Wedge",
  "AW",
  "GW",
  "Pitching Wedge",
  "PW",
  "9 Iron",
  "8 Iron",
  "7 Iron",
  "6 Iron",
  "5 Iron",
  "4 Iron",
  "3 Iron",
  "2 Iron",
  "Driving Iron",
  "Hybrid",
  "7 Wood",
  "5 Wood",
  "3 Wood",
  "Driver",
];

const CLUB_INDEX = new Map(
  CLUB_ORDER.map((club, index) => [normalizeClubName(club), index]),
);

export function normalizeClubName(club: string) {
  return club.toLowerCase().replace(/\s+/g, " ").trim();
}

export function getFallbackClubIndex(club: string) {
  const normalized = normalizeClubName(club);

  if (CLUB_INDEX.has(normalized)) {
    return CLUB_INDEX.get(normalized) ?? 999;
  }

  if (normalized.includes("wedge")) return 5;
  if (normalized.includes("iron")) {
    const match = normalized.match(/(\d+)/);
    if (match) return 20 - Number(match[1]);
    return 12;
  }
  if (normalized.includes("hybrid")) return 20;
  if (normalized.includes("wood")) return 23;
  if (normalized.includes("driver")) return 25;

  return 999;
}

export function sortClubsByCarry<T extends { club: string }>(
  items: T[],
  getCarryValue: (item: T) => number | null,
) {
  return [...items].sort((left, right) => {
    const leftCarry = getCarryValue(left);
    const rightCarry = getCarryValue(right);

    if (leftCarry != null && rightCarry != null && leftCarry !== rightCarry) {
      return leftCarry - rightCarry;
    }

    if (leftCarry == null && rightCarry != null) return 1;
    if (leftCarry != null && rightCarry == null) return -1;

    const fallbackDiff =
      getFallbackClubIndex(left.club) - getFallbackClubIndex(right.club);

    if (fallbackDiff !== 0) return fallbackDiff;

    return left.club.localeCompare(right.club);
  });
}
