import type { AlarmRecord, OperatorAction, SimulationState } from '../types'
import { DataTable } from '../components/DataTable'
import { formatTimestamp } from '../utils/format'

interface AlarmsScreenProps {
  state: SimulationState
  dispatch: (action: OperatorAction) => void
}

function alarmRows(alarms: AlarmRecord[], dispatch: (action: OperatorAction) => void, includeAction: boolean) {
  return alarms.map((alarm) => [
    formatTimestamp(alarm.raisedAtMs),
    alarm.severity,
    alarm.tag,
    alarm.message,
    alarm.rootCauseHint,
    alarm.recoverySteps,
    alarm.effect,
    includeAction ? (
      <button type="button" className="table-action" onClick={() => dispatch({ type: 'acknowledgeAlarm', alarmId: alarm.id })}>
        Acknowledge
      </button>
    ) : (
      alarm.acknowledged ? 'Yes' : 'No'
    ),
  ])
}

export function AlarmsScreen({ state, dispatch }: AlarmsScreenProps) {
  const active = state.alarms.filter((alarm) => alarm.active)
  const acknowledged = state.alarms.filter((alarm) => alarm.active && alarm.acknowledged)
  const cleared = state.alarms.filter((alarm) => alarm.cleared && !alarm.active)

  return (
    <div className="screen stack">
      <section className="panel">
        <div className="section-heading">
          <h2>Active alarms</h2>
          <span>{active.length} active</span>
        </div>
        <DataTable
          columns={['Timestamp', 'Severity', 'Tag', 'Message', 'Root cause hint', 'Recovery steps', 'Effect', 'Action']}
          rows={alarmRows(active, dispatch, true)}
          emptyLabel="No active alarms"
        />
      </section>

      <section className="panel">
        <div className="section-heading">
          <h2>Acknowledged alarms</h2>
          <span>{acknowledged.length} acknowledged</span>
        </div>
        <DataTable
          columns={['Timestamp', 'Severity', 'Tag', 'Message', 'Root cause hint', 'Recovery steps', 'Effect', 'Ack']}
          rows={alarmRows(acknowledged, dispatch, false)}
          emptyLabel="No acknowledged active alarms"
        />
      </section>

      <section className="panel">
        <div className="section-heading">
          <h2>Cleared alarm history</h2>
          <button type="button" className="table-action" onClick={() => dispatch({ type: 'clearAlarmHistory' })}>
            Clear history
          </button>
        </div>
        <DataTable
          columns={['Timestamp', 'Severity', 'Tag', 'Message', 'Root cause hint', 'Recovery steps', 'Effect', 'Ack']}
          rows={alarmRows(cleared, dispatch, false)}
          emptyLabel="No cleared alarms"
        />
      </section>
    </div>
  )
}
