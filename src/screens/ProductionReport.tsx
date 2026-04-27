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

export function ProductionReport({ state }: ProductionReportProps) {
  const downtimeRows = Object.entries(state.counters.faultsByType).map(([reason, count]) => [reason, count])
  const qualityRows = [
    ['Good parts', state.counters.goodParts],
    ['Rejects', state.counters.rejects],
    ['Reject rate', formatPercent(state.metrics.rejectRate)],
    ['Quality OEE component', formatPercent(state.metrics.quality)],
  ]

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
