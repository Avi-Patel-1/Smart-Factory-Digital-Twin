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
