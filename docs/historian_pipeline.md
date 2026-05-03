# Python SQLite Historian Pipeline

The dashboard remains a static React/Vite site. A small Python pipeline can generate a sample SQLite historian, run SQL analysis, and export static JSON/CSV files that GitHub Pages can serve from `public/data/`.

## Files

- `analytics/historian/schema.sql`: SQLite tables, indexes, and the `oee_shift_summary` view.
- `analytics/historian/queries.sql`: reusable analysis queries for OEE, alarm downtime, and latest tags.
- `analytics/historian/pipeline.py`: deterministic sample-data generator and static exporter.
- `examples/packaging_cell_historian.sqlite`: generated sample SQLite historian.
- `examples/sql_analysis_results.json`: generated query output for inspection.
- `public/data/historian_summary.json`: dashboard-ready JSON used by the Production Report screen.
- `public/data/oee_trend.csv`, `public/data/alarm_events.csv`, `public/data/tag_snapshot.csv`: static CSV exports.

## Run Locally

```bash
npm run data:historian
npm run test:py
npm run build
```

The Python pipeline uses only the standard library. No Python package install is required.

## Data Shape

The generated historian models a three-hour packaging-cell shift with 10-second scan samples. It includes scan states, production counts, tag samples, alarm events, OEE samples, downtime reasons, motor current, and quality drift.

The static dashboard JSON includes:

- `metadata`: run identifier, line name, scenario, generation time, and SQLite file path.
- `kpis`: good count, reject count, total count, OEE components, downtime, and throughput.
- `oeeTrend`: trend points sampled every five minutes.
- `alarms`: alarm event timeline with severity and duration.
- `downtimeReasons`: aggregated downtime by reason.
- `tagSnapshot`: latest tag values.
- `recentScans`: latest scan records.

## Static Hosting

`public/data/` is copied into `dist/data/` during `vite build`, so the JSON/CSV files are served as static assets. The app fetches `data/historian_summary.json` through the configured Vite base path, which keeps relative-path GitHub Pages deployment behavior intact.
