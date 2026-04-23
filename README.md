# Range Whisperer

Range Whisperer is a local-only Next.js web app for Garmin R10 driving range session exports. Upload one CSV in the browser and it will clean the data, compute per-club stats, visualize carry and dispersion, and generate practical coaching insights from the session.

## Run locally

```bash
npm install
npm run dev
```

Then open the local URL shown by Next.js in your browser.

## What the app does

- Accepts a Garmin R10 CSV export in the browser
- Removes the Garmin units row before analysis
- Prefers `Club Type` over `Club Name` when building the canonical club label
- Safely converts numeric strings to numbers and treats blanks as `null`
- Skips rows that do not contain meaningful shot metrics
- Flags carry outliers within each club using an IQR rule
- Builds overview cards, per-club summaries, charts, gapping analysis, and coaching insights

## Parser notes

The CSV parser is built around the Garmin export shape from the provided sample:

- Headers are trimmed
- Values are trimmed
- The first non-empty data row is checked for unit tokens like `[mph]` and `[yds]`
- That units row is removed before any stats are computed
- Numeric-looking columns are parsed safely
- Malformed numeric values are treated as blank instead of crashing the app
- A canonical `club` field is derived from `Club Type`, then `Club Name`, then `Unknown Club`
- Original row values are preserved on each parsed shot for debugging context

## Outlier handling

Outliers are not deleted from the source data. Instead, the app:

- Groups shots by club
- Looks at `Carry Distance` inside each club
- Uses an interquartile range envelope (`Q1 - 1.5 * IQR`, `Q3 + 1.5 * IQR`)
- Flags shots outside that range as carry outliers
- Lets you include or exclude those shots from summaries and charts with a toggle

This keeps the method explainable and lets you compare "raw session" versus "cleaner stock pattern" views.

## Coaching insight logic

The coaching panel is generated from the real uploaded metrics. Insights are assembled from:

- Carry variability and playable carry range
- Lateral miss width and signed left/right bias
- Smash factor and ball speed stability
- Gapping overlap and unusually large club gaps
- Early-session versus late-session drift
- Outlier frequency within the selected session view

The wording stays practical and probabilistic on purpose. It points to likely training priorities without claiming exact swing faults.
