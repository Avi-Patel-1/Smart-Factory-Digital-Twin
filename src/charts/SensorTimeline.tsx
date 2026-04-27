import type { SensorEventRecord } from '../types'
import { formatTimestamp } from '../utils/format'

interface SensorTimelineProps {
  events: SensorEventRecord[]
}

const lanes = ['PE_INFEED_BLOCKED', 'PE_INSPECTION_PRESENT', 'PE_EXIT_BLOCKED']

export function SensorTimeline({ events }: SensorTimelineProps) {
  const width = 760
  const height = 150
  const maxTime = Math.max(...events.map((event) => event.timeMs), 1)

  return (
    <section className="timeline-panel">
      <div className="section-heading">
        <h3>Sensor event timeline</h3>
        <span>{events.length} transitions</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Sensor event timeline">
        {lanes.map((lane, index) => {
          const y = 32 + index * 42
          return (
            <g key={lane}>
              <text x="0" y={y - 7}>{lane}</text>
              <line x1="190" x2={width - 20} y1={y} y2={y} />
            </g>
          )
        })}
        {events.map((event, index) => {
          const laneIndex = Math.max(0, lanes.indexOf(event.tag))
          const x = 190 + (event.timeMs / maxTime) * (width - 220)
          const y = 32 + laneIndex * 42
          return (
            <g key={`${event.tag}-${event.timeMs}-${index}`}>
              <circle cx={x} cy={y} r="6" className={event.value ? 'timeline-on' : 'timeline-off'} />
              <title>{`${event.tag} ${event.value ? 'ON' : 'OFF'} at ${formatTimestamp(event.timeMs)}`}</title>
            </g>
          )
        })}
      </svg>
    </section>
  )
}
