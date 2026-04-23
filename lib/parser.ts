import Papa from "papaparse";

import type { CleanShot, ParsedSession, RawShotRow } from "@/types";
import { getFallbackClubIndex } from "@/lib/club-order";

const NUMERIC_FIELDS: Array<keyof CleanShot> = [
  "clubSpeed",
  "attackAngle",
  "clubPath",
  "clubFace",
  "faceToPath",
  "ballSpeed",
  "smashFactor",
  "launchAngle",
  "launchDirection",
  "backspin",
  "sidespin",
  "spinRate",
  "spinAxis",
  "apexHeight",
  "carryDistance",
  "carryDeviationAngle",
  "carryDeviationDistance",
  "totalDistance",
  "totalDeviationAngle",
  "totalDeviationDistance",
  "airDensity",
  "temperature",
  "airPressure",
  "relativeHumidity",
];

const COLUMN_TO_FIELD: Record<string, keyof CleanShot> = {
  "Club Speed": "clubSpeed",
  "Attack Angle": "attackAngle",
  "Club Path": "clubPath",
  "Club Face": "clubFace",
  "Face to Path": "faceToPath",
  "Ball Speed": "ballSpeed",
  "Smash Factor": "smashFactor",
  "Launch Angle": "launchAngle",
  "Launch Direction": "launchDirection",
  Backspin: "backspin",
  Sidespin: "sidespin",
  "Spin Rate": "spinRate",
  "Spin Axis": "spinAxis",
  "Apex Height": "apexHeight",
  "Carry Distance": "carryDistance",
  "Carry Deviation Angle": "carryDeviationAngle",
  "Carry Deviation Distance": "carryDeviationDistance",
  "Total Distance": "totalDistance",
  "Total Deviation Angle": "totalDeviationAngle",
  "Total Deviation Distance": "totalDeviationDistance",
  "Air Density": "airDensity",
  Temperature: "temperature",
  "Air Pressure": "airPressure",
  "Relative Humidity": "relativeHumidity",
};

const MEANINGFUL_METRICS: Array<keyof CleanShot> = [
  "carryDistance",
  "totalDistance",
  "ballSpeed",
  "clubSpeed",
  "smashFactor",
  "spinRate",
];

function normalizeValue(value: unknown) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed === "" ? null : trimmed;
}

function parseNumeric(value: string | null) {
  if (value == null) return null;
  const normalized = value.replace(/,/g, "");
  if (!/^[-+]?\d*\.?\d+$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseGarminDate(value: string | null) {
  if (!value) return null;

  const match = value.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)?$/i,
  );

  if (!match) {
    const fallback = new Date(value);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }

  const [, monthString, dayString, yearString, hourString, minuteString, secondString, meridiem] =
    match;

  const month = Number(monthString);
  const day = Number(dayString);
  const rawYear = Number(yearString);
  const year = rawYear < 100 ? 2000 + rawYear : rawYear;
  let hour = Number(hourString);
  const minute = Number(minuteString);
  const second = Number(secondString ?? "0");

  if (meridiem && hour <= 12) {
    const upper = meridiem.toUpperCase();
    if (upper === "PM" && hour < 12) hour += 12;
    if (upper === "AM" && hour === 12) hour = 0;
  }

  const date = new Date(year, month - 1, day, hour, minute, second);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isUnitsRow(row: RawShotRow) {
  const values = Object.values(row);
  const nonEmptyValues = values.filter((value) => value != null);

  if (nonEmptyValues.length === 0) return false;

  const unitCount = nonEmptyValues.filter((value) => /^\[[^\]]+\]$/.test(value)).length;
  return unitCount >= 4 && unitCount === nonEmptyValues.length;
}

function createBaseShot(rowIndex: number, shotNumber: number): CleanShot {
  return {
    id: `shot-${rowIndex}`,
    rowIndex,
    shotNumber,
    dateRaw: null,
    date: null,
    player: null,
    clubName: null,
    clubType: null,
    club: "Unknown Club",
    clubSpeed: null,
    attackAngle: null,
    clubPath: null,
    clubFace: null,
    faceToPath: null,
    ballSpeed: null,
    smashFactor: null,
    launchAngle: null,
    launchDirection: null,
    backspin: null,
    sidespin: null,
    spinRate: null,
    spinRateType: null,
    spinAxis: null,
    apexHeight: null,
    carryDistance: null,
    carryDeviationAngle: null,
    carryDeviationDistance: null,
    totalDistance: null,
    totalDeviationAngle: null,
    totalDeviationDistance: null,
    note: null,
    tag: null,
    airDensity: null,
    temperature: null,
    airPressure: null,
    relativeHumidity: null,
    original: {},
    parseNotes: [],
    isOutlier: false,
    outlierReason: null,
  };
}

