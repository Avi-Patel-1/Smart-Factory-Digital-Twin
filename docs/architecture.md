# Architecture

The project models a packaging cell as a static browser application. It does not require a backend service, which keeps it suitable for GitHub Pages.

## Layers

1. Field devices: photoeyes, motor drive feedback, reject cylinder, air permissive, and package presence.
2. PLC: scan-cycle logic, state machine, timers, counters, alarms, and outputs.
3. HMI: operator controls, instructions, alarm handling, and live status.
4. SCADA: line-level visibility through the same tag model used by the HMI.
5. Historian/database: trend points and sensor transitions held in browser state for the current session.
6. Edge analytics: OEE, throughput, reject rate, downtime, MTBF, and MTTR calculations.
7. Dashboards: production, quality, and maintenance views.
8. Business decision layer: maintenance timing, throughput planning, and quality containment.

## Sensor to Decision Flow

Field inputs become PLC tags. Tags drive HMI status, alarm banners, and trend points. Downtime and part counts become OEE components. Recurring alarms and sensor dwell patterns become maintenance recommendations.

## Why This Matters

Automation data is useful when it joins machine state, product movement, quality outcomes, and fault context. A jam count alone is not enough. A useful system shows when the jam occurred, which sensor stayed blocked, how long the machine was down, and how the event affected availability and throughput.
