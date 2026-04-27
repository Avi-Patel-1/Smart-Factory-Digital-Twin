import { statusClass } from '../utils/format'

interface StatusBadgeProps {
  label: string
  value: string
}

export function StatusBadge({ label, value }: StatusBadgeProps) {
  return (
    <span className={`status-badge status-badge--${statusClass(value)}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </span>
  )
}
