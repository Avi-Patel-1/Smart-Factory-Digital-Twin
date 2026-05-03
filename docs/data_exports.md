# Data Exports

The Production Report screen exports the current session state.

## Alarm History CSV

Includes timestamp, tag, message, severity, active state, acknowledged state, root cause hint, recovery steps, and machine-state effect.

## Production Summary CSV

Includes scenario, runtime, counts, OEE components, downtime, and throughput.

## Tag Snapshot JSON

Includes tag name, type, value, source, description, last-changed time, and quality.

## OEE Report JSON

Includes counts, OEE components, downtime reasons, motor runtime, jam count, MTBF, and MTTR.

## Scenario Report Markdown

Includes the active scenario, runtime, machine state, counts, OEE, active alarms, and recommended action.

Sample files are in `examples/`.

## Static Historian Exports

The Python pipeline writes dashboard-ready artifacts that are served with the static site:

- `public/data/historian_summary.json`
- `public/data/oee_trend.csv`
- `public/data/alarm_events.csv`
- `public/data/tag_snapshot.csv`

Run `npm run data:historian` to regenerate them from `examples/packaging_cell_historian.sqlite`. The SQL source files are in `analytics/historian/schema.sql` and `analytics/historian/queries.sql`.
