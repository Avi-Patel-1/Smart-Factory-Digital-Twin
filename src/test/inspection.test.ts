import { describe, expect, it } from 'vitest'
import { scenarioPresets } from '../simulation/scenarios'
import { advanceRun, createRun, dispatchRun, exportRun, importRun } from '../simulation/session'
import { inspectionFixture } from '../simulation/inspection'
import type { InspectionResult } from '../types'

function waiting() {
  let run = dispatchRun(createRun({ ...scenarioPresets[0], inspectionMode: 'external' }), { type: 'start' })
  while (run.state.machineState !== 'inspect' && run.bundle.durationTicks < 80) run = advanceRun(run)
  const item = run.state.packages.find((item) => item.position >= 44 && item.position <= 56)!
  expect(item).toBeDefined()
  const event: InspectionResult = { ...inspectionFixture, packageId: item.id, capturedAtMs: run.state.elapsedMs }
  return { run, event }
}

describe('versioned external inspection interface', () => {
  it('consumes one result and diverts that package, with exact replay', () => {
    const { run, event } = waiting()
    const received = dispatchRun(run, { type: 'inspectionResult', result: event })
    expect(received.state.inspectionResults).toEqual([event])
    const duplicate = dispatchRun(received, { type: 'inspectionResult', result: event })
    expect(duplicate.state.inspectionResults).toHaveLength(1)
    expect(duplicate.state.operatorInstruction).toContain('Duplicate')
    const finished = advanceRun(duplicate, 30)
    expect(finished.state.counters.rejects).toBe(1)
    expect(importRun(exportRun(finished))).toEqual(finished)
  })

  it('holds the cell on missing results and requires a fresh result, reset and restart', () => {
    const { run, event } = waiting()
    let stalled = advanceRun(run, 20)
    expect(stalled.state.alarms.some((alarm) => alarm.id === 'ALM_INSPECTION_MISSING' && alarm.active)).toBe(true)
    expect(stalled.state.resetRequired).toBe(true)
    expect(stalled.state.tags.MTR_CONV_RUN.value).toBe(false)
    expect(stalled.state.counters.goodParts).toBe(0)
    stalled = dispatchRun(stalled, { type: 'reset' })
    expect(stalled.state.resetRequired).toBe(true)
    stalled = dispatchRun(stalled, { type: 'inspectionResult', result: { ...event, capturedAtMs: stalled.state.elapsedMs } })
    stalled = dispatchRun(stalled, { type: 'reset' })
    stalled = advanceRun(stalled, 12)
    expect(stalled.state.runRequested).toBe(false)
    expect(stalled.state.tags.MTR_CONV_RUN.value).toBe(false)
    stalled = dispatchRun(stalled, { type: 'start' })
    stalled = advanceRun(stalled, 20)
    expect(stalled.state.counters.rejects).toBe(1)
  })

  it.each(['stale', 'future', 'wrongPackage'])('rejects %s without changing the decision', (kind) => {
    const { run, event } = waiting()
    if (kind === 'stale') event.capturedAtMs = 0
    if (kind === 'future') event.capturedAtMs = run.state.elapsedMs + 1
    if (kind === 'wrongPackage') event.packageId = 999
    const result = dispatchRun(run, { type: 'inspectionResult', result: event })
    expect(result.state.packages).toEqual(run.state.packages)
    expect(result.state.inspectionResults).toHaveLength(0)
    expect(result.state.operatorInstruction).toContain('rejected')
  })

  it('rejects malformed scores before recording a command', () => {
    const { run, event } = waiting()
    expect(() => dispatchRun(run, { type: 'inspectionResult', result: { ...event, score: Infinity } })).toThrow('finite')
    expect(importRun(exportRun(run))).toEqual(run)
  })

  it('does not overwrite an earlier event ID with a conflicting decision', () => {
    const { run, event } = waiting()
    const accepted = dispatchRun(run, { type: 'inspectionResult', result: event })
    const conflict = dispatchRun(accepted, { type: 'inspectionResult', result: { ...event, decision: 'accept' } })
    expect(conflict.state.inspectionResults).toEqual([event])
    expect(conflict.state.packages).toEqual(accepted.state.packages)
    expect(conflict.state.operatorInstruction).toContain('conflicts')
  })
})
