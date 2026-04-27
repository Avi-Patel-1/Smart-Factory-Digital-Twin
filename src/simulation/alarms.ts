import { alarmCatalog } from '../data/alarmCatalog'
import type { AlarmRecord } from '../types'

export interface AlarmReconcileResult {
  alarms: AlarmRecord[]
  raisedAlarmIds: string[]
}

function sortAlarms(a: AlarmRecord, b: AlarmRecord): number {
  if (a.active !== b.active) {
    return a.active ? -1 : 1
  }
  return b.raisedAtMs - a.raisedAtMs
}

export function reconcileAlarms(
  currentAlarms: AlarmRecord[],
  activeAlarmIds: Set<string>,
  elapsedMs: number,
): AlarmReconcileResult {
  const byId = new Map(currentAlarms.map((alarm) => [alarm.id, { ...alarm }]))
  const raisedAlarmIds: string[] = []

  Object.values(alarmCatalog).forEach((definition) => {
    const isActive = activeAlarmIds.has(definition.id)
    const current = byId.get(definition.id)

    if (isActive && !current) {
      byId.set(definition.id, {
        ...definition,
        active: true,
        acknowledged: false,
        cleared: false,
        raisedAtMs: elapsedMs,
        occurrenceCount: 1,
      })
      raisedAlarmIds.push(definition.id)
      return
    }

    if (isActive && current && !current.active) {
      byId.set(definition.id, {
        ...current,
        active: true,
        acknowledged: false,
        cleared: false,
        raisedAtMs: elapsedMs,
        clearedAtMs: undefined,
        occurrenceCount: current.occurrenceCount + 1,
      })
      raisedAlarmIds.push(definition.id)
      return
    }

    if (!isActive && current?.active) {
      byId.set(definition.id, {
        ...current,
        active: false,
        cleared: true,
        clearedAtMs: elapsedMs,
      })
    }
  })

  return {
    alarms: Array.from(byId.values()).sort(sortAlarms),
    raisedAlarmIds,
  }
}

export function acknowledgeAlarm(alarms: AlarmRecord[], alarmId: string, elapsedMs: number): AlarmRecord[] {
  return alarms.map((alarm) =>
    alarm.id === alarmId
      ? {
          ...alarm,
          acknowledged: true,
          acknowledgedAtMs: elapsedMs,
        }
      : alarm,
  )
}

export function clearInactiveAlarms(alarms: AlarmRecord[]): AlarmRecord[] {
  return alarms.filter((alarm) => alarm.active)
}
