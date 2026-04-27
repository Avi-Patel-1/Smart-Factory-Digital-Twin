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

- Planned runtime: elapsed simulation runtime.
- Operating time: planned runtime minus unplanned downtime.
- Unplanned downtime: time spent blocked, faulted, or recovering while production is expected.
- Ideal cycle time: configured target package cycle time.
- Actual cycle time: operating time divided by completed parts.

## Maintenance Approximations

MTBF is estimated as operating time divided by fault occurrences. MTTR is estimated as downtime divided by recovery events. These are simplified but useful for showing how machine data supports maintenance planning.
