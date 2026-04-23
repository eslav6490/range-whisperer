import { sortClubsByCarry } from "@/lib/club-order";
import type {
  CleanShot,
  ClubStats,
  DispersionPoint,
  FatigueAnalysis,
  GapObservation,
  HistogramBin,
  MetricSummary,
  ParsedSession,
  SessionAnalysis,
  SummaryMetric,
  TrendPoint,
} from "@/types";
import { generateCoachingInsights } from "@/lib/insights";

function isNumber(value: number | null): value is number {
  return value != null && Number.isFinite(value);
}

function valuesFromShots(shots: CleanShot[], selector: (shot: CleanShot) => number | null) {
  return shots.map(selector).filter(isNumber);
}

function mean(values: number[]) {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(values: number[], percentileValue: number) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * percentileValue;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const lowerValue = sorted[lowerIndex];
  const upperValue = sorted[upperIndex];

  if (lowerValue == null || upperValue == null) return null;
  if (lowerIndex === upperIndex) return lowerValue;

  const weight = position - lowerIndex;
  return lowerValue + (upperValue - lowerValue) * weight;
}

function standardDeviation(values: number[]) {
  if (values.length < 2) return null;
  const average = mean(values);
  if (average == null) return null;

  const variance =
    values.reduce((sum, value) => sum + (value - average) ** 2, 0) /
    (values.length - 1);

  return Math.sqrt(variance);
}

function metricSummary(values: number[]): MetricSummary {
  const average = mean(values);
  const stdDev = standardDeviation(values);
  const median = percentile(values, 0.5);
  const min = values.length > 0 ? Math.min(...values) : null;
  const max = values.length > 0 ? Math.max(...values) : null;

  return {
    count: values.length,
    mean: average,
    median,
    min,
    max,
    stdDev,
    cv: average && stdDev != null && average !== 0 ? stdDev / average : null,
    p10: percentile(values, 0.1),
    p25: percentile(values, 0.25),
    p75: percentile(values, 0.75),
    p90: percentile(values, 0.9),
  };
}

function groupedByClub(shots: CleanShot[]) {
  return shots.reduce<Record<string, CleanShot[]>>((groups, shot) => {
    groups[shot.club] = groups[shot.club] ?? [];
    groups[shot.club].push(shot);
    return groups;
  }, {});
}

function detectOutlierBounds(shots: CleanShot[]) {
  const carryValues = valuesFromShots(shots, (shot) => shot.carryDistance);
  if (carryValues.length < 4) return null;

  const q1 = percentile(carryValues, 0.25);
  const q3 = percentile(carryValues, 0.75);
  if (q1 == null || q3 == null) return null;

  const iqr = q3 - q1;
  if (iqr === 0) return null;

  return {
    lower: q1 - 1.5 * iqr,
    upper: q3 + 1.5 * iqr,
  };
}

export function annotateOutliers(shots: CleanShot[]) {
  const boundsByClub = new Map<string, { lower: number; upper: number }>();

  Object.entries(groupedByClub(shots)).forEach(([club, clubShots]) => {
    const bounds = detectOutlierBounds(clubShots);
    if (bounds) boundsByClub.set(club, bounds);
  });

  return shots.map((shot) => {
    const bounds = boundsByClub.get(shot.club);
    if (!bounds || shot.carryDistance == null) {
      return {
        ...shot,
        isOutlier: false,
        outlierReason: null,
      };
    }

    const isOutlier =
      shot.carryDistance < bounds.lower || shot.carryDistance > bounds.upper;

    return {
      ...shot,
      isOutlier,
      outlierReason: isOutlier
        ? `Carry distance fell outside the club's IQR envelope (${bounds.lower.toFixed(1)} to ${bounds.upper.toFixed(1)} yds).`
        : null,
    };
  });
}

function getBias(shots: CleanShot[]) {
  const signed = metricSummary(valuesFromShots(shots, (shot) => shot.carryDeviationDistance));
  const absolute = metricSummary(
    valuesFromShots(shots, (shot) =>
      shot.carryDeviationDistance == null ? null : Math.abs(shot.carryDeviationDistance),
    ),
  );
  const meanSigned = signed.mean ?? 0;
  const lateralStd = signed.stdDev ?? 0;
  const averageAbs = absolute.mean ?? 0;

  if (averageAbs >= 12 && Math.abs(meanSigned) < 3 && lateralStd >= 10) {
    return {
      direction: "two-way" as const,
      label: "Two-way miss pattern",
    };
  }

  if (meanSigned <= -4) {
    return {
      direction: "left" as const,
      label: "Left bias",
    };
  }

  if (meanSigned >= 4) {
    return {
      direction: "right" as const,
      label: "Right bias",
    };
  }

  return {
    direction: "neutral" as const,
    label: averageAbs >= 9 ? "Broad but neutral pattern" : "Neutral pattern",
  };
}

