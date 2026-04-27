# Smart Factory Digital Twin & PLC/HMI Demonstrator

Browser-based smart factory demonstrator for a simulated packaging cell. The app runs as a static Vite site and includes PLC-style scan logic, live HMI screens, a digital twin, alarms, trends, maintenance views, tag browsing, manual controls, production reports, and exportable data.

## Live Demo

https://avi-patel-1.github.io/Smart-Factory-Digital-Twin/
## Quickstart

```bash
npm install
npm run dev
npm run build
npm run test
npm run preview
```

## What It Shows

- Deterministic PLC scan phases: read inputs, run state machine, update timers/counters, update outputs, and log historian data.
- Packaging-cell states: stopped, idle, starting, infeed, index conveyor, inspect, accept, reject, discharge, blocked, fault, and recovery.
- Live tags such as `MTR_CONV_RUN`, `PE_INFEED_BLOCKED`, `CYL_REJECT_EXT`, `ALM_JAM_INFEED`, `CNT_GOOD_PARTS`, and `OEE_OVERALL`.
- Scenario presets for normal production, high reject rate, infeed jams, motor overload, stuck photoeye, reject gate failure, maintenance recovery, and quality drift.
- OEE breakdown with availability, performance, quality, planned runtime, unplanned downtime, ideal cycle time, actual cycle time, MTBF, and MTTR.
- CSV, JSON, and Markdown export buttons for alarm history, production summaries, tag snapshots, OEE reports, and scenario reports.

## Screens

- HMI Overview: start, stop, E-Stop, reset, auto/manual mode, status, counts, alarms, and operator instructions.
- Digital Twin View: live packaging-cell diagram with conveyor, sensors, inspection, reject diverter, drive, PLC, HMI/SCADA, edge analytics, and moving packages.
- Alarms Screen: active, acknowledged, and cleared alarm history with root cause hints and recovery steps.
- Trends Screen: cycle time, throughput, OEE, reject rate, downtime, motor current, and sensor event timeline.
- Maintenance Screen: motor runtime, jam count, MTBF, MTTR, recommendations, fault history, and sensor health.
- Tag Browser: searchable tag table with value, source, description, last-changed time, and quality.
- Manual Controls: jog conveyor, force sensors, toggle reject gate, step one PLC scan, pause, continue, and speed control.
- Production Report: shift summary, OEE breakdown, downtime reasons, quality summary, and exports.
- Architecture and Methodology: plain-language explanation of the automation data path and OEE formulas.

## Architecture Overview

The simulated field devices feed PLC tags. The PLC scan evaluates state logic, timers, counters, alarms, and output commands. HMI/SCADA screens display the live tag state. Historian points and sensor transitions support trends, while edge calculations turn downtime, throughput, and quality data into OEE and maintenance indicators.

More detail is in `docs/architecture.md`, `docs/plc_logic.md`, and `docs/oee_metrics.md`.

## GitHub Pages Deployment

This project includes `.github/workflows/deploy.yml`. Push the project to a GitHub repository with Pages enabled for GitHub Actions, then run the workflow or push to `main`.

The Vite config uses `base: './'` so built assets resolve from a static Pages path without hardcoding a repository name. If a deployment target requires an absolute base path, update `base` in `vite.config.ts` and rebuild.

See `docs/deployment.md` for command details.

## Documentation

- `docs/architecture.md`
- `docs/plc_logic.md`
- `docs/oee_metrics.md`
- `docs/hmi_screens.md`
- `docs/scenario_reference.md`
- `docs/deployment.md`
- `docs/data_exports.md`

## License

MIT License. See `LICENSE`.
