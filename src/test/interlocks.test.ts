import { describe, expect, it } from 'vitest'
import { applyOperatorAction, createInitialSimulationState, scanCycle } from '../plc/scanCycle'
import type { MachineMode, ScenarioEventType, SimulationState } from '../types'
import { advanceRun, createRun, dispatchRun, replayRun } from '../simulation/session'
import { defaultScenario } from '../simulation/scenarios'

function advance(state: SimulationState, ms: number) { return scanCycle(state, ms) }
function safe(state: SimulationState) {
  expect(state.tags.MTR_CONV_RUN.value).toBe(false)
  expect(state.tags.CYL_REJECT_EXT.value).toBe(false)
}

describe('latched stop and deliberate recovery', () => {
  it.each(['mode', 'stop'] as const)('cannot bypass recovery with %s commands', (path) => {
    let run = dispatchRun(createRun(defaultScenario), { type: 'emergencyStop' })
    run = dispatchRun(run, { type: 'releaseEmergencyStop' })
    run = dispatchRun(run, { type: 'reset' })
    run = dispatchRun(run, path === 'mode' ? { type: 'setMode', mode: 'manual' } : { type: 'stop' })
    run = dispatchRun(run, path === 'mode' ? { type: 'setJog', enabled: true } : { type: 'start' })
    run = advanceRun(run, 10)
    expect(run.state.machineState).toBe('recovery')
    safe(run.state)
    run = advanceRun(run, 2)
    safe(run.state)
    expect(run.state.runRequested).toBe(false)
    expect(replayRun(run.bundle)).toEqual(run.state)
  })

  it.each<ScenarioEventType>(['infeedJam', 'compressedAirLoss', 'rejectGateFailure'])('observes a one-scan %s fault', (fault) => {
    let run = advanceRun(dispatchRun(createRun(defaultScenario), { type: 'start' }), 10)
    run = dispatchRun(run, { type: 'injectFault', fault, durationMs: 250 })
    run = advanceRun(run)
    expect(run.state.resetRequired).toBe(true)
    expect(run.state.alarms.some((alarm) => alarm.active)).toBe(true)
    safe(run.state)
  })
  it('holds the full startup permissive delay', () => {
    let state = applyOperatorAction(createInitialSimulationState(), { type: 'start' })
    state = advance(state, 1250)
    expect(state.machineState).toBe('starting')
    safe(state)
    state = scanCycle(state)
    expect(state.tags.MTR_CONV_RUN.value).toBe(true)
  })
  it.each<MachineMode>(['auto', 'manual'])('holds outputs through release, reset and recovery in %s', (mode) => {
    let state = applyOperatorAction(createInitialSimulationState(), { type: 'setMode', mode })
    state = applyOperatorAction(state, mode === 'auto' ? { type: 'start' } : { type: 'setJog', enabled: true })
    state = advance(state, 3000)
    expect(state.tags.MTR_CONV_RUN.value).toBe(true)
    state = applyOperatorAction(state, { type: 'emergencyStop' })
    safe(state) // Immediate removal, even while the simulation clock is paused.
    state = applyOperatorAction(state, { type: 'start' })
    state = applyOperatorAction(state, { type: 'reset' })
    expect(state.emergencyStop).toBe(true)
    expect(state.resetRequired).toBe(true)
    safe(state)
    state = applyOperatorAction(state, { type: 'releaseEmergencyStop' })
    state = advance(state, 5000)
    expect(state.resetRequired).toBe(true)
    expect(state.runRequested).toBe(false)
    safe(state)
    state = applyOperatorAction(state, { type: 'reset' })
    expect(state.machineState).toBe('recovery')
    state = applyOperatorAction(state, mode === 'auto' ? { type: 'start' } : { type: 'setJog', enabled: true })
    safe(state)
    state = advance(state, 5000)
    safe(state)
    expect(state.resetRequired).toBe(false)
    expect(state.runRequested).toBe(false)
    state = applyOperatorAction(state, mode === 'auto' ? { type: 'start' } : { type: 'setJog', enabled: true })
    state = advance(state, 2000)
    expect(state.tags.MTR_CONV_RUN.value).toBe(true)
  })

  const faults: ScenarioEventType[] = ['infeedJam', 'motorOverload', 'stuckPhotoeye', 'rejectGateFailure', 'compressedAirLoss', 'maintenanceStop']
  it.each(faults)('manual output commands cannot bypass %s or remain armed after it', (fault) => {
    let state = applyOperatorAction(createInitialSimulationState(), { type: 'setMode', mode: 'manual' })
    state = applyOperatorAction(state, { type: 'setJog', enabled: true })
    state = applyOperatorAction(state, { type: 'setRejectGate', enabled: true })
    state = applyOperatorAction(state, { type: 'injectFault', fault, durationMs: 20000 })
    state = advance(state, 5000)
    safe(state)
    expect(state.resetRequired).toBe(true)
    state = applyOperatorAction(state, { type: 'setJog', enabled: true })
    state = applyOperatorAction(state, { type: 'setRejectGate', enabled: true })
    state = applyOperatorAction(state, { type: 'reset' })
    safe(state)
    expect(state.resetRequired).toBe(true)
    state = applyOperatorAction(state, { type: 'clearFault', fault })
    state = advance(state, 5000)
    safe(state)
    expect(state.manual.jogConveyor).toBe(false)
    expect(state.manual.rejectGateForced).toBe(false)
    state = applyOperatorAction(state, { type: 'reset' })
    state = advance(state, 5000)
    safe(state)
    expect(state.resetRequired).toBe(false)
  })

  it('Stop and mode changes remove motion immediately and mode changes do not start auto', () => {
    let state = applyOperatorAction(createInitialSimulationState(), { type: 'setMode', mode: 'manual' })
    state = applyOperatorAction(state, { type: 'setJog', enabled: true })
    state = scanCycle(state)
    expect(state.tags.MTR_CONV_RUN.value).toBe(true)
    safe(applyOperatorAction(state, { type: 'stop' }))
    state = applyOperatorAction(state, { type: 'setMode', mode: 'auto' })
    safe(advance(state, 5000))
    expect(state.runRequested).toBe(false)
  })

  it('alarm acknowledgement does not release a held stop', () => {
    let state = scanCycle(applyOperatorAction(createInitialSimulationState(), { type: 'emergencyStop' }))
    state = applyOperatorAction(state, { type: 'acknowledgeAlarm', alarmId: 'ALM_ESTOP_ACTIVE' })
    expect(state.alarms.find((alarm) => alarm.id === 'ALM_ESTOP_ACTIVE')?.acknowledged).toBe(true)
    state = applyOperatorAction(state, { type: 'start' })
    safe(scanCycle(state))
    expect(state.emergencyStop).toBe(true)
    expect(state.resetRequired).toBe(true)
  })
})

