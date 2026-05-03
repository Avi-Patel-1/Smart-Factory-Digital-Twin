import { useEffect, useState } from 'react'
import type { SimulationState } from '../types'
import { DataTable } from '../components/DataTable'
import {
  downloadText,
  formatAlarmHistoryCsv,
  formatOeeReportJson,
  formatProductionSummaryCsv,
  formatScenarioReportMarkdown,
  formatTagSnapshotJson,
} from '../export/formatters'
import { formatDuration, formatPercent } from '../utils/format'

interface ProductionReportProps {
  state: SimulationState
}

interface HistorianSummary {
  metadata: {
    runId: string
    lineName: string
    scenario: string
    generatedAt: string
    database: string
  }
  kpis: {
    goodParts: number
    rejects: number
    totalParts: number
    availability: number
    performance: number
    quality: number
    oee: number
    downtimeSeconds: number
    throughputPpm: number
  }
  alarms: Array<{
    tag: string
    raisedAt: string
    severity: string
    downtimeReason: string
    durationSeconds: number
  }>
  downtimeReasons: Array<{
    reason: string
    eventCount: number
    durationSeconds: number
  }>
}

export function ProductionReport({ state }: ProductionReportProps) {
  const [historian, setHistorian] = useState<HistorianSummary | null>(null)
  const [historianStatus, setHistorianStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading')
  const downtimeRows = Object.entries(state.counters.faultsByType).map(([reason, count]) => [reason, count])
  const qualityRows = [
    ['Good parts', state.counters.goodParts],
    ['Rejects', state.counters.rejects],
    ['Reject rate', formatPercent(state.metrics.rejectRate)],
    ['Quality OEE component', formatPercent(state.metrics.quality)],
  ]

  useEffect(() => {
    let cancelled = false
    fetch(`${import.meta.env.BASE_URL}data/historian_summary.json`)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Historian export unavailable: ${response.status}`)
        }
        return response.json() as Promise<HistorianSummary>
      })
      .then((summary) => {
        if (!cancelled) {
          setHistorian(summary)
          setHistorianStatus('ready')
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHistorianStatus('unavailable')
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="screen stack">
      <section className="panel">
        <div className="section-heading">
          <h2>Production report</h2>
          <span>{state.scenario.name}</span>
        </div>
        <div className="export-grid">
          <button type="button" onClick={() => downloadText('alarm-history.csv', formatAlarmHistoryCsv(state.alarms), 'text/csv')}>
            Export alarm CSV
          </button>
          <button type="button" onClick={() => downloadText('production-summary.csv', formatProductionSummaryCsv(state), 'text/csv')}>
            Export production CSV
          </button>
          <button type="button" onClick={() => downloadText('tag-snapshot.json', formatTagSnapshotJson(state.tags), 'application/json')}>
            Export tag JSON
          </button>
          <button type="button" onClick={() => downloadText('oee-report.json', formatOeeReportJson(state), 'application/json')}>
            Export OEE JSON
          </button>
          <button type="button" onClick={() => downloadText('scenario-report.md', formatScenarioReportMarkdown(state), 'text/markdown')}>
            Export scenario report
          </button>
        </div>
      </section>

      <section className="two-column">
        <div className="panel">
          <div className="section-heading">
            <h2>SQLite historian export</h2>
            <span>{historianStatus === 'ready' ? historian?.metadata.lineName : historianStatus}</span>
          </div>
          {historian ? (
            <DataTable
              columns={['Metric', 'Value']}
              rows={[
                ['Run', historian.metadata.runId],
                ['Scenario', historian.metadata.scenario],
                ['Good parts', historian.kpis.goodParts],
                ['Rejects', historian.kpis.rejects],
                ['Overall OEE', formatPercent(historian.kpis.oee)],
                ['Throughput', `${historian.kpis.throughputPpm.toFixed(2)} ppm`],
                ['Downtime', formatDuration(historian.kpis.downtimeSeconds * 1000)],
              ]}
            />
          ) : (
            <p>Static historian JSON will appear here after the Python export runs.</p>
          )}
        </div>
        <div className="panel">
          <div className="section-heading">
            <h2>Historian downtime</h2>
            <span>{historian ? historian.metadata.generatedAt : 'static data'}</span>
          </div>
          <DataTable
            columns={['Reason', 'Events', 'Duration']}
            rows={
              historian
                ? historian.downtimeReasons.map((reason) => [reason.reason, reason.eventCount, formatDuration(reason.durationSeconds * 1000)])
                : []
            }
            emptyLabel="No historian downtime export loaded"
          />
        </div>
      </section>

      <section className="two-column">
        <div className="panel">
          <div className="section-heading">
            <h2>Shift summary</h2>
            <span>{formatDuration(state.elapsedMs)} elapsed</span>
          </div>
          <DataTable
            columns={['Metric', 'Value']}
            rows={[
              ['Good count', state.counters.goodParts],
              ['Reject count', state.counters.rejects],
              ['Total count', state.counters.totalParts],
              ['Planned runtime', formatDuration(state.metrics.plannedRuntimeMs)],
              ['Unplanned downtime', formatDuration(state.metrics.unplannedDowntimeMs)],
              ['Ideal cycle time', formatDuration(state.metrics.idealCycleTimeMs)],
              ['Actual cycle time', formatDuration(state.metrics.actualCycleTimeMs)],
            ]}
          />
        </div>
        <div className="panel">
          <div className="section-heading">
            <h2>OEE breakdown</h2>
            <span>{formatPercent(state.metrics.oee)} overall</span>
          </div>
          <DataTable
            columns={['Component', 'Value']}
            rows={[
              ['Availability', formatPercent(state.metrics.availability)],
              ['Performance', formatPercent(state.metrics.performance)],
              ['Quality', formatPercent(state.metrics.quality)],
              ['Overall OEE', formatPercent(state.metrics.oee)],
            ]}
          />
        </div>
      </section>

      <section className="two-column">
        <div className="panel">
          <div className="section-heading">
            <h2>Downtime reason summary</h2>
            <span>{formatDuration(state.counters.downtimeMs)}</span>
          </div>
          <DataTable columns={['Reason', 'Occurrences']} rows={downtimeRows} emptyLabel="No downtime reasons recorded" />
        </div>
        <div className="panel">
          <div className="section-heading">
            <h2>Quality summary</h2>
            <span>{state.scenario.recommendation}</span>
          </div>
          <DataTable columns={['Metric', 'Value']} rows={qualityRows} />
        </div>
      </section>
    </div>
  )
}
