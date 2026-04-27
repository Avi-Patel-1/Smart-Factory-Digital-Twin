import type { AlarmRecord, SimulationState, TagRecord } from '../types'
import { formatDuration, formatPercent, formatTimestamp } from '../utils/format'

function csvCell(value: string | number | boolean | undefined): string {
  const text = String(value ?? '')
  return `"${text.replaceAll('"', '""')}"`
}

function csvRow(values: Array<string | number | boolean | undefined>): string {
  return values.map(csvCell).join(',')
}

export function formatAlarmHistoryCsv(alarms: AlarmRecord[]): string {
  const header = csvRow([
    'timestamp',
    'tag',
    'message',
    'severity',
    'active',
    'acknowledged',
    'root cause hint',
    'recovery steps',
    'effect',
  ])
  const rows = alarms.map((alarm) =>
    csvRow([
      formatTimestamp(alarm.raisedAtMs),
      alarm.tag,
      alarm.message,
      alarm.severity,
      alarm.active,
      alarm.acknowledged,
      alarm.rootCauseHint,
      alarm.recoverySteps,
      alarm.effect,
    ]),
  )
  return [header, ...rows].join('\n')
}

export function formatProductionSummaryCsv(state: SimulationState): string {
  const rows = [
    ['metric', 'value'],
    ['scenario', state.scenario.name],
    ['elapsed runtime', formatDuration(state.elapsedMs)],
    ['good parts', state.counters.goodParts],
    ['rejects', state.counters.rejects],
    ['total parts', state.counters.totalParts],
    ['availability', formatPercent(state.metrics.availability)],
    ['performance', formatPercent(state.metrics.performance)],
    ['quality', formatPercent(state.metrics.quality)],
    ['overall OEE', formatPercent(state.metrics.oee)],
    ['unplanned downtime', formatDuration(state.metrics.unplannedDowntimeMs)],
    ['throughput ppm', state.metrics.throughputPerMinute.toFixed(2)],
  ]
  return rows.map(csvRow).join('\n')
}

export function formatTagSnapshotJson(tags: Record<string, TagRecord>): string {
  const snapshot = Object.values(tags).map((tag) => ({
    name: tag.name,
    type: tag.type,
    value: tag.value,
    source: tag.source,
    description: tag.description,
    lastChanged: formatTimestamp(tag.lastChangedMs),
    quality: tag.quality,
  }))
  return JSON.stringify(snapshot, null, 2)
}

export function formatOeeReportJson(state: SimulationState): string {
  return JSON.stringify(
    {
      scenario: state.scenario.name,
      elapsedRuntime: formatDuration(state.elapsedMs),
      counts: {
        goodParts: state.counters.goodParts,
        rejects: state.counters.rejects,
        totalParts: state.counters.totalParts,
      },
      oee: {
        availability: state.metrics.availability,
        performance: state.metrics.performance,
        quality: state.metrics.quality,
        overall: state.metrics.oee,
      },
      downtime: {
        unplannedMs: state.metrics.unplannedDowntimeMs,
        reasons: state.counters.faultsByType,
      },
      maintenance: {
        motorRuntimeMs: state.counters.motorRuntimeMs,
        jamCount: state.counters.jamCount,
        mtbfMs: state.metrics.mtbfMs,
        mttrMs: state.metrics.mttrMs,
      },
    },
    null,
    2,
  )
}

export function formatScenarioReportMarkdown(state: SimulationState): string {
  const activeAlarmLines = state.alarms
    .filter((alarm) => alarm.active)
    .map((alarm) => `- ${alarm.tag}: ${alarm.message} (${alarm.severity})`)
  const alarmSection = activeAlarmLines.length > 0 ? activeAlarmLines.join('\n') : '- No active alarms'

  return [
    `# ${state.scenario.name} report`,
    '',
    `Runtime: ${formatDuration(state.elapsedMs)}`,
    `Machine state: ${state.machineState}`,
    `Active station: ${state.activeStation}`,
    '',
    '## Counts',
    `- Good parts: ${state.counters.goodParts}`,
    `- Rejects: ${state.counters.rejects}`,
    `- Total parts: ${state.counters.totalParts}`,
    '',
    '## OEE',
    `- Availability: ${formatPercent(state.metrics.availability)}`,
    `- Performance: ${formatPercent(state.metrics.performance)}`,
    `- Quality: ${formatPercent(state.metrics.quality)}`,
    `- Overall OEE: ${formatPercent(state.metrics.oee)}`,
    '',
    '## Active alarms',
    alarmSection,
    '',
    '## Recommended action',
    state.scenario.recommendation,
  ].join('\n')
}

export function downloadText(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