describe('scan time and production accounting', () => {
  it('accelerated scans give exactly the same result as fixed scans', () => {
    const start = applyOperatorAction(createInitialSimulationState('frequent-infeed-jams'), { type: 'start' })
    let fixed = start
    for (let i = 0; i < 240; i++) fixed = scanCycle(fixed)
    expect(advance(start, 60000)).toEqual(fixed)
  })

  it('accounts for planned stop, recovery and idle using an independent interval ledger', () => {
    let state = advance(createInitialSimulationState(), 5000)
    expect(state.counters.plannedRuntimeMs).toBe(0)
    state = applyOperatorAction(state, { type: 'start' })
    let planned = 0; let plannedStop = 0; let lost = 0
    for (let tick = 0; tick < 100; tick++) {
      if (tick === 20) state = applyOperatorAction(state, { type: 'injectFault', fault: 'maintenanceStop', durationMs: 2000 })
      if (tick === 30) state = applyOperatorAction(state, { type: 'reset' })
      if (tick === 45) state = applyOperatorAction(state, { type: 'start' })
      if (tick === 80) state = applyOperatorAction(state, { type: 'stop' })
      const scheduled = tick < 80
      // The 2 s maintenance occupies exactly eight 250 ms intervals, [10s, 12s).
      const maintenance = tick >= 20 && tick <= 27
      const unavailable = tick >= 20 && tick <= 44
      if (scheduled && maintenance) plannedStop += 250
      if (scheduled && !maintenance) planned += 250
      if (scheduled && !maintenance && unavailable) lost += 250
      state = scanCycle(state)
    }
    expect(state.counters.plannedRuntimeMs).toBe(planned)
    expect(state.counters.plannedStopMs).toBe(plannedStop)
    expect(state.counters.downtimeMs).toBe(lost)
    expect(state.metrics.availability).toBeCloseTo((planned - lost) / planned)
    expect(state.counters.totalParts).toBe(state.counters.goodParts + state.counters.rejects)
    const acceptedEvents = state.events.filter((event) => event.category === 'production' && event.message.includes('accepted'))
    expect(acceptedEvents.length).toBe(state.counters.goodParts)
  })

  it.each([0, -1, NaN, Infinity])('rejects invalid scan duration %s', (ms) => {
    expect(() => scanCycle(createInitialSimulationState(), ms)).toThrow('finite and positive')
  })
})

