# OEE Metrics

OEE is calculated from availability, performance, and quality.

## Formulas

Availability:

```text
operating time / planned runtime
```

Performance:

```text
ideal cycle time * total completed parts / operating time
```

Quality:

```text
good parts / total completed parts
```

Overall OEE:

```text
availability * performance * quality
```

## Runtime Terms

- Planned runtime: time inside the production window opened by Start and closed by Stop, excluding declared planned-maintenance intervals.
- Operating time: planned runtime minus unplanned downtime.
- Unplanned downtime: time spent blocked, faulted, recovering, in manual mode, or awaiting an explicit restart while production remains scheduled.
- Ideal cycle time: configured target package cycle time.
- Actual cycle time: operating time divided by completed parts.

No scheduled production time yields zero availability/OEE. Throughput uses the entire elapsed run duration, including unscheduled idle time. See [the run contract](run_contract.md) for scan boundary and recovery semantics.

## Maintenance Approximations

MTBF is estimated as operating time divided by fault occurrences. MTTR is estimated as downtime divided by recovery events. These are simplified but useful for showing how machine data supports maintenance planning.
