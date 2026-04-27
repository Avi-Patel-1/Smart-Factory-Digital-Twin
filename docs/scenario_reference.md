# Scenario Reference

All scenarios are deterministic and repeatable.

## Normal Production

Low reject rate with no scheduled fault. Use it as the baseline for expected flow and OEE behavior.

## High Reject Rate

Inspection rejects a higher portion of product. Availability can remain strong while quality and OEE fall.

## Frequent Infeed Jams

Scheduled infeed blocks create downtime and jam counts. The infeed sensor and alarm history should clearly show the loss.

## Motor Overload Event

A scheduled motor overload raises `ALM_MOTOR_OVERLOAD` after the overload delay and drives the cell to fault state.

## Stuck Photoeye

The inspection presence signal remains true long enough to trigger `ALM_SENSOR_STUCK`.

## Reject Gate Failure

Reject command occurs while the diverter is unavailable. The cell faults to protect quality containment.

## Maintenance Recovery

The cell experiences a short stop and recovery sequence. Use it to explain MTTR and recovery behavior.

## Quality Drift

Reject probability increases over runtime. The reject rate and quality OEE component should degrade visibly.