describe('manual product containment', () => {
  it.each(['forced', 'scheduled'])('clears %s stuck sensor and resets at the same logical tick', (source) => {
    let run = dispatchRun(createRun({ ...defaultScenario, conveyorUnitsPerSecond: 5 }), { type: 'start' })
    while (run.state.machineState !== 'inspect' && run.bundle.durationTicks < 100) run = advanceRun(run)
    run = dispatchRun(run, source === 'forced' ? { type: 'forceSensor', tag: 'PE_INSPECTION_PRESENT', value: true } : { type: 'injectFault', fault: 'stuckPhotoeye', durationMs: 20000 })
    run = advanceRun(run, 20)
    expect(run.state.resetRequired).toBe(true)
    run = dispatchRun(run, source === 'forced' ? { type: 'forceSensor', tag: 'PE_INSPECTION_PRESENT', value: undefined } : { type: 'clearFault', fault: 'stuckPhotoeye' })
    run = dispatchRun(run, { type: 'reset' })
    run = advanceRun(run, 12)
    expect(run.state.resetRequired).toBe(false)
    safe(run.state)
    run = advanceRun(dispatchRun(run, { type: 'start' }), 160)
    expect(run.state.counters.totalParts).toBeGreaterThan(0)
    expect(run.state.resetRequired).toBe(false)
  })
  it('does not count intentional mode-change and inspection holds as a stuck sensor', () => {
    let run = dispatchRun(createRun({ ...defaultScenario, conveyorUnitsPerSecond: 5 }), { type: 'start' })
    while (run.state.machineState !== 'inspect' && run.bundle.durationTicks < 100) run = advanceRun(run)
    expect(run.state.machineState).toBe('inspect')
    run = dispatchRun(run, { type: 'setMode', mode: 'manual' })
    run = dispatchRun(run, { type: 'setMode', mode: 'auto' })
    run = dispatchRun(run, { type: 'start' })
    run = advanceRun(run, 160)
    expect(run.state.counters.totalParts).toBeGreaterThan(0)
    expect(run.state.resetRequired).toBe(false)
    expect(run.state.alarms).toHaveLength(0)
  })
  it.each([0, 1])('retains uninspected packages at inspection with reject probability %s', (rejectRate) => {
    let run = dispatchRun(createRun({ ...defaultScenario, rejectRate, inspectionMode: 'external' }), { type: 'start' })
    run = advanceRun(run)
    run = dispatchRun(run, { type: 'setMode', mode: 'manual' })
    run = dispatchRun(run, { type: 'setJog', enabled: true })
    run = advanceRun(run, 80)
    expect(run.state.counters.totalParts).toBe(0)
    expect(run.state.packages).toHaveLength(1)
    expect(run.state.packages[0].position).toBe(44)
    expect(run.state.packages[0].inspected).toBe(false)
    expect(run.state.alarms.some((alarm) => alarm.id === 'ALM_INSPECTION_MISSING' && alarm.active)).toBe(true)
    safe(run.state)
    expect(run.state.nextPackageId - 1).toBe(run.state.packages.length + run.state.counters.totalParts)
  })

  it('holds rejected parts until manual gate actuation and accounts for every created part', () => {
    let run = advanceRun(dispatchRun(createRun({ ...defaultScenario, rejectRate: 1 }), { type: 'start' }))
    run = dispatchRun(run, { type: 'setMode', mode: 'manual' })
    run = dispatchRun(run, { type: 'setJog', enabled: true })
    run = advanceRun(run, 80)
    expect(run.state.packages[0].position).toBe(65)
    expect(run.state.counters.totalParts).toBe(0)
    run = dispatchRun(run, { type: 'setRejectGate', enabled: true })
    run = advanceRun(run, 4)
    expect(run.state.counters.rejects).toBe(1)
    expect(run.state.packages).toHaveLength(0)
    expect(run.state.nextPackageId - 1).toBe(run.state.counters.totalParts)
  })
})