function hasMeaningfulMetrics(shot: CleanShot) {
  return MEANINGFUL_METRICS.some((field) => shot[field] != null);
}

export function parseGarminCsv(fileText: string, fileName: string): ParsedSession {
  if (!fileText.trim()) {
    throw new Error("This CSV file is empty.");
  }

  const parsed = Papa.parse<Record<string, string>>(fileText, {
    header: true,
    skipEmptyLines: false,
    transformHeader: (header) => header.trim(),
  });

  if (parsed.errors.length > 0 && parsed.data.length === 0) {
    throw new Error("The CSV could not be read. Please export the Garmin session again.");
  }

  const warnings: string[] = [];
  const rows = parsed.data
    .map((rawRow) =>
      Object.fromEntries(
        Object.entries(rawRow).map(([key, value]) => [key.trim(), normalizeValue(value)]),
      ) satisfies RawShotRow,
    )
    .filter((row) => Object.values(row).some((value) => value != null));

  if (rows.length === 0) {
    throw new Error("The CSV contains headers but no readable rows.");
  }

  let unitsRowRemoved = false;
  let workingRows = rows;

  if (isUnitsRow(rows[0])) {
    workingRows = rows.slice(1);
    unitsRowRemoved = true;
    warnings.push("Removed Garmin's units row before analysis.");
  }

  if (workingRows.length === 0) {
    throw new Error("The CSV only contained units and no shot rows.");
  }

  let malformedNumericValues = 0;
  let droppedRowCount = 0;
  const shots: CleanShot[] = [];

  workingRows.forEach((row, index) => {
    const shot = createBaseShot(index + 2, shots.length + 1);
    shot.original = row;
    shot.dateRaw = row.Date ?? null;
    shot.date = parseGarminDate(row.Date ?? null);
    shot.player = row.Player ?? null;
    shot.clubName = row["Club Name"] ?? null;
    shot.clubType = row["Club Type"] ?? null;
    shot.club = shot.clubType ?? shot.clubName ?? "Unknown Club";
    shot.spinRateType = row["Spin Rate Type"] ?? null;
    shot.note = row.Note ?? null;
    shot.tag = row.Tag ?? null;

    Object.entries(COLUMN_TO_FIELD).forEach(([column, field]) => {
      const numericValue = parseNumeric(row[column] ?? null);
      if (row[column] != null && numericValue == null) {
        malformedNumericValues += 1;
      }
      shot[field] = numericValue as never;
    });

    if (!hasMeaningfulMetrics(shot)) {
      droppedRowCount += 1;
      return;
    }

    shot.shotNumber = shots.length + 1;
    shots.push(shot);
  });

  if (malformedNumericValues > 0) {
    warnings.push(
      `${malformedNumericValues} malformed numeric value${malformedNumericValues === 1 ? "" : "s"} were treated as blank.`,
    );
  }

  if (droppedRowCount > 0) {
    warnings.push(
      `${droppedRowCount} row${droppedRowCount === 1 ? "" : "s"} with no meaningful shot metrics were skipped.`,
    );
  }

  if (shots.length === 0) {
    throw new Error("No valid shot rows were found after cleaning the CSV.");
  }

  const detectedClubs = [...new Set(shots.map((shot) => shot.club))].sort(
    (left, right) => getFallbackClubIndex(left) - getFallbackClubIndex(right),
  );
  const playerNames = [...new Set(shots.map((shot) => shot.player).filter(Boolean))] as string[];
  const datedShots = shots
    .map((shot) => shot.date)
    .filter((date): date is Date => date instanceof Date)
    .sort((left, right) => left.getTime() - right.getTime());

  return {
    fileName,
    shots,
    warnings,
    droppedRowCount,
    unitsRowRemoved,
    detectedClubs,
    playerNames,
    dateRange: {
      start: datedShots[0] ?? null,
      end: datedShots[datedShots.length - 1] ?? null,
    },
  };
}
