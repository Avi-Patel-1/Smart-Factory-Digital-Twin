import type { SimulationState } from '../types'
import { SensorTimeline } from '../charts/SensorTimeline'
import { TrendChart } from '../charts/TrendChart'

interface TrendsScreenProps {
  state: SimulationState
}

export function TrendsScreen({ state }: TrendsScreenProps) {
  return (
    <div className="screen stack">
      <section className="trend-grid">
        <TrendChart title="Cycle time" points={state.historian} valueKey="cycleTimeMs" color="#38bdf8" unit=" ms" />
        <TrendChart title="Throughput" points={state.historian} valueKey="throughputPerMinute" color="#22c55e" unit=" ppm" />
        <TrendChart title="OEE" points={state.historian} valueKey="oee" color="#14b8a6" unit="%" scale={100} />
        <TrendChart title="Reject rate" points={state.historian} valueKey="rejectRate" color="#f97316" unit="%" scale={100} />
        <TrendChart title="Downtime" points={state.historian} valueKey="downtimeSeconds" color="#ef4444" unit=" s" />
        <TrendChart title="Motor current" points={state.historian} valueKey="motorCurrentA" color="#a78bfa" unit=" A" />
      </section>
      <SensorTimeline events={state.sensorEvents} />
    </div>
  )
}