function calculateClubStats(
  allShotsByClub: Record<string, CleanShot[]>,
  includedShotsByClub: Record<string, CleanShot[]>,
) {
  const baseStats = Object.keys(allShotsByClub).map((club) => {
    const rawShots = allShotsByClub[club] ?? [];
    const shots = includedShotsByClub[club] ?? [];
    const carry = metricSummary(valuesFromShots(shots, (shot) => shot.carryDistance));
    const totalDistance = metricSummary(
      valuesFromShots(shots, (shot) => shot.totalDistance),
    );
    const ballSpeed = metricSummary(valuesFromShots(shots, (shot) => shot.ballSpeed));
    const clubSpeed = metricSummary(valuesFromShots(shots, (shot) => shot.clubSpeed));
    const smashFactor = metricSummary(valuesFromShots(shots, (shot) => shot.smashFactor));
    const launchAngle = metricSummary(valuesFromShots(shots, (shot) => shot.launchAngle));
    const spinRate = metricSummary(valuesFromShots(shots, (shot) => shot.spinRate));
    const carryDeviationSigned = metricSummary(
      valuesFromShots(shots, (shot) => shot.carryDeviationDistance),
    );
    const carryDeviationAbsolute = metricSummary(
      valuesFromShots(shots, (shot) =>
        shot.carryDeviationDistance == null ? null : Math.abs(shot.carryDeviationDistance),
      ),
    );
    const bias = getBias(shots);

    return {
      club,
      shotCount: shots.length,
      rawShotCount: rawShots.length,
      outlierCount: rawShots.filter((shot) => shot.isOutlier).length,
      carry,
      totalDistance,
      ballSpeed,
      clubSpeed,
      smashFactor,
      launchAngle,
      spinRate,
      carryDeviationSigned,
      carryDeviationAbsolute,
      playableCarryLow: carry.p10,
      playableCarryHigh: carry.p90,
      biasDirection: bias.direction,
      biasLabel: bias.label,
      consistencyScore: null,
    } satisfies ClubStats;
  });

  const carryStdValues = baseStats
    .map((club) => club.carry.stdDev)
    .filter(isNumber);
  const deviationValues = baseStats
    .map((club) => club.carryDeviationAbsolute.mean)
    .filter(isNumber);
  const ballSpeedStdValues = baseStats
    .map((club) => club.ballSpeed.stdDev)
    .filter(isNumber);

  const normalizeLowerIsBetter = (value: number | null, values: number[]) => {
    if (value == null || values.length === 0) return null;
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (max === min) return 0.75;
    return 1 - (value - min) / (max - min);
  };

  return baseStats.map((club) => {
    const carryComponent = normalizeLowerIsBetter(club.carry.stdDev, carryStdValues);
    const deviationComponent = normalizeLowerIsBetter(
      club.carryDeviationAbsolute.mean,
      deviationValues,
    );
    const ballSpeedComponent = normalizeLowerIsBetter(
      club.ballSpeed.stdDev,
      ballSpeedStdValues,
    );

    const weightedParts = [
      carryComponent != null ? carryComponent * 0.45 : null,
      deviationComponent != null ? deviationComponent * 0.35 : null,
      ballSpeedComponent != null ? ballSpeedComponent * 0.2 : null,
    ].filter(isNumber);

    const consistencyScore =
      weightedParts.length > 0
        ? weightedParts.reduce((sum, value) => sum + value, 0) /
          weightedParts.length *
          100
        : null;

    return {
      ...club,
      consistencyScore,
    };
  });
}

