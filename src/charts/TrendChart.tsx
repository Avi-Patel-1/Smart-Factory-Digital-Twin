import type { HistorianPoint } from '../types'

interface TrendChartProps {
  title: string
  points: HistorianPoint[]
  valueKey: keyof Pick<
    HistorianPoint,
    'cycleTimeMs' | 'throughputPerMinute' | 'oee' | 'rejectRate' | 'downtimeSeconds' | 'motorLoadPct' | 'motorCurrentA'
  >
  color: string
  unit: string
  scale?: number
}

function buildPath(values: number[], width: number, height: number): string {
  if (values.length === 0) {
    return ''
  }
  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
  const range = Math.max(max - min, 1)
  return values
    .map((value, index) => {
      const x = values.length === 1 ? width : (index / (values.length - 1)) * width
      const y = height - ((value - min) / range) * height
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(' ')
}

export function TrendChart({ title, points, valueKey, color, unit, scale = 1 }: TrendChartProps) {
  const width = 320
  const height = 112
  const values = points.map((point) => Number(point[valueKey]) * scale)
  const latest = values.at(-1) ?? 0
  const path = buildPath(values, width, height)

  return (
    <section className="trend-card" aria-label={title}>
      <div className="trend-card__header">
        <h3>{title}</h3>
        <strong>
          {latest.toFixed(1)}
          {unit}
        </strong>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title} trend`}>
        <line x1="0" x2={width} y1={height - 1} y2={height - 1} />
        <line x1="0" x2="0" y1="0" y2={height} />
        {path ? <path d={path} style={{ stroke: color }} /> : <text x="12" y="58">Waiting for data</text>}
      </svg>
    </section>
  )
}
