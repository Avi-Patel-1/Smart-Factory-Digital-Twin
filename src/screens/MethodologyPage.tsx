import { getScanConstants } from '../plc/scanCycle'
import { DataTable } from '../components/DataTable'
import { formatDuration } from '../utils/format'

export function MethodologyPage() {
  const constants = getScanConstants()
  return (
    <div className="screen stack">
      <section className="panel">
        <div className="section-heading">
          <h2>PLC scan-cycle methodology</h2>
          <span>Deterministic client-side simulation</span>
        </div>
        <DataTable
          columns={['Phase', 'Purpose']}
          rows={[
            ['Read inputs', 'Evaluate package positions, scenario events, manual forces, and field sensor states.'],
            ['Run state machine', 'Move through stopped, starting, infeed, inspect, reject, discharge, blocked, fault, and recovery states.'],
            ['Update timers/counters', 'Advance dwell timers, overload delay, sensor stuck timer, part counts, and downtime seconds.'],
            ['Update outputs', 'Write conveyor run, reject cylinder, alarm bits, counts, and OEE tags.'],
            ['Log historian data', 'Append trend points and sensor transitions for reports and diagnostics.'],
          ]}
        />
      </section>

      <section className="two-column">
        <div className="panel">
          <h2>OEE formulas</h2>
          <p>Availability = operating time / planned runtime.</p>
          <p>Performance = ideal cycle time × total parts / operating time.</p>
          <p>Quality = good parts / total parts.</p>
          <p>OEE = availability × performance × quality.</p>
        </div>
        <div className="panel">
          <h2>Configured timers</h2>
          <DataTable
            columns={['Timer', 'Value']}
            rows={[
              ['Infeed timeout', formatDuration(constants.infeedTimeoutMs)],
              ['Inspection dwell', formatDuration(constants.inspectionDwellMs)],
              ['Reject actuation', formatDuration(constants.rejectActuationMs)],
              ['Motor overload delay', formatDuration(constants.motorOverloadDelayMs)],
              ['Sensor stuck timer', formatDuration(constants.sensorStuckDelayMs)],
              ['Recovery timer', formatDuration(constants.recoveryTimeMs)],
              ['Ideal cycle time', formatDuration(constants.idealCycleTimeMs)],
            ]}
          />
        </div>
      </section>
    </div>
  )
}
