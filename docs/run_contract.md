# Repeatable cell runs

The engine advances on a 250 ms logical clock. Display speed changes how often a scan is requested; it does not change the simulation's integration interval. A run contains the initial recipe, ordered operator commands, duration and bookmarks. Replaying those inputs rebuilds packages, counters, alarms and outputs. Imported counters and screenshots are never trusted as simulation results.

Run format `schemaVersion: 1`, `engineVersion: 2` supports ten minutes (2,400 scans), 4,000 commands and 50 bookmarks. Recipe format `schemaVersion: 1` supports at most 100 scheduled events. Input bounds prevent oversized replay work and station-skipping conveyor speeds. Unknown versions, invalid numbers, unsupported commands and unordered/future command times are rejected before replacing saved work.

## Recovery semantics

Emergency Stop is a physical input separate from the reset latch. Start cannot release either. Release the button, clear the physical fault, press Reset, wait for recovery, then explicitly Start. Manual jog and reject commands obey the same interlocks and are cleared on a trip. Stop and mode changes immediately remove output commands, even when the logical clock is paused; neither can cancel an unfinished recovery delay. Manual jogging holds uninspected products at inspection and rejected products at the diverter until a valid decision and gate actuation complete. Every created product remains in the cell or has a recorded completion. Acknowledging an alarm changes only its acknowledgement state.

Scheduled faults expire or can be cleared by an explicit simulated repair action. Expiry does not restart the conveyor. A slow-actuator event modifies transport speed and inspection dwell; the sensor diagnostic allows the longer expected residence time. This software model is an educational demonstration, not a safety-certified machine controller.

## Production accounting

Start opens the planned production window and Stop closes it. A fault leaves that window scheduled, so waiting for clearance, reset, recovery and restart counts as unplanned downtime. Declared maintenance-stop intervals are excluded from planned production and counted separately. Manual operation during a scheduled window is downtime. Startup and normal inspection/reject dwell belong to operating time and reduce performance through actual output rate.

Availability is operating time divided by planned production time. Performance compares ideal cycle time times completed parts with operating time, capped at 100%. Quality is good parts divided by completed parts. OEE is their product. No scheduled time yields zero availability/OEE. Throughput uses total elapsed run time and includes idle time; it is distinct from the OEE denominator. Events are sampled at the start of each 250 ms interval. An event covering [10 s, 12 s) affects exactly eight scans, including a one-scan event when duration is 250 ms.

Comparisons run both recipes for equal scan counts under the same explicit automatic reset/restart policy. Each returned comparison run includes those commands and can be replayed independently. State residence time identifies an observed hold; it alone does not establish a causal bottleneck. The interactive operator run never silently applies that comparison policy. Two additional controlled experiments increase nominal speed by 25% (capped at 30 units/s) and remove scheduled disturbances. Their full command logs are exported alongside the baseline and candidate. Changes in good output and downtime describe this finite simulation, not a real-machine improvement. The dedicated comparison timeline reconstructs both trajectories at the same logical timestamp.

## External inspection interface

Set recipe `inspectionMode` to `external` to require a versioned result at the inspection station. Omitted mode means the documented seeded simulation model. The result fields are:

```json
{
  "schemaVersion": 1,
  "eventId": "fixture-event-001",
  "frameId": "fixture-frame-001",
  "packageId": 1,
  "capturedAtMs": 4000,
  "decision": "reject",
  "score": 0.94
}
```

Times use the run's logical millisecond clock. The package must be waiting at the inspection station, the capture cannot precede its creation or lie in the future, and result age cannot exceed 2.5 seconds. Score is a model-provided value in [0,1], not a calibrated probability. Repeated identical event IDs are ignored; conflicting IDs, reused frame IDs and invalid package IDs are rejected. Accepted results are retained in the run and determine the actual diverter decision.

A missing result faults the cell after the inspection timeout. It never becomes an automatic accept. Supply a valid current result, Reset and Start to recover. The bundled fixture is synthetic protocol data, not evidence of an attached camera or FPGA. The full producer-to-cell adapter is versioned separately.