function buildGappingAnalysis(
  clubStats: ClubStats[],
  summaryMetric: SummaryMetric,
): GapObservation[] {
  const carryKey = summaryMetric;
  const eligibleClubs = sortClubsByCarry(
    clubStats.filter((club) => club.shotCount >= 3 && club.carry[carryKey] != null),
    (club) => club.carry[carryKey],
  );

  const gaps: GapObservation[] = [];

  for (let index = 0; index < eligibleClubs.length - 1; index += 1) {
    const lowerClub = eligibleClubs[index];
    const higherClub = eligibleClubs[index + 1];
    const lowerValue = lowerClub.carry[carryKey];
    const higherValue = higherClub.carry[carryKey];

    if (lowerValue == null || higherValue == null) continue;

    const overlapYards =
      lowerClub.playableCarryHigh != null && higherClub.playableCarryLow != null
        ? Math.max(0, lowerClub.playableCarryHigh - higherClub.playableCarryLow)
        : 0;

    const gap = higherValue - lowerValue;
    let classification: GapObservation["classification"] = "healthy";

    if (gap < 6 || overlapYards > 0) {
      classification = "tight";
    } else if (gap > 18) {
      classification = "large";
    }

    gaps.push({
      lowerClub: lowerClub.club,
      higherClub: higherClub.club,
      lowerValue,
      higherValue,
      gap,
      overlapYards,
      classification,
    });
  }

  return gaps;
}

function buildFatigueAnalysis(shots: CleanShot[]): FatigueAnalysis | null {
  if (shots.length < 12) return null;

  const segmentLength = Math.floor(shots.length / 3);
  if (segmentLength < 4) return null;

  const earlyShots = shots.slice(0, segmentLength);
  const lateShots = shots.slice(-segmentLength);

  const earlyCarry = mean(valuesFromShots(earlyShots, (shot) => shot.carryDistance));
  const lateCarry = mean(valuesFromShots(lateShots, (shot) => shot.carryDistance));
  const earlyBallSpeed = mean(valuesFromShots(earlyShots, (shot) => shot.ballSpeed));
  const lateBallSpeed = mean(valuesFromShots(lateShots, (shot) => shot.ballSpeed));
  const earlyDispersion = mean(
    valuesFromShots(earlyShots, (shot) =>
      shot.carryDeviationDistance == null ? null : Math.abs(shot.carryDeviationDistance),
    ),
  );
  const lateDispersion = mean(
    valuesFromShots(lateShots, (shot) =>
      shot.carryDeviationDistance == null ? null : Math.abs(shot.carryDeviationDistance),
    ),
  );

  return {
    shotsPerSegment: segmentLength,
    earlyCarry,
    lateCarry,
    carryChange:
      earlyCarry != null && lateCarry != null ? lateCarry - earlyCarry : null,
    earlyBallSpeed,
    lateBallSpeed,
    ballSpeedChange:
      earlyBallSpeed != null && lateBallSpeed != null
        ? lateBallSpeed - earlyBallSpeed
        : null,
    earlyDispersion,
    lateDispersion,
    dispersionChange:
      earlyDispersion != null && lateDispersion != null
        ? lateDispersion - earlyDispersion
        : null,
  };
}

function paletteForClubs(clubs: string[]) {
  const palette = [
    "#0f766e",
    "#d97706",
    "#2563eb",
    "#7c3aed",
    "#c2410c",
    "#15803d",
    "#be185d",
    "#0891b2",
    "#7f1d1d",
    "#334155",
  ];

  return new Map(clubs.map((club, index) => [club, palette[index % palette.length]]));
}

export function buildHistogram(
  shots: CleanShot[],
  club: string,
  binCount = 7,
): HistogramBin[] {
  const carryValues = valuesFromShots(
    shots.filter((shot) => shot.club === club),
    (shot) => shot.carryDistance,
  );

  if (carryValues.length === 0) return [];

  const minCarry = Math.min(...carryValues);
  const maxCarry = Math.max(...carryValues);
  const span = Math.max(1, maxCarry - minCarry);
  const step = span / binCount;

  const bins = Array.from({ length: binCount }, (_, index) => {
    const min = minCarry + step * index;
    const max = index === binCount - 1 ? maxCarry + 0.001 : min + step;
    return {
      label: `${Math.round(min)}-${Math.round(max)}`,
      min,
      max,
      count: 0,
    };
  });

  carryValues.forEach((value) => {
    const binIndex = Math.min(
      bins.length - 1,
      Math.floor(((value - minCarry) / span) * binCount),
    );
    bins[binIndex].count += 1;
  });

  return bins;
}

