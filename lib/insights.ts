import type {
  CleanShot,
  ClubStats,
  CoachingInsight,
  FatigueAnalysis,
  GapObservation,
  ParsedSession,
  SessionOverview,
  SummaryMetric,
} from "@/types";

function formatNumber(value: number | null, digits = 1) {
  return value == null ? "n/a" : value.toFixed(digits);
}

function pushInsight(
  insights: CoachingInsight[],
  insight: CoachingInsight | null,
) {
  if (!insight) return;
  if (insights.some((item) => item.headline === insight.headline)) return;
  insights.push(insight);
}

export function generateCoachingInsights(input: {
  session: ParsedSession;
  clubStats: ClubStats[];
  overview: SessionOverview;
  gapping: GapObservation[];
  fatigue: FatigueAnalysis | null;
  filteredShots: CleanShot[];
  summaryMetric: SummaryMetric;
  outlierCount: number;
}) {
  const insights: CoachingInsight[] = [];
  const eligibleClubs = input.clubStats.filter((club) => club.shotCount >= 4);
  const leastConsistent = [...eligibleClubs].sort(
    (left, right) =>
      (left.consistencyScore ?? Number.POSITIVE_INFINITY) -
      (right.consistencyScore ?? Number.POSITIVE_INFINITY),
  )[0];
  const mostConsistent = [...eligibleClubs].sort(
    (left, right) =>
      (right.consistencyScore ?? Number.NEGATIVE_INFINITY) -
      (left.consistencyScore ?? Number.NEGATIVE_INFINITY),
  )[0];
  const widestDispersion = [...eligibleClubs].sort(
    (left, right) =>
      (right.carryDeviationAbsolute.mean ?? -1) -
      (left.carryDeviationAbsolute.mean ?? -1),
  )[0];
  const strongestBias = [...eligibleClubs]
    .filter((club) => Math.abs(club.carryDeviationSigned.mean ?? 0) >= 5)
    .sort(
      (left, right) =>
        Math.abs(right.carryDeviationSigned.mean ?? 0) -
        Math.abs(left.carryDeviationSigned.mean ?? 0),
    )[0];
  const highOutlierRate =
    input.filteredShots.length > 0
      ? input.outlierCount / (input.filteredShots.length + input.outlierCount)
      : 0;
  const tightGap = [...input.gapping].sort(
    (left, right) => left.gap - right.gap,
  )[0];
  const largeGap = [...input.gapping]
    .filter((gap) => gap.classification === "large")
    .sort((left, right) => right.gap - left.gap)[0];

  pushInsight(
    insights,
    leastConsistent && leastConsistent.carry.stdDev != null
      ? {
          id: "distance-control",
          category: "Distance control",
          severity:
            (leastConsistent.carry.stdDev ?? 0) >= 11 ? "priority" : "watch",
          headline: `${leastConsistent.club} distance control is less predictable than its headline carry suggests`,
          detail: `The ${leastConsistent.club} averaged ${formatNumber(leastConsistent.carry.mean)} yards of carry, but its playable window sits around ${formatNumber(leastConsistent.playableCarryLow)}-${formatNumber(leastConsistent.playableCarryHigh)} with a ${formatNumber(leastConsistent.carry.stdDev)} yard standard deviation.`,
          action:
            "Run a short ladder drill with this club and score yourself by landing inside a specific carry window, not by chasing your best single shot.",
          evidence: `Internal consistency score: ${formatNumber(leastConsistent.consistencyScore, 0)}/100.`,
        }
      : null,
  );

  pushInsight(
    insights,
    widestDispersion && widestDispersion.carryDeviationAbsolute.mean != null
      ? {
          id: "dispersion-shape",
          category: "Dispersion",
          severity:
            (widestDispersion.carryDeviationAbsolute.mean ?? 0) >= 14
              ? "priority"
              : "watch",
          headline: `${widestDispersion.club} is the broadest lateral pattern in this session`,
          detail: `Average carry miss with the ${widestDispersion.club} was ${formatNumber(widestDispersion.carryDeviationAbsolute.mean)} yards offline. ${widestDispersion.biasLabel === "Two-way miss pattern" ? "The mean bias stays near center, so the bigger story is width rather than one side." : `The pattern leans ${widestDispersion.biasLabel.toLowerCase()}.`}`,
          action:
            "Keep this club in a target-line practice block and judge each set by average offline distance rather than only the longest shot.",
          evidence: `Signed carry deviation mean: ${formatNumber(widestDispersion.carryDeviationSigned.mean)} yards.`,
        }
      : null,
  );

  pushInsight(
    insights,
    strongestBias
      ? {
          id: "directional-bias",
          category: "Dispersion",
          severity: "watch",
          headline: `${strongestBias.club} shows the clearest one-sided start pattern`,
          detail: `Carry deviation averages ${formatNumber(strongestBias.carryDeviationSigned.mean)} yards, which is enough to treat the ${strongestBias.biasLabel.toLowerCase()} as a repeatable tendency in this session without assuming the exact swing cause.`,
          action:
            "For this club, aim a gate around start line and contact quality first, then see whether the average miss tightens before making bigger setup changes.",
          evidence: `Average absolute lateral miss: ${formatNumber(strongestBias.carryDeviationAbsolute.mean)} yards.`,
        }
      : null,
  );

  pushInsight(
    insights,
    tightGap && tightGap.classification === "tight"
      ? {
          id: "tight-gapping",
          category: "Gapping",
          severity: tightGap.gap < 4 ? "priority" : "watch",
          headline: `${tightGap.lowerClub} and ${tightGap.higherClub} are playing too close together to give obvious separation`,
          detail: `Using ${input.summaryMetric} carry, the gap is ${formatNumber(tightGap.gap)} yards. Their playable ranges overlap by about ${formatNumber(tightGap.overlapYards)} yards, so these clubs may not be giving you clearly different jobs right now.`,
          action:
            "Hit an alternating two-club test next session and compare stock carry windows, not peak distances, before making any bag changes.",
          evidence: `${tightGap.lowerClub}: ${formatNumber(tightGap.lowerValue)} yds, ${tightGap.higherClub}: ${formatNumber(tightGap.higherValue)} yds.`,
        }
      : null,
  );

  pushInsight(
    insights,
    largeGap
      ? {
          id: "large-gap",
          category: "Gapping",
          severity: "watch",
          headline: `There is a visible distance jump between ${largeGap.lowerClub} and ${largeGap.higherClub}`,
          detail: `The measured gap is about ${formatNumber(largeGap.gap)} yards, which is wider than a typical stock separation. That can leave an awkward in-between number on the course.`,
          action:
            "Pressure-test partial-swing coverage around that number or confirm whether one of the clubs needs a different stock swing length.",
          evidence: `${largeGap.lowerClub} to ${largeGap.higherClub} based on ${input.summaryMetric} carry.`,
        }
      : null,
  );

  pushInsight(
    insights,
    input.fatigue &&
    ((input.fatigue.carryChange ?? 0) <= -4 ||
      (input.fatigue.ballSpeedChange ?? 0) <= -2 ||
      (input.fatigue.dispersionChange ?? 0) >= 3)
      ? {
          id: "session-drift",
          category: "Session pattern",
          severity:
            (input.fatigue.ballSpeedChange ?? 0) <= -3 ||
            (input.fatigue.carryChange ?? 0) <= -6
              ? "priority"
              : "watch",
          headline: "The final third of the session looks a little less sharp than the start",
          detail: `Compared with the first ${input.fatigue.shotsPerSegment} shots, the last ${input.fatigue.shotsPerSegment} changed by ${formatNumber(input.fatigue.carryChange)} yards in carry, ${formatNumber(input.fatigue.ballSpeedChange)} mph in ball speed, and ${formatNumber(input.fatigue.dispersionChange)} yards in average lateral miss.`,
          action:
            "When you practice, capture one fresh baseline set and one late-session set so you can tell whether the drop is endurance, attention, or just random variance.",
          evidence: "This is a session trend, not a swing diagnosis.",
        }
      : null,
  );

  pushInsight(
    insights,
    highOutlierRate >= 0.12
      ? {
          id: "outlier-rate",
          category: "Session pattern",
          severity: "watch",
          headline: "A noticeable share of the session sat outside each club's normal carry window",
          detail: `${Math.round(highOutlierRate * 100)}% of selected shots were flagged as carry outliers using an IQR rule within each club. That usually points to a session with a few strike or speed swings that can distort the headline averages.`,
          action:
            "Compare the include-outliers and exclude-outliers views before drawing conclusions from the raw averages.",
          evidence: `${input.outlierCount} outlier shot${input.outlierCount === 1 ? "" : "s"} flagged.`,
        }
      : null,
  );

  pushInsight(
    insights,
    mostConsistent && mostConsistent.consistencyScore != null
      ? {
          id: "best-club",
          category: "Priorities for practice",
          severity: "positive",
          headline: `${mostConsistent.club} was your steadiest club in this session`,
          detail: `Its internal session consistency score came in at ${formatNumber(mostConsistent.consistencyScore, 0)}/100 with a ${formatNumber(mostConsistent.carry.stdDev)} yard carry spread and ${formatNumber(mostConsistent.carryDeviationAbsolute.mean)} yards of average offline miss.`,
          action:
            "Use this club as your baseline when calibrating tempo and strike, then carry that same standard into the less stable clubs.",
          evidence: `Shot count: ${mostConsistent.shotCount}.`,
        }
      : null,
  );

  const smashStabilityClub = [...eligibleClubs]
    .filter((club) => club.smashFactor.stdDev != null && club.smashFactor.mean != null)
    .sort(
      (left, right) =>
        (right.smashFactor.stdDev ?? 0) - (left.smashFactor.stdDev ?? 0),
    )[0];

  pushInsight(
    insights,
    smashStabilityClub
      ? {
          id: "strike-stability",
          category: "Priorities for practice",
          severity:
            (smashStabilityClub.smashFactor.stdDev ?? 0) >= 0.08
              ? "priority"
              : "watch",
          headline: `${smashStabilityClub.club} strike quality varied more than the average distance alone suggests`,
          detail: `Smash factor averaged ${formatNumber(smashStabilityClub.smashFactor.mean, 2)} with a ${formatNumber(smashStabilityClub.smashFactor.stdDev, 2)} spread. That often shows up as uneven carry even when swing speed looks similar.`,
          action:
            "Pair face-contact feedback with carry windows for this club so you're training strike quality and distance control together.",
          evidence: `Ball speed standard deviation: ${formatNumber(smashStabilityClub.ballSpeed.stdDev)} mph.`,
        }
      : null,
  );

  if (insights.length < 5) {
    pushInsight(insights, {
      id: "session-baseline",
      category: "Distance control",
      severity: "positive",
      headline: "This session gives you a usable baseline for stock carry mapping",
      detail: `You recorded ${input.overview.totalShots} valid shots across ${input.overview.clubsUsed} clubs, which is enough to start separating broad patterns from single-shot noise.`,
      action:
        "Keep future range sessions in the same format so you can compare carry windows and dispersion over time.",
      evidence: `Session file: ${input.session.fileName}.`,
    });
  }

  return insights.slice(0, 10);
}
