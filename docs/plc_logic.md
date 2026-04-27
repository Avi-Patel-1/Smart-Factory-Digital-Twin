# PLC Logic

The simulation uses a deterministic scan-cycle model. Each scan advances by the configured scan time and processes the same phases in the same order.

## Scan Phases

1. Read inputs: package positions, scenario events, forced sensors, and mode state.
2. Run state machine: choose the next machine state.
3. Update timers/counters: dwell timers, overload delay, sensor stuck timer, part counts, faults, and downtime.
4. Update outputs: motor command, reject cylinder, alarm bits, count tags, and OEE tags.
5. Log historian data: trend samples and sensor transition events.

## States

- `stopped`: safe state after stop.
- `idle`: ready but not running.
- `starting`: start permissive delay.
- `infeed`: package entering the cell.
- `index conveyor`: package moving between stations.
- `inspect`: conveyor held while inspection dwell completes.
- `accept`: accepted package moving toward discharge.
- `reject`: reject diverter actuation.
- `discharge`: accepted package leaving the cell.
- `blocked`: recoverable interruption such as jam or stuck photoeye.
- `fault`: severe event such as overload, low air, E-Stop, or reject failure.
- `recovery`: reset delay before the cell returns to ready state.

## Timers

- Infeed timeout
- Inspection dwell
- Reject actuation time
- Motor overload delay
- Sensor stuck timer
- Recovery timer

## Counters

- Good parts
- Rejects
- Total parts
- Faults by type
- Downtime seconds
- Jam count
- Motor runtime

## Tag Examples

- `MTR_CONV_RUN`
- `MTR_CONV_FAULT`
- `PE_INFEED_BLOCKED`
- `PE_INSPECTION_PRESENT`
- `PE_EXIT_BLOCKED`
- `CYL_REJECT_EXT`
- `ALM_JAM_INFEED`
- `ALM_MOTOR_OVERLOAD`
- `ALM_SENSOR_STUCK`
- `CNT_GOOD_PARTS`
- `CNT_REJECTS`
- `STATE_MACHINE`
- `OEE_AVAILABILITY`
- `OEE_PERFORMANCE`
- `OEE_QUALITY`
