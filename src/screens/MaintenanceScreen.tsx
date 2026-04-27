import type { SimulationState } from '../types'
import { DataTable } from '../components/DataTable'
import { MetricTile } from '../components/MetricTile'
import { formatDuration, formatInteger } from '../utils/format'

interface MaintenanceScreenProps {
  state: SimulationState
}

export function MaintenanceScreen({ state }: MaintenanceScreenProps) {
  const faultRows = Object.entries(state.counters.faultsByType).map(([fault, count]) => [fault, count])
  const sensorRows = ['PE_INFEED_BLOCKED', 'PE_INSPECTION_PRESENT', 'PE_EXIT_BLOCKED'].map((tag) => [
    tag,
    String(state.tags[tag].value),
    state.tags[tag].quality,
    formatDuration(state.elapsedMs - state.tags[tag].lastChangedMs),
  ])
  const recommendations = [
    state.counters.jamCount > 1 ? 'Inspect infeed guide rails and carton spacing.' : 'Infeed jam count is within the current scenario expectation.',
    state.metrics.motorLoadPct > 80 ? 'Motor load is elevated. Check for conveyor drag or dense package accumulation.' : 'Motor load is stable.',
    state.metrics.rejectRate > 0.15 ? 'Quality loss is material. Review inspection rejects with upstream process settings.' : 'Reject rate is under watch threshold.',
    state.alarms.some((alarm) => alarm.tag === 'ALM_SENSOR_STUCK') ? 'Photoeye diagnostics show a stuck input pattern. Clean lens and confirm switching.' : 'Sensor transitions are healthy.',
  ]

  return (
    <div className="screen stack">
      <section className="metric-grid">
        <MetricTile label="Motor runtime" value={formatDuration(state.counters.motorRuntimeMs)} />
        <MetricTile label="Jam count" value={formatInteger(state.counters.jamCount)} tone={state.counters.jamCount ? 'warn' : 'good'} />
        <MetricTile label="MTBF approximation" value={formatDuration(state.metrics.mtbfMs)} />
        <MetricTile label="MTTR approximation" value={formatDuration(state.metrics.mttrMs)} />
      </section>

      <section className="two-column">
        <div className="panel">
          <div className="section-heading">
            <h2>Maintenance recommendations</h2>
            <span>{state.scenario.name}</span>
          </div>
          <ul className="recommendation-list">
            {recommendations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div className="panel">
          <div className="section-heading">
            <h2>Fault history by component</h2>
            <span>{faultRows.length} fault type(s)</span>
          </div>
          <DataTable columns={['Fault', 'Count']} rows={faultRows} emptyLabel="No faults logged" />
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <h2>Sensor health indicators</h2>
          <span>Last change age</span>
        </div>
        <DataTable columns={['Tag', 'Value', 'Quality', 'Time since change']} rows={sensorRows} />
      </section>
    </div>
  )
}
