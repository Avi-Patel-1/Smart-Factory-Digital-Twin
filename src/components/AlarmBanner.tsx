import type { AlarmRecord } from '../types'

interface AlarmBannerProps {
  alarms: AlarmRecord[]
}

export function AlarmBanner({ alarms }: AlarmBannerProps) {
  const active = alarms.filter((alarm) => alarm.active)
  if (active.length === 0) {
    return <div className="alarm-banner alarm-banner--clear">No active alarms</div>
  }

  const topAlarm = active[0]
  return (
    <div className={`alarm-banner alarm-banner--${topAlarm.severity}`}>
      <strong>{topAlarm.tag}</strong>
      <span>{topAlarm.message}</span>
      <small>{topAlarm.effect}</small>
    </div>
  )
}
