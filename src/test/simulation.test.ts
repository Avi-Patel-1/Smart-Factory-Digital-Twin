import { describe, expect, it } from 'vitest'
import { acknowledgeAlarm, reconcileAlarms } from '../simulation/alarms'
import { calculateOeeMetrics } from '../simulation/oee'
import { scenarioPresets } from '../simulation/scenarios'
import { createTagDatabase, setTagValue } from '../simulation/tagDatabase'
import { applyOperatorAction, createInitialSimulationState, scanCycle } from '../plc/scanCycle'
import {
  formatAlarmHistoryCsv,
  formatOeeReportJson,
  formatProductionSummaryCsv,
  formatScenarioReportMarkdown,
  formatTagSnapshotJson,
} from '../export/formatters'
import type { CounterBank } from '../types'

function runFor(milliseconds: number, scenarioId = 'normal-production') {
  let state = createInitialSimulationState(scenarioId)
  state = applyOperatorAction(state, { type: 'start' })
  for (let elapsed = 0; elapsed < milliseconds; elapsed += state.scanTimeMs) {
    state = scanCycle(state)
  }
  return state
}

describe('PLC state machine', () => {
  it('moves from stopped into active production states after start', () => {
    const state = runFor(2500)
    expect(state.runRequested).toBe(true)
    expect(state.machineState).not.toBe('stopped')
    expect(state.tags.STATE_MACHINE.value).toBe(state.machineState)
  })

  it('raises the motor overload alarm from the scheduled event', () => {
    const state = runFor(30000, 'motor-overload-event')
    expect(state.alarms.some((alarm) => alarm.tag === 'ALM_MOTOR_OVERLOAD' && alarm.active)).toBe(true)
    expect(state.machineState).toBe('fault')
  })

  it('raises the reject gate failure alarm during reject containment', () => {
    const state = runFor(45000, 'reject-gate-failure')
    expect(state.alarms.some((alarm) => alarm.tag === 'ALM_REJECT_GATE_FAIL')).toBe(true)
    expect(state.counters.faultsByType.ALM_REJECT_GATE_FAIL).toBeGreaterThan(0)
  })
})

describe('tag database', () => {
  it('updates tag values and last-changed time', () => {
    const tags = createTagDatabase()
    setTagValue(tags, 'MTR_CONV_RUN', true, 500)
    expect(tags.MTR_CONV_RUN.value).toBe(true)
    expect(tags.MTR_CONV_RUN.lastChangedMs).toBe(500)
  })
})

describe('alarm transitions', () => {
  it('supports active, acknowledged, and cleared states', () => {
    const raised = reconcileAlarms([], new Set(['ALM_JAM_INFEED']), 1000)
    expect(raised.alarms[0].active).toBe(true)
    const acknowledged = acknowledgeAlarm(raised.alarms, 'ALM_JAM_INFEED', 1250)
    expect(acknowledged[0].acknowledged).toBe(true)
    const cleared = reconcileAlarms(acknowledged, new Set(), 2000)
    expect(cleared.alarms[0].cleared).toBe(true)
    expect(cleared.alarms[0].active).toBe(false)
  })
})

describe('OEE calculations', () => {
  it('calculates availability, performance, quality, and total OEE', () => {
    const counters: CounterBank = {
      goodParts: 90,
      rejects: 10,
      totalParts: 100,
      faultsByType: { ALM_JAM_INFEED: 2 },
      downtimeMs: 60000,
      jamCount: 2,
      motorRuntimeMs: 500000,
      recoveryEvents: 2,
    }
    const metrics = calculateOeeMetrics(counters, 600000, 42, 3.7)
    expect(metrics.availability).toBeCloseTo(0.9)
    expect(metrics.quality).toBeCloseTo(0.9)
    expect(metrics.oee).toBeGreaterThan(0)
  })
})

describe('scenario presets', () => {
  it('include unique repeatable scenario identifiers', () => {
    const ids = new Set(scenarioPresets.map((scenario) => scenario.id))
    expect(ids.size).toBe(scenarioPresets.length)
    expect(ids.has('quality-drift')).toBe(true)
    expect(scenarioPresets.some((scenario) => scenario.events.some((event) => event.type === 'rejectGateFailure'))).toBe(true)
  })
})

describe('export formatting', () => {
  it('formats CSV, JSON, and Markdown outputs', () => {
    const state = runFor(8000, 'high-reject-rate')
    expect(formatAlarmHistoryCsv(state.alarms)).toContain('"timestamp","tag"')
    expect(formatProductionSummaryCsv(state)).toContain('"overall OEE"')
    expect(JSON.parse(formatTagSnapshotJson(state.tags))[0]).toHaveProperty('name')
    expect(JSON.parse(formatOeeReportJson(state))).toHaveProperty('oee')
    expect(formatScenarioReportMarkdown(state)).toContain('# High reject rate report')
  })
})
