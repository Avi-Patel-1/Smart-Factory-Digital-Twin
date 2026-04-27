import type { OperatorAction, SimulationState } from '../types'
import { AlarmBanner } from '../components/AlarmBanner'
import { MetricTile } from '../components/MetricTile'
import { StatusBadge } from '../components/StatusBadge'
import { formatDuration, formatInteger, formatNumber, formatPercent } from '../utils/format'

interface HmiOverviewProps {
  state: SimulationState
  dispatch: (action: OperatorAction) => void
}

function boolLabel(value: unknown): string {
  return value ? 'ON' : 'OFF'
}

export function HmiOverview({ state, dispatch }: HmiOverviewProps) {
  const activeAlarms = state.alarms.filter((alarm) => alarm.active)
  const sensors = ['PE_INFEED_BLOCKED', 'PE_INSPECTION_PRESENT', 'PE_EXIT_BLOCKED', 'PE_REJECT_CHUTE_CLEAR']

  return (
    <div className="screen stack">
      <AlarmBanner alarms={state.alarms} />

      <section className="hmi-grid">
        <div className="control-panel">
          <div className="section-heading">
            <h2>HMI overview</h2>
            <StatusBadge label="State" value={state.machineState} />
          </div>
          <div className="button-row">
            <button type="button" className="command command--start" onClick={() => dispatch({ type: 'start' })}>
              Start
            </button>
            <button type="button" className="command command--stop" onClick={() => dispatch({ type: 'stop' })}>
              Stop
            </button>
            <button type="button" className="command command--estop" onClick={() => dispatch({ type: 'emergencyStop' })}>
              E-Stop
            </button>
            <button type="button" className="command" onClick={() => dispatch({ type: 'reset' })}>
              Reset
            </button>
          </div>
          <div className="segmented" aria-label="Machine mode">
            <button
              type="button"
              className={state.mode === 'auto' ? 'selected' : ''}
              onClick={() => dispatch({ type: 'setMode', mode: 'auto' })}
            >
              Auto
            </button>
            <button
              type="button"
              className={state.mode === 'manual' ? 'selected' : ''}
              onClick={() => dispatch({ type: 'setMode', mode: 'manual' })}
            >
              Manual
            </button>
          </div>
          <div className="instruction-box">
            <span>Operator instructions</span>
            <p>{state.operatorInstruction}</p>
          </div>
        </div>

        <div className="status-panel">
          <div className="section-heading">
            <h2>Live cell status</h2>
            <span>{state.activeStation}</span>
          </div>
          <div className="status-list">
            <StatusBadge label="Conveyor" value={boolLabel(state.tags.MTR_CONV_RUN.value)} />
            <StatusBadge label="Motor fault" value={boolLabel(state.tags.MTR_CONV_FAULT.value)} />
            <StatusBadge label="Reject gate" value={boolLabel(state.tags.CYL_REJECT_EXT.value)} />
            <StatusBadge label="Air" value={state.tags.AIR_MAIN_OK.value ? 'OK' : 'LOW'} />
          </div>
          <div className="sensor-grid">
            {sensors.map((sensor) => (
              <div key={sensor} className={state.tags[sensor].value ? 'sensor sensor--on' : 'sensor'}>
                <span>{sensor}</span>
                <strong>{boolLabel(state.tags[sensor].value)}</strong>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="metric-grid">
        <MetricTile label="Good parts" value={formatInteger(state.counters.goodParts)} tone="good" />
        <MetricTile label="Rejects" value={formatInteger(state.counters.rejects)} tone={state.counters.rejects > 0 ? 'warn' : 'neutral'} />
        <MetricTile label="Cycle time" value={state.metrics.actualCycleTimeMs ? formatDuration(state.metrics.actualCycleTimeMs) : '0s'} detail={`Ideal ${formatDuration(state.metrics.idealCycleTimeMs)}`} />
        <MetricTile label="Throughput" value={`${formatNumber(state.metrics.throughputPerMinute, 1)} ppm`} />
        <MetricTile label="OEE" value={formatPercent(state.metrics.oee)} tone={state.metrics.oee > 0.75 ? 'good' : state.metrics.oee > 0.45 ? 'warn' : 'bad'} />
        <MetricTile label="Active alarms" value={formatInteger(activeAlarms.length)} tone={activeAlarms.length ? 'bad' : 'good'} />
      </section>
    </div>
  )
}