export function analyzeSession(
  session: ParsedSession,
  options: {
    selectedClubs: string[];
    excludeOutliers: boolean;
    summaryMetric: SummaryMetric;
  },
): SessionAnalysis {
  const annotatedShots = annotateOutliers(session.shots);
  const selectedClubSet = new Set(options.selectedClubs);
  const selectedShots = annotatedShots.filter((shot) =>
    selectedClubSet.size === 0 ? true : selectedClubSet.has(shot.club),
  );
  const filteredShots = selectedShots.filter((shot) =>
    options.excludeOutliers ? !shot.isOutlier : true,
  );

  const allShotsByClub = groupedByClub(selectedShots);
  const includedShotsByClub = groupedByClub(filteredShots);
  const clubStats = sortClubsByCarry(
    calculateClubStats(allShotsByClub, includedShotsByClub),
    (club) => club.carry[options.summaryMetric],
  );
  const colorMap = paletteForClubs(clubStats.map((club) => club.club));

  const overview = {
    totalShots: filteredShots.length,
    clubsUsed: clubStats.filter((club) => club.shotCount > 0).length,
    avgCarry: mean(valuesFromShots(filteredShots, (shot) => shot.carryDistance)),
    avgTotal: mean(valuesFromShots(filteredShots, (shot) => shot.totalDistance)),
    avgBallSpeed: mean(valuesFromShots(filteredShots, (shot) => shot.ballSpeed)),
    avgClubSpeed: mean(valuesFromShots(filteredShots, (shot) => shot.clubSpeed)),
    avgSmashFactor: mean(valuesFromShots(filteredShots, (shot) => shot.smashFactor)),
    avgAbsoluteCarryDeviation: mean(
      valuesFromShots(filteredShots, (shot) =>
        shot.carryDeviationDistance == null ? null : Math.abs(shot.carryDeviationDistance),
      ),
    ),
    mostConsistentClub:
      [...clubStats]
        .filter((club) => club.consistencyScore != null)
        .sort(
          (left, right) =>
            (right.consistencyScore ?? -1) - (left.consistencyScore ?? -1),
        )[0]?.club ?? null,
    widestDispersionClub:
      [...clubStats]
        .filter((club) => club.carryDeviationAbsolute.mean != null)
        .sort(
          (left, right) =>
            (right.carryDeviationAbsolute.mean ?? -1) -
            (left.carryDeviationAbsolute.mean ?? -1),
        )[0]?.club ?? null,
    outlierCount: selectedShots.filter((shot) => shot.isOutlier).length,
  };

  const carryChart = clubStats
    .filter((club) => club.shotCount > 0 && club.carry[options.summaryMetric] != null)
    .map((club) => ({
      club: club.club,
      color: colorMap.get(club.club) ?? "#0f766e",
      value: club.carry[options.summaryMetric] ?? 0,
      shotCount: club.shotCount,
      playableLow: club.playableCarryLow,
      playableHigh: club.playableCarryHigh,
    }));

  const dispersionPoints: DispersionPoint[] = filteredShots
    .filter(
      (shot) => shot.carryDistance != null && shot.carryDeviationDistance != null,
    )
    .map((shot) => ({
      club: shot.club,
      color: colorMap.get(shot.club) ?? "#0f766e",
      shotId: shot.id,
      shotNumber: shot.shotNumber,
      carryDistance: shot.carryDistance!,
      carryDeviationDistance: shot.carryDeviationDistance!,
      ballSpeed: shot.ballSpeed,
      isOutlier: shot.isOutlier,
    }));

  const ballSpeedCarryPoints = dispersionPoints.filter(
    (point) => point.ballSpeed != null,
  );

  const trendPoints: TrendPoint[] = filteredShots.map((shot) => ({
    shotNumber: shot.shotNumber,
    club: shot.club,
    carryDistance: shot.carryDistance,
    ballSpeed: shot.ballSpeed,
    isOutlier: shot.isOutlier,
  }));

  const gapping = buildGappingAnalysis(clubStats, options.summaryMetric);
  const fatigue = buildFatigueAnalysis(filteredShots);
  const insights = generateCoachingInsights({
    session,
    clubStats,
    overview,
    gapping,
    fatigue,
    filteredShots,
    summaryMetric: options.summaryMetric,
    outlierCount: overview.outlierCount,
  });

  return {
    filteredShots,
    clubStats,
    overview,
    gapping,
    fatigue,
    insights,
    carryChart,
    dispersionPoints,
    ballSpeedCarryPoints,
    trendPoints,
  };
}
