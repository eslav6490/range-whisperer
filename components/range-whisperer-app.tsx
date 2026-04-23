"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, DragEvent, ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { analyzeSession, buildHistogram } from "@/lib/analysis";
import { parseGarminCsv } from "@/lib/parser";
import type {
  CarryChartPoint,
  ClubStats,
  CoachingInsight,
  HistogramBin,
  ParsedSession,
  SessionAnalysis,
  SummaryMetric,
} from "@/types";

const PREFS_KEY = "range-whisperer-preferences";

function formatNumber(value: number | null, digits = 1) {
  return value == null ? "--" : value.toFixed(digits);
}

function formatSigned(value: number | null, digits = 1) {
  if (value == null) return "--";
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;
}

function formatDateRange(session: ParsedSession) {
  const { start, end } = session.dateRange;
  if (!start && !end) return "Date unavailable";
  if (start && end) {
    const options: Intl.DateTimeFormatOptions = {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    };

    if (start.toDateString() === end.toDateString()) {
      return `${start.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })} | ${start.toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      })} to ${end.toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      })}`;
    }

    return `${start.toLocaleString(undefined, options)} to ${end.toLocaleString(
      undefined,
      options,
    )}`;
  }

  const date = start ?? end;
  return date
    ? date.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "Date unavailable";
}

