export type NullableNumber = number | null;
export type SummaryMetric = "mean" | "median";
export type BiasDirection = "left" | "right" | "neutral" | "two-way";

export interface RawShotRow {
  [key: string]: string | null;
}

export interface CleanShot {
  id: string;
  rowIndex: number;
  shotNumber: number;
  dateRaw: string | null;
  date: Date | null;
  player: string | null;
  clubName: string | null;
  clubType: string | null;
  club: string;
  clubSpeed: NullableNumber;
  attackAngle: NullableNumber;
  clubPath: NullableNumber;
  clubFace: NullableNumber;
  faceToPath: NullableNumber;
  ballSpeed: NullableNumber;
  smashFactor: NullableNumber;
  launchAngle: NullableNumber;
  launchDirection: NullableNumber;
  backspin: NullableNumber;
  sidespin: NullableNumber;
  spinRate: NullableNumber;
  spinRateType: string | null;
  spinAxis: NullableNumber;
  apexHeight: NullableNumber;
  carryDistance: NullableNumber;
  carryDeviationAngle: NullableNumber;
  carryDeviationDistance: NullableNumber;
  totalDistance: NullableNumber;
  totalDeviationAngle: NullableNumber;
  totalDeviationDistance: NullableNumber;
  note: string | null;
  tag: string | null;
  airDensity: NullableNumber;
  temperature: NullableNumber;
  airPressure: NullableNumber;
  relativeHumidity: NullableNumber;
  original: RawShotRow;
  parseNotes: string[];
  isOutlier: boolean;
  outlierReason: string | null;
}

export interface ParsedSession {
  fileName: string;
  shots: CleanShot[];
  warnings: string[];
  droppedRowCount: number;
  unitsRowRemoved: boolean;
  detectedClubs: string[];
  playerNames: string[];
  dateRange: {
    start: Date | null;
    end: Date | null;
  };
}

export interface MetricSummary {
  count: number;
  mean: NullableNumber;
  median: NullableNumber;
  min: NullableNumber;
  max: NullableNumber;
  stdDev: NullableNumber;
  cv: NullableNumber;
  p10: NullableNumber;
  p25: NullableNumber;
  p75: NullableNumber;
  p90: NullableNumber;
}

export interface ClubStats {
  club: string;
  shotCount: number;
  rawShotCount: number;
  outlierCount: number;
  carry: MetricSummary;
  totalDistance: MetricSummary;
  ballSpeed: MetricSummary;
  clubSpeed: MetricSummary;
  smashFactor: MetricSummary;
  launchAngle: MetricSummary;
  spinRate: MetricSummary;
  carryDeviationSigned: MetricSummary;
  carryDeviationAbsolute: MetricSummary;
  playableCarryLow: NullableNumber;
  playableCarryHigh: NullableNumber;
  biasDirection: BiasDirection;
  biasLabel: string;
  consistencyScore: NullableNumber;
}

export interface GapObservation {
  lowerClub: string;
  higherClub: string;
  lowerValue: number;
  higherValue: number;
  gap: number;
  overlapYards: number;
  classification: "tight" | "large" | "healthy";
}

export interface FatigueAnalysis {
  shotsPerSegment: number;
  earlyCarry: NullableNumber;
  lateCarry: NullableNumber;
  carryChange: NullableNumber;
  earlyBallSpeed: NullableNumber;
  lateBallSpeed: NullableNumber;
  ballSpeedChange: NullableNumber;
  earlyDispersion: NullableNumber;
  lateDispersion: NullableNumber;
  dispersionChange: NullableNumber;
}

export interface CoachingInsight {
  id: string;
  category:
    | "Distance control"
    | "Dispersion"
    | "Gapping"
    | "Session pattern"
    | "Priorities for practice";
  headline: string;
  detail: string;
  action: string;
  evidence: string;
  severity: "positive" | "watch" | "priority";
}

export interface SessionOverview {
  totalShots: number;
  clubsUsed: number;
  avgCarry: NullableNumber;
  avgTotal: NullableNumber;
  avgBallSpeed: NullableNumber;
  avgClubSpeed: NullableNumber;
  avgSmashFactor: NullableNumber;
  avgAbsoluteCarryDeviation: NullableNumber;
  mostConsistentClub: string | null;
  widestDispersionClub: string | null;
  outlierCount: number;
}

export interface ChartPoint {
  club: string;
  color: string;
}

export interface CarryChartPoint extends ChartPoint {
  value: number;
  shotCount: number;
  playableLow: NullableNumber;
  playableHigh: NullableNumber;
}

export interface DispersionPoint extends ChartPoint {
  shotId: string;
  shotNumber: number;
  carryDistance: number;
  carryDeviationDistance: number;
  ballSpeed: NullableNumber;
  isOutlier: boolean;
}

export interface TrendPoint {
  shotNumber: number;
  club: string;
  carryDistance: NullableNumber;
  ballSpeed: NullableNumber;
  isOutlier: boolean;
}

export interface HistogramBin {
  label: string;
  min: number;
  max: number;
  count: number;
}

export interface SessionAnalysis {
  filteredShots: CleanShot[];
  clubStats: ClubStats[];
  overview: SessionOverview;
  gapping: GapObservation[];
  fatigue: FatigueAnalysis | null;
  insights: CoachingInsight[];
  carryChart: CarryChartPoint[];
  dispersionPoints: DispersionPoint[];
  ballSpeedCarryPoints: DispersionPoint[];
  trendPoints: TrendPoint[];
}
