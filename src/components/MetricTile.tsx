interface MetricTileProps {
  label: string
  value: string
  detail?: string
  tone?: 'good' | 'warn' | 'bad' | 'neutral'
}

export function MetricTile({ label, value, detail, tone = 'neutral' }: MetricTileProps) {
  return (
    <article className={`metric-tile metric-tile--${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </article>
  )
}