function exportMarkdown(session: ParsedSession, analysis: SessionAnalysis) {
  const lines = [
    "# Range Whisperer Session Summary",
    "",
    `- File: ${session.fileName}`,
    `- Shots analyzed: ${analysis.overview.totalShots}`,
    `- Clubs used: ${analysis.overview.clubsUsed}`,
    `- Average carry: ${formatNumber(analysis.overview.avgCarry)} yds`,
    `- Average total distance: ${formatNumber(analysis.overview.avgTotal)} yds`,
    `- Average ball speed: ${formatNumber(analysis.overview.avgBallSpeed)} mph`,
    `- Outliers ${analysis.overview.outlierCount > 0 ? "excluded" : "detected"}: ${analysis.overview.outlierCount}`,
    "",
    "## Club Summary",
    "",
    "| Club | Shots | Avg Carry | Median Carry | Carry SD | Avg Offline | Consistency |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...analysis.clubStats.map(
      (club) =>
        `| ${club.club} | ${club.shotCount} | ${formatNumber(club.carry.mean)} | ${formatNumber(club.carry.median)} | ${formatNumber(club.carry.stdDev)} | ${formatNumber(club.carryDeviationAbsolute.mean)} | ${formatNumber(club.consistencyScore, 0)} |`,
    ),
    "",
    "## Coaching Insights",
    "",
    ...analysis.insights.flatMap((insight) => [
      `### ${insight.category}: ${insight.headline}`,
      "",
      `${insight.detail}`,
      "",
      `Action: ${insight.action}`,
      "",
      `Evidence: ${insight.evidence}`,
      "",
    ]),
  ];

  const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${session.fileName.replace(/\.csv$/i, "")}-summary.md`;
  link.click();
  URL.revokeObjectURL(url);
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="metric-shadow rounded-[1.4rem] border border-white/60 bg-white/70 p-4">
      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#5a675f]">
        {label}
      </div>
      <div className="mt-3 text-[1.85rem] font-semibold tracking-tight text-[#13251f]">
        {value}
      </div>
      {hint ? <div className="mt-2 text-sm muted">{hint}</div> : null}
    </div>
  );
}

function InsightCard({ insight }: { insight: CoachingInsight }) {
  const toneStyles =
    insight.severity === "priority"
      ? "border-red-200/70 bg-red-50/70"
      : insight.severity === "positive"
        ? "border-emerald-200/70 bg-emerald-50/70"
        : "border-amber-200/70 bg-amber-50/70";

  return (
    <article className={`rounded-[1.35rem] border p-5 ${toneStyles}`}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="eyebrow">{insight.category}</span>
        <span className="text-xs font-semibold uppercase tracking-[0.12em] muted">
          {insight.severity}
        </span>
      </div>
      <h3 className="mt-4 text-lg font-semibold tracking-tight text-[#13251f]">
        {insight.headline}
      </h3>
      <p className="mt-3 text-sm leading-6 text-[#31443d]">{insight.detail}</p>
      <p className="mt-3 text-sm leading-6 text-[#13251f]">
        <span className="font-semibold">Next action:</span> {insight.action}
      </p>
      <p className="mt-3 text-xs leading-5 text-[#55645c]">{insight.evidence}</p>
    </article>
  );
}

function SectionHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-6">
      <span className="eyebrow">{eyebrow}</span>
      <h2 className="serif mt-4 text-[2rem] font-semibold tracking-tight text-[#13251f]">
        {title}
      </h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-[#506158]">{description}</p>
    </div>
  );
}

function UploadZone({
  onFile,
  compact = false,
  error,
}: {
  onFile: (file: File) => void;
  compact?: boolean;
  error: string | null;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);

  const handleFileList = (files: FileList | null) => {
    const file = files?.[0];
    if (file) onFile(file);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    handleFileList(event.dataTransfer.files);
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    handleFileList(event.target.files);
    event.target.value = "";
  };

  return (
    <div
      className={`rounded-[2rem] border border-dashed p-6 transition ${
        compact ? "bg-white/65" : "bg-white/55"
      } ${dragging ? "border-teal-500 bg-teal-50/80" : "border-[#9db6ab]"} `}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      <input
        ref={inputRef}
        className="hidden"
        type="file"
        accept=".csv,text/csv"
        onChange={handleChange}
      />
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl">
          <div className="text-sm font-semibold uppercase tracking-[0.14em] text-[#0c5d57]">
            Garmin R10 CSV Upload
          </div>
          <div className="mt-2 text-2xl font-semibold tracking-tight text-[#13251f]">
            Drop a session export and let the numbers turn into a coaching story.
          </div>
          <p className="mt-3 text-sm leading-6 text-[#4d6057]">
            Range Whisperer reads the local CSV in the browser, removes Garmin&apos;s
            units row, cleans messy values, flags carry outliers, and builds
            charts, gapping, and practice-ready insights.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <button
            type="button"
            className="rounded-full bg-[#13251f] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#0b1714]"
            onClick={() => inputRef.current?.click()}
          >
            Choose CSV
          </button>
          <div className="text-xs font-medium text-[#5b6a62]">
            Local only. No upload, no cloud, no account.
          </div>
        </div>
      </div>
      {error ? (
        <div className="danger-callout mt-5 rounded-2xl px-4 py-3 text-sm text-[#8a1f1f]">
          {error}
        </div>
      ) : null}
    </div>
  );
}

function ClubSummaryTable({
  clubStats,
  sortKey,
  sortDirection,
  onSort,
  selectedClubs,
  onRowFocus,
}: {
  clubStats: ClubStats[];
  sortKey: string;
  sortDirection: "asc" | "desc";
  onSort: (key: string) => void;
  selectedClubs: string[];
  onRowFocus: (club: string) => void;
}) {
  const sortedStats = useMemo(() => {
    const valueFor = (club: ClubStats) => {
      switch (sortKey) {
        case "club":
          return club.club;
        case "shotCount":
          return club.shotCount;
        case "avgCarry":
          return club.carry.mean ?? -Infinity;
        case "medianCarry":
          return club.carry.median ?? -Infinity;
        case "carryStd":
          return club.carry.stdDev ?? Infinity;
        case "avgTotal":
          return club.totalDistance.mean ?? -Infinity;
        case "avgBallSpeed":
          return club.ballSpeed.mean ?? -Infinity;
        case "avgClubSpeed":
          return club.clubSpeed.mean ?? -Infinity;
        case "avgSmash":
          return club.smashFactor.mean ?? -Infinity;
        case "avgLaunch":
          return club.launchAngle.mean ?? -Infinity;
        case "avgSpin":
          return club.spinRate.mean ?? -Infinity;
        case "avgOffline":
          return club.carryDeviationAbsolute.mean ?? Infinity;
        case "bias":
          return club.carryDeviationSigned.mean ?? 0;
        case "range":
          return club.playableCarryHigh != null && club.playableCarryLow != null
            ? club.playableCarryHigh - club.playableCarryLow
            : Infinity;
        case "consistency":
          return club.consistencyScore ?? -Infinity;
        default:
          return club.carry.median ?? -Infinity;
      }
    };

    return [...clubStats].sort((left, right) => {
      const leftValue = valueFor(left);
      const rightValue = valueFor(right);

      if (typeof leftValue === "string" && typeof rightValue === "string") {
        return sortDirection === "asc"
          ? leftValue.localeCompare(rightValue)
          : rightValue.localeCompare(leftValue);
      }

      return sortDirection === "asc"
        ? Number(leftValue) - Number(rightValue)
        : Number(rightValue) - Number(leftValue);
    });
  }, [clubStats, sortDirection, sortKey]);

  const headers = [
    ["club", "Club"],
    ["shotCount", "Shots"],
    ["avgCarry", "Avg Carry"],
    ["medianCarry", "Median Carry"],
    ["carryStd", "Carry SD"],
    ["avgTotal", "Avg Total"],
    ["avgBallSpeed", "Avg Ball Speed"],
    ["avgClubSpeed", "Avg Club Speed"],
    ["avgSmash", "Avg Smash"],
    ["avgLaunch", "Avg Launch"],
    ["avgSpin", "Avg Spin"],
    ["avgOffline", "Avg Offline"],
    ["bias", "Bias"],
    ["range", "Playable Range"],
    ["consistency", "Consistency"],
  ] as const;

  return (
    <div className="table-wrap rounded-[1.7rem] border border-[#d6d3cb] bg-white/72">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="text-xs uppercase tracking-[0.14em] text-[#52625b]">
            {headers.map(([key, label]) => (
              <th key={key} className="px-4 py-4 font-semibold">
                <button
                  type="button"
                  className="flex items-center gap-2"
                  onClick={() => onSort(key)}
                >
                  {label}
                  {sortKey === key ? <span>{sortDirection === "asc" ? "^" : "v"}</span> : null}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedStats.map((club) => {
            const focused =
              selectedClubs.length === 1 && selectedClubs[0] === club.club;

            return (
              <tr
                key={club.club}
                className={`cursor-pointer border-t border-[#ece6db] transition hover:bg-[#f6f2e9] ${
                  focused ? "bg-[#ebf7f4]" : ""
                }`}
                onClick={() => onRowFocus(club.club)}
              >
                <td className="px-4 py-4 font-semibold text-[#13251f]">{club.club}</td>
                <td className="px-4 py-4 text-sm text-[#40544c]">{club.shotCount}</td>
                <td className="px-4 py-4 text-sm text-[#40544c]">
                  {formatNumber(club.carry.mean)}
                </td>
                <td className="px-4 py-4 text-sm text-[#40544c]">
                  {formatNumber(club.carry.median)}
                </td>
                <td className="px-4 py-4 text-sm text-[#40544c]">
                  {formatNumber(club.carry.stdDev)}
                </td>
                <td className="px-4 py-4 text-sm text-[#40544c]">
                  {formatNumber(club.totalDistance.mean)}
                </td>
                <td className="px-4 py-4 text-sm text-[#40544c]">
                  {formatNumber(club.ballSpeed.mean)}
                </td>
                <td className="px-4 py-4 text-sm text-[#40544c]">
                  {formatNumber(club.clubSpeed.mean)}
                </td>
                <td className="px-4 py-4 text-sm text-[#40544c]">
                  {formatNumber(club.smashFactor.mean, 2)}
                </td>
                <td className="px-4 py-4 text-sm text-[#40544c]">
                  {formatNumber(club.launchAngle.mean)}
                </td>
                <td className="px-4 py-4 text-sm text-[#40544c]">
                  {formatNumber(club.spinRate.mean, 0)}
                </td>
                <td className="px-4 py-4 text-sm text-[#40544c]">
                  {formatNumber(club.carryDeviationAbsolute.mean)}
                </td>
                <td className="px-4 py-4 text-sm text-[#40544c]">
                  {club.biasLabel} ({formatSigned(club.carryDeviationSigned.mean)})
                </td>
                <td className="px-4 py-4 text-sm text-[#40544c]">
                  {club.playableCarryLow != null && club.playableCarryHigh != null
                    ? `${formatNumber(club.playableCarryLow, 0)}-${formatNumber(
                        club.playableCarryHigh,
                        0,
                      )}`
                    : "--"}
                </td>
                <td className="px-4 py-4 text-sm font-semibold text-[#0c5d57]">
                  {formatNumber(club.consistencyScore, 0)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ChartFrame({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="chart-card rounded-[1.8rem] border border-[#dad4c8] bg-white/75 p-5">
      <div className="mb-4">
        <h3 className="text-lg font-semibold tracking-tight text-[#13251f]">{title}</h3>
        <p className="mt-1 text-sm leading-6 text-[#54655d]">{description}</p>
      </div>
      <div className="h-[280px]">{children}</div>
    </div>
  );
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: string | number; payload?: Record<string, unknown> }>;
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-2xl border border-[#d7d1c6] bg-white/95 px-3 py-2 text-sm shadow-lg">
      {label != null ? <div className="font-semibold text-[#13251f]">{label}</div> : null}
      <div className="mt-2 space-y-1">
        {payload.map((item, index) => (
          <div key={`${item.name}-${index}`} className="text-[#495c54]">
            <span className="font-medium text-[#13251f]">{item.name}:</span>{" "}
            {typeof item.value === "number" ? item.value.toFixed(1) : item.value}
          </div>
        ))}
      </div>
    </div>
  );
}

function ChartsPanel({
  analysis,
  summaryMetric,
  selectedClub,
}: {
  analysis: SessionAnalysis;
  summaryMetric: SummaryMetric;
  selectedClub: string | null;
}) {
  const histogramData: HistogramBin[] = useMemo(() => {
    if (!selectedClub) return [];
    return buildHistogram(analysis.filteredShots, selectedClub);
  }, [analysis.filteredShots, selectedClub]);

  const carryLabel = summaryMetric === "mean" ? "Average carry" : "Median carry";
  const clubs = [...new Set(analysis.carryChart.map((item) => item.club))];

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <ChartFrame
        title="Carry Distance By Club"
        description={`Sorted by ${carryLabel.toLowerCase()} so you can read the session like a real gapping ladder.`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={analysis.carryChart}>
            <CartesianGrid stroke="rgba(19,37,31,0.08)" vertical={false} />
            <XAxis dataKey="club" tick={{ fill: "#40544c", fontSize: 12 }} />
            <YAxis tick={{ fill: "#40544c", fontSize: 12 }} unit=" yds" />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="value" name={carryLabel} radius={[12, 12, 0, 0]}>
              {analysis.carryChart.map((entry) => (
                <Cell key={entry.club} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartFrame>

      <ChartFrame
        title="Club Gapping Ladder"
        description="A quick read on whether clubs separate cleanly or start to step on each other."
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={analysis.carryChart}>
            <CartesianGrid stroke="rgba(19,37,31,0.08)" vertical={false} />
            <XAxis dataKey="club" tick={{ fill: "#40544c", fontSize: 12 }} />
            <YAxis tick={{ fill: "#40544c", fontSize: 12 }} unit=" yds" />
            <Tooltip content={<CustomTooltip />} />
            <Line
              type="monotone"
              dataKey="value"
              name={carryLabel}
              stroke="#13251f"
              strokeWidth={3}
              dot={{ r: 5, fill: "#0f766e" }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartFrame>

      <ChartFrame
        title="Dispersion Scatter"
        description="Carry distance against offline carry miss. The zero line is your target line."
      >
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart>
            <CartesianGrid stroke="rgba(19,37,31,0.08)" />
            <XAxis
              type="number"
              dataKey="carryDeviationDistance"
              name="Offline"
              tick={{ fill: "#40544c", fontSize: 12 }}
              unit=" yds"
            />
            <YAxis
              type="number"
              dataKey="carryDistance"
              name="Carry"
              tick={{ fill: "#40544c", fontSize: 12 }}
              unit=" yds"
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine x={0} stroke="#b45309" strokeDasharray="4 4" />
            <Legend />
            {clubs.map((club) => (
              <Scatter
                key={club}
                name={club}
                data={analysis.dispersionPoints.filter((point) => point.club === club)}
                fill={
                  analysis.dispersionPoints.find((point) => point.club === club)?.color ??
                  "#0f766e"
                }
              />
            ))}
          </ScatterChart>
        </ResponsiveContainer>
      </ChartFrame>

      <ChartFrame
        title="Ball Speed Vs Carry"
        description="A simple read on how efficiently extra speed is turning into distance."
      >
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart>
            <CartesianGrid stroke="rgba(19,37,31,0.08)" />
            <XAxis
              type="number"
              dataKey="ballSpeed"
              name="Ball speed"
              tick={{ fill: "#40544c", fontSize: 12 }}
              unit=" mph"
            />
            <YAxis
              type="number"
              dataKey="carryDistance"
              name="Carry"
              tick={{ fill: "#40544c", fontSize: 12 }}
              unit=" yds"
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            {clubs.map((club) => (
              <Scatter
                key={club}
                name={club}
                data={analysis.ballSpeedCarryPoints.filter((point) => point.club === club)}
                fill={
                  analysis.ballSpeedCarryPoints.find((point) => point.club === club)?.color ??
                  "#0f766e"
                }
              />
            ))}
          </ScatterChart>
        </ResponsiveContainer>
      </ChartFrame>

      <ChartFrame
        title={`Carry Histogram${selectedClub ? ` | ${selectedClub}` : ""}`}
        description="How tightly the selected club clusters around its typical carry."
      >
        {selectedClub && histogramData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={histogramData}>
              <CartesianGrid stroke="rgba(19,37,31,0.08)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: "#40544c", fontSize: 12 }} />
              <YAxis tick={{ fill: "#40544c", fontSize: 12 }} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="count" name="Shots" fill="#0f766e" radius={[10, 10, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center rounded-[1.4rem] border border-dashed border-[#d3ccbf] bg-[#f9f5ed] text-sm text-[#56675f]">
            Focus a single club to see its carry distribution.
          </div>
        )}
      </ChartFrame>

      <ChartFrame
        title="Shot Order Trend"
        description="A quick scan for drift in carry and ball speed as the session progresses."
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={analysis.trendPoints}>
            <CartesianGrid stroke="rgba(19,37,31,0.08)" vertical={false} />
            <XAxis dataKey="shotNumber" tick={{ fill: "#40544c", fontSize: 12 }} />
            <YAxis
              yAxisId="carry"
              tick={{ fill: "#40544c", fontSize: 12 }}
              unit=" yds"
            />
            <YAxis
              yAxisId="speed"
              orientation="right"
              tick={{ fill: "#7b4b11", fontSize: 12 }}
              unit=" mph"
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Line
              yAxisId="carry"
              type="monotone"
              dataKey="carryDistance"
              name="Carry"
              stroke="#0f766e"
              strokeWidth={3}
              dot={false}
            />
            <Line
              yAxisId="speed"
              type="monotone"
              dataKey="ballSpeed"
              name="Ball speed"
              stroke="#d97706"
              strokeWidth={2.5}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartFrame>
    </div>
  );
}

export function RangeWhispererApp() {
  const [session, setSession] = useState<ParsedSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [excludeOutliers, setExcludeOutliers] = useState(true);
  const [summaryMetric, setSummaryMetric] = useState<SummaryMetric>("median");
  const [selectedClubs, setSelectedClubs] = useState<string[]>([]);
  const [sortKey, setSortKey] = useState("medianCarry");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(PREFS_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored) as {
        excludeOutliers?: boolean;
        summaryMetric?: SummaryMetric;
      };
      if (typeof parsed.excludeOutliers === "boolean") {
        setExcludeOutliers(parsed.excludeOutliers);
      }
      if (parsed.summaryMetric === "mean" || parsed.summaryMetric === "median") {
        setSummaryMetric(parsed.summaryMetric);
      }
    } catch {
      // Ignore broken local prefs.
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({ excludeOutliers, summaryMetric }),
    );
  }, [excludeOutliers, summaryMetric]);

  const analysis = useMemo(() => {
    if (!session) return null;
    const clubsToUse = selectedClubs.length > 0 ? selectedClubs : session.detectedClubs;
    return analyzeSession(session, {
      selectedClubs: clubsToUse,
      excludeOutliers,
      summaryMetric,
    });
  }, [excludeOutliers, selectedClubs, session, summaryMetric]);

  const activeHistogramClub =
    selectedClubs.length === 1
      ? selectedClubs[0]
      : analysis?.clubStats.find((club) => club.shotCount > 0)?.club ?? null;

  const handleFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("Please choose a Garmin CSV export.");
      return;
    }

    try {
      const text = await file.text();
      const parsed = parseGarminCsv(text, file.name);
      setSession(parsed);
      setSelectedClubs(parsed.detectedClubs);
      setError(null);
    } catch (caught) {
      const message =
        caught instanceof Error
          ? caught.message
          : "Something went wrong while reading the CSV.";
      setError(message);
      setSession(null);
      setSelectedClubs([]);
    }
  };

  const toggleClub = (club: string) => {
    setSelectedClubs((current) => {
      if (current.includes(club)) {
        return current.length === 1 ? current : current.filter((item) => item !== club);
      }
      return [...current, club];
    });
  };

  const setSingleClubFocus = (club: string) => {
    setSelectedClubs([club]);
  };

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDirection(key === "club" ? "asc" : "desc");
  };

  return (
    <main className="shell">
      <div className="mx-auto max-w-[1500px] px-5 py-8 md:px-8 lg:px-10">
        <section className="section-card relative overflow-hidden rounded-[2.4rem] px-6 py-7 md:px-8 md:py-9">
          <div className="absolute right-0 top-0 h-44 w-44 rounded-full bg-[radial-gradient(circle,_rgba(15,118,110,0.18),_transparent_68%)]" />
          <span className="eyebrow">Range Whisperer</span>
          <div className="mt-6 grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
            <div>
              <h1 className="serif max-w-4xl text-[2.7rem] font-semibold leading-[1.05] tracking-tight text-[#13251f] md:text-[4rem]">
                A local coaching dashboard for Garmin R10 range sessions.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-[#42544d]">
                Upload one CSV, clean the messy export automatically, and read the
                session through carry control, gapping, dispersion, and practical
                next-step coaching notes.
              </p>
            </div>
            <div className="rounded-[2rem] border border-white/65 bg-white/55 p-5">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#0c5d57]">
                Built for local use
              </div>
              <div className="mt-4 grid gap-3">
                {[
                  "Removes Garmin's units row before analysis",
                  "Uses Club Type first when Club Name is blank",
                  "Flags carry outliers without deleting rows",
                  "Generates grounded coaching insights from the uploaded data",
                ].map((item) => (
                  <div
                    key={item}
                    className="rounded-2xl border border-[#e7e1d7] bg-white/70 px-4 py-3 text-sm text-[#42544d]"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="mt-6">
          <UploadZone onFile={handleFile} error={error} compact={Boolean(session)} />
        </section>

        {!session || !analysis ? (
          <section className="mt-6 grid gap-6 lg:grid-cols-[1fr_1fr]">
            <div className="section-card rounded-[2rem] p-6">
              <SectionHeader
                eyebrow="What You Get"
                title="From raw launch monitor rows to a practice plan"
                description="This benchmark build is designed to feel like a premium solo coaching tool rather than a generic spreadsheet viewer."
              />
              <div className="grid gap-4 md:grid-cols-2">
                {[
                  {
                    title: "Reliable parsing",
                    body: "Units rows, blank club names, partial rows, and malformed numbers are handled without crashing the session.",
                  },
                  {
                    title: "Explainable outliers",
                    body: "Carry outliers are detected within each club using an IQR rule and can be included or excluded on demand.",
                  },
                  {
                    title: "Golf-aware club order",
                    body: "Clubs are sorted by session carry first, with a known golf order as fallback.",
                  },
                  {
                    title: "Actionable insights",
                    body: "The app turns variability, overlap, bias, and session drift into practical next steps without pretending to diagnose your swing.",
                  },
                ].map((item) => (
                  <div
                    key={item.title}
                    className="rounded-[1.4rem] border border-[#e6dfd4] bg-white/72 p-5"
                  >
                    <h3 className="text-lg font-semibold tracking-tight text-[#13251f]">
                      {item.title}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-[#50625a]">{item.body}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="section-card rounded-[2rem] p-6">
              <SectionHeader
                eyebrow="Expected CSV Shape"
                title="Optimized for Garmin R10 range exports"
                description="The parser expects the Garmin export pattern shown in your sample and safely falls back when values are blank or malformed."
              />
              <div className="space-y-3 text-sm leading-6 text-[#4a5b54]">
                <div className="soft-callout rounded-2xl px-4 py-3">
                  First data row can be a units row like <code>[mph]</code>,{" "}
                  <code>[deg]</code>, and <code>[yds]</code>. It is removed before
                  any stats are computed.
                </div>
                <div className="soft-callout rounded-2xl px-4 py-3">
                  Canonical club label uses <code>Club Type</code>, then falls back to{" "}
                  <code>Club Name</code>, then <code>Unknown Club</code>.
                </div>
                <div className="soft-callout rounded-2xl px-4 py-3">
                  Rows with no usable shot metrics are skipped quietly instead of
                  poisoning the analysis.
                </div>
              </div>
            </div>
          </section>
        ) : (
          <>
            <section className="mt-6 section-card rounded-[2rem] p-6">
              <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
                <div>
                  <span className="eyebrow">Session Header</span>
                  <h2 className="mt-4 text-2xl font-semibold tracking-tight text-[#13251f]">
                    {session.fileName}
                  </h2>
                  <div className="mt-4 flex flex-wrap gap-3 text-sm text-[#42554d]">
                    <span className="rounded-full bg-white/70 px-4 py-2">
                      {analysis.overview.totalShots} valid shots
                    </span>
                    <span className="rounded-full bg-white/70 px-4 py-2">
                      Player: {session.playerNames[0] ?? "Unavailable"}
                    </span>
                    <span className="rounded-full bg-white/70 px-4 py-2">
                      {formatDateRange(session)}
                    </span>
                    <span className="rounded-full bg-white/70 px-4 py-2">
                      Clubs: {session.detectedClubs.join(", ")}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    className="rounded-full border border-[#cfd6d0] bg-white/75 px-4 py-2 text-sm font-semibold text-[#13251f]"
                    onClick={() => exportMarkdown(session, analysis)}
                  >
                    Export markdown summary
                  </button>
                  <button
                    type="button"
                    className="rounded-full border border-[#cfd6d0] bg-white/75 px-4 py-2 text-sm font-semibold text-[#13251f]"
                    onClick={() => setSelectedClubs(session.detectedClubs)}
                  >
                    Reset to all clubs
                  </button>
                </div>
              </div>

              {session.warnings.length > 0 ? (
                <div className="warning-callout mt-5 rounded-[1.4rem] p-4">
                  <div className="text-sm font-semibold text-[#8b5e11]">Parse notes</div>
                  <ul className="mt-2 space-y-1 pl-5 text-sm text-[#745316]">
                    {session.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>

            <section className="mt-6 section-card rounded-[2rem] p-6">
              <SectionHeader
                eyebrow="Controls"
                title="Filter the session without losing the story"
                description="Keep all clubs in view or narrow the dashboard to the clubs that matter right now."
              />
              <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex flex-wrap gap-2">
                  {session.detectedClubs.map((club) => (
                    <button
                      key={club}
                      type="button"
                      className="pill-button rounded-full px-4 py-2 text-sm font-semibold"
                      data-active={selectedClubs.includes(club)}
                      onClick={() => toggleClub(club)}
                    >
                      {club}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="pill-button flex cursor-pointer items-center gap-3 rounded-full px-4 py-2 text-sm font-semibold">
                    <input
                      className="accent-[#0f766e]"
                      type="checkbox"
                      checked={excludeOutliers}
                      onChange={(event) => setExcludeOutliers(event.target.checked)}
                    />
                    Exclude carry outliers
                  </label>

                  <div className="pill-button flex items-center gap-3 rounded-full px-4 py-2 text-sm font-semibold">
                    <label htmlFor="summary-metric">Club summary metric</label>
                    <select
                      id="summary-metric"
                      className="bg-transparent text-sm outline-none"
                      value={summaryMetric}
                      onChange={(event) =>
                        setSummaryMetric(event.target.value as SummaryMetric)
                      }
                    >
                      <option value="median">Median</option>
                      <option value="mean">Average</option>
                    </select>
                  </div>
                </div>
              </div>
              <p className="mt-4 text-sm leading-6 text-[#50625a]">
                {excludeOutliers
                  ? `Outliers are currently excluded from summaries and charts, but still counted for context (${analysis.overview.outlierCount} flagged shot${analysis.overview.outlierCount === 1 ? "" : "s"}).`
                  : "Outliers are currently included, so extreme carries can influence averages and dispersion visuals."}
              </p>
            </section>

            <section className="mt-6">
              <SectionHeader
                eyebrow="Overview"
                title="Session Overview"
                description="High-level reads that tell you whether the session was clean, wide, fast, or drifting."
              />
              <div className="grid-auto">
                <StatCard
                  label="Total Shots"
                  value={`${analysis.overview.totalShots}`}
                  hint={`${analysis.overview.outlierCount} flagged outlier${analysis.overview.outlierCount === 1 ? "" : "s"} in selection`}
                />
                <StatCard
                  label="Clubs Used"
                  value={`${analysis.overview.clubsUsed}`}
                  hint={selectedClubs.length === session.detectedClubs.length ? "All detected clubs selected" : `${selectedClubs.length} club filter active`}
                />
                <StatCard
                  label="Average Carry"
                  value={`${formatNumber(analysis.overview.avgCarry)} yds`}
                />
                <StatCard
                  label="Average Total"
                  value={`${formatNumber(analysis.overview.avgTotal)} yds`}
                />
                <StatCard
                  label="Average Ball Speed"
                  value={`${formatNumber(analysis.overview.avgBallSpeed)} mph`}
                />
                <StatCard
                  label="Average Club Speed"
                  value={`${formatNumber(analysis.overview.avgClubSpeed)} mph`}
                />
                <StatCard
                  label="Average Smash"
                  value={formatNumber(analysis.overview.avgSmashFactor, 2)}
                  hint="Ball speed divided by club speed"
                />
                <StatCard
                  label="Average Offline"
                  value={`${formatNumber(analysis.overview.avgAbsoluteCarryDeviation)} yds`}
                  hint="Absolute carry deviation distance"
                />
                <StatCard
                  label="Most Consistent Club"
                  value={analysis.overview.mostConsistentClub ?? "--"}
                />
                <StatCard
                  label="Widest Dispersion Club"
                  value={analysis.overview.widestDispersionClub ?? "--"}
                />
              </div>
            </section>

            <section className="mt-8 section-card rounded-[2rem] p-6">
              <SectionHeader
                eyebrow="Club Table"
                title="Per-Club Summary"
                description="Click a row to focus the dashboard on one club. Sort any column to find the most stable, fastest, or widest pattern."
              />
              <ClubSummaryTable
                clubStats={analysis.clubStats}
                sortKey={sortKey}
                sortDirection={sortDirection}
                onSort={handleSort}
                selectedClubs={selectedClubs}
                onRowFocus={setSingleClubFocus}
              />
            </section>

            <section className="mt-8 section-card rounded-[2rem] p-6">
              <SectionHeader
                eyebrow="Visuals"
                title="Charts That Explain the Session"
                description="These visuals are tuned to answer practical golf questions: how far, how wide, how separated, and whether the session changed over time."
              />
              <ChartsPanel
                analysis={analysis}
                summaryMetric={summaryMetric}
                selectedClub={activeHistogramClub}
              />
            </section>

            <section className="mt-8 section-card rounded-[2rem] p-6">
              <SectionHeader
                eyebrow="Coaching Insights"
                title="What the session is actually telling you"
                description="These notes are grounded in the uploaded data and intentionally avoid pretending they reveal exact swing mechanics."
              />
              <div className="grid gap-4 lg:grid-cols-2">
                {analysis.insights.map((insight) => (
                  <InsightCard key={insight.id} insight={insight} />
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
