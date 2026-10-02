import type {
  AlarmRecord,
  CellEvent,
  CounterBank,
  HistorianPoint,
  MachineState,
  ManualState,
  OperatorAction,
  PackageItem,
  ScanPhase,
  ScenarioEventType,
  SimulationState,
  TimerBank,
} from '../types'
import { acknowledgeAlarm, clearInactiveAlarms, reconcileAlarms } from '../simulation/alarms'
import { calculateOeeMetrics, IDEAL_CYCLE_TIME_MS } from '../simulation/oee'
import { defaultScenario, getActiveScenarioEvents, getScenarioById } from '../simulation/scenarios'
import {
  cloneTagDatabase,
  createTagDatabase,
  setMachineStateTag,
  setTagValue,
} from '../simulation/tagDatabase'
import { validateInspectionResult } from '../simulation/inspection'

const INSPECTION_DWELL_MS = 1200
const REJECT_ACTUATION_MS = 850
const MOTOR_OVERLOAD_DELAY_MS = 1800
const SENSOR_STUCK_DELAY_MS = 4200
const INFEED_TIMEOUT_MS = 6200
const RECOVERY_TIME_MS = 2600
const HISTORIAN_INTERVAL_MS = 1000
const MAX_HISTORY_POINTS = 150
const MAX_SENSOR_EVENTS = 80

const sensorTags = ['PE_INFEED_BLOCKED', 'PE_INSPECTION_PRESENT', 'PE_EXIT_BLOCKED']

function createTimers(): TimerBank {
  return {
    stateElapsedMs: 0,
    infeedTimeoutMs: 0,
    inspectionDwellMs: 0,
    rejectActuationMs: 0,
    motorOverloadDelayMs: 0,
    sensorStuckMs: 0,
    recoveryTimerMs: 0,
    historianElapsedMs: 0,
  }
}

function createCounters(): CounterBank {
  return {
    goodParts: 0,
    rejects: 0,
    totalParts: 0,
    faultsByType: {},
    downtimeMs: 0,
    jamCount: 0,
    motorRuntimeMs: 0,
    recoveryEvents: 0,
    plannedRuntimeMs: 0,
    plannedStopMs: 0,
  }
}

function createManualState(): ManualState {
  return {
    jogConveyor: false,
    rejectGateForced: false,
    forcedSensors: {},
  }
}

function seededUnit(seed: number, index: number): number {
  // Integer mixing avoids platform-dependent transcendental rounding in replay.
  let value = (seed ^ Math.imul(index, 0x9e3779b9)) >>> 0
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad)
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97)
  return ((value ^ (value >>> 15)) >>> 0) / 4294967296
}

function getRejectRate(state: SimulationState, elapsedMs: number): number {
  const drift = (elapsedMs / 60000) * state.scenario.qualityDriftPerMinute
  return Math.min(1, Math.max(0, state.scenario.rejectRate + drift))
}

function createPackage(state: SimulationState, elapsedMs: number): PackageItem {
  const qualityScore = seededUnit(state.scenario.seed, state.nextPackageId)
  return {
    id: state.nextPackageId,
    position: 0,
    qualityScore,
    reject: qualityScore < getRejectRate(state, elapsedMs),
    inspected: false,
    diverted: false,
    counted: false,
    createdAtMs: elapsedMs,
  }
}

function isActive(type: ScenarioEventType, activeTypes: Set<ScenarioEventType>): boolean {
  return activeTypes.has(type)
}

function cloneCounters(counters: CounterBank): CounterBank {
  return {
    ...counters,
    faultsByType: { ...counters.faultsByType },
  }
}

function getStationFromPackages(packages: PackageItem[]): string {
  const first = packages.find((item) => !item.counted)
  if (!first) {
    return 'No package in cell'
  }
  if (first.position < 18) {
    return 'Infeed'
  }
  if (first.position < 44) {
    return 'Index conveyor'
  }
  if (first.position < 58) {
    return 'Inspection'
  }
  if (first.position < 78) {
    return first.reject ? 'Reject diverter' : 'Accept lane'
  }
  return 'Discharge'
}

function setStateWithTimer(
  currentState: MachineState,
  nextState: MachineState,
  timers: TimerBank,
): MachineState {
  if (currentState !== nextState) {
    timers.stateElapsedMs = 0
  }
  return nextState
}

function getOperatorInstruction(state: MachineState, alarms: AlarmRecord[], mode: string): string {
  const active = alarms.find((alarm) => alarm.active)
  if (active) {
    return `${active.message}: ${active.recoverySteps}`
  }
  if (mode === 'manual') {
    return 'Manual mode is enabled. Use jog and force controls for controlled troubleshooting.'
  }
  if (state === 'starting') {
    return 'Starting sequence active. Verify guards, air, and conveyor readiness.'
  }
  if (state === 'recovery') {
    return 'Recovery timer active. Confirm line is clear before returning to auto production.'
  }
  if (state === 'stopped' || state === 'idle') {
    return 'Press Start to run the packaging cell in auto mode.'
  }
  return 'Cell running. Monitor alarms, reject trend, and OEE loss categories.'
}

function addHistorianPoint(state: SimulationState, timers: TimerBank): HistorianPoint[] {
  if (timers.historianElapsedMs < HISTORIAN_INTERVAL_MS) {
    return state.historian
  }

  timers.historianElapsedMs = 0
  const point: HistorianPoint = {
    timeMs: state.elapsedMs,
    cycleTimeMs: state.metrics.actualCycleTimeMs,
    throughputPerMinute: state.metrics.throughputPerMinute,
    oee: state.metrics.oee,
    rejectRate: state.metrics.rejectRate,
    downtimeSeconds: state.metrics.unplannedDowntimeMs / 1000,
    motorLoadPct: state.metrics.motorLoadPct,
    motorCurrentA: state.metrics.motorCurrentA,
    goodParts: state.counters.goodParts,
    rejects: state.counters.rejects,
    machineState: state.machineState,
  }

  return [...state.historian, point].slice(-MAX_HISTORY_POINTS)
}

function logSensorEvents(previous: SimulationState, next: SimulationState): SimulationState {
  const newEvents = sensorTags.flatMap((tag) => {
    const oldValue = Boolean(previous.tags[tag]?.value)
    const newValue = Boolean(next.tags[tag]?.value)
    return oldValue !== newValue ? [{ timeMs: next.elapsedMs, tag, value: newValue }] : []
  })

  if (newEvents.length === 0) {
    return next
  }

  return {
    ...next,
    sensorEvents: [...next.sensorEvents, ...newEvents].slice(-MAX_SENSOR_EVENTS),
  }
}

export function createInitialSimulationState(scenarioId = defaultScenario.id): SimulationState {
  const scenario = getScenarioById(scenarioId)
  const counters = createCounters()
  const metrics = calculateOeeMetrics(counters, 0, 0, 0)

  return {
    elapsedMs: 0,
    scanTimeMs: 250,
    runRequested: false,
    emergencyStop: false,
    resetRequired: false,
    productionScheduled: false,
    mode: 'auto',
    machineState: 'stopped',
    previousMachineState: 'stopped',
    activeStation: 'No package in cell',
    operatorInstruction: 'Press Start to run the packaging cell in auto mode.',
    scenario,
    tags: createTagDatabase(),
    alarms: [],
    packages: [],
    timers: createTimers(),
    counters,
    metrics,
    historian: [],
    sensorEvents: [],
    manual: createManualState(),
    scanPhases: [
      { name: 'read inputs', status: 'waiting' },
      { name: 'run state machine', status: 'waiting' },
      { name: 'update timers/counters', status: 'waiting' },
      { name: 'update outputs', status: 'waiting' },
      { name: 'log historian data', status: 'waiting' },
    ],
    nextPackageId: 1,
    events: [],
    nextEventId: 1,
    stateDurationsMs: {},
    inspectionResults: [],
  }
}

function logEvent(
  state: SimulationState,
  category: CellEvent['category'],
  message: string,
): SimulationState {
  return {
    ...state,
    nextEventId: state.nextEventId + 1,
    events: [
      ...state.events,
      { id: state.nextEventId, timeMs: state.elapsedMs, category, message },
    ].slice(-2000),
  }
}

function holdOutputs(state: SimulationState): SimulationState {
  const tags = cloneTagDatabase(state.tags)
  for (const name of ['MTR_CONV_RUN', 'CYL_REJECT_EXT'])
    setTagValue(tags, name, false, state.elapsedMs)
  for (const name of ['MTR_CONV_SPEED_PCT', 'MTR_CONV_CURRENT_A', 'DRV_CONV_LOAD_PCT'])
    setTagValue(tags, name, 0, state.elapsedMs)
  setMachineStateTag(tags, state.machineState, state.elapsedMs)
  return {
    ...state,
    tags,
    manual: { ...state.manual, jogConveyor: false, rejectGateForced: false },
  }
}

/** Physical conditions are separate from alarm acknowledgements and the reset latch. */
export function getInterlockReasons(state: SimulationState): string[] {
  const conditions = getActiveScenarioEvents(state.scenario, state.elapsedMs)
    .filter((event) => event.type !== 'slowActuator')
    .map((event) => event.label)
  if (state.emergencyStop) conditions.unshift('Emergency-stop button is held')
  if (state.manual.forcedSensors.PE_INSPECTION_PRESENT === true)
    conditions.push('Inspection sensor is forced high')
  if (
    state.scenario.inspectionMode === 'external' &&
    state.timers.inspectionDwellMs >= 2500 &&
    state.packages.some((item) => !item.inspected && item.position >= 44 && item.position <= 56)
  )
    conditions.push('A valid inspection result is required for the waiting package')
  return conditions
}

function rejectAction(state: SimulationState, reason: string): SimulationState {
  return { ...state, operatorInstruction: reason }
}

function manualCommandBlockers(state: SimulationState): string[] {
  return [
    ...(state.mode !== 'manual' ? ['manual mode is required'] : []),
    ...(state.resetRequired ? ['the reset latch is set'] : []),
    ...(state.machineState === 'recovery'
      ? [`recovery delay is incomplete (${state.timers.recoveryTimerMs}/${RECOVERY_TIME_MS} ms)`]
      : []),
    ...getInterlockReasons(state),
  ]
}

function applyAction(state: SimulationState, action: OperatorAction): SimulationState {
  if (action.type === 'setScenario') {
    return createInitialSimulationState(action.scenarioId)
  }

  if (action.type === 'acknowledgeAlarm') {
    if (!state.alarms.some((alarm) => alarm.id === action.alarmId))
      return rejectAction(
        state,
        `Acknowledgement rejected: no alarm record named ${action.alarmId}.`,
      )
    return {
      ...state,
      alarms: acknowledgeAlarm(state.alarms, action.alarmId, state.elapsedMs),
      operatorInstruction: `Acknowledged ${action.alarmId}; physical conditions and the reset latch are unchanged.`,
    }
  }

  if (action.type === 'clearAlarmHistory') {
    return {
      ...state,
      alarms: clearInactiveAlarms(state.alarms),
      operatorInstruction: 'Inactive alarm records cleared. Active alarms remain visible.',
    }
  }

  if (action.type === 'setMode') {
    return holdOutputs({
      ...state,
      mode: action.mode,
      runRequested: false,
      machineState:
        state.resetRequired || state.machineState === 'recovery' ? state.machineState : 'stopped',
      manual: createManualState(),
      operatorInstruction: `Selected ${action.mode} mode. Outputs are off; any active recovery delay still applies.`,
    })
  }

  if (action.type === 'setJog') {
    const blockers = manualCommandBlockers(state)
    if (action.enabled && blockers.length) {
      return rejectAction(state, `Jog rejected: ${blockers.join('; ')}.`)
    }
    return {
      ...state,
      operatorInstruction: action.enabled
        ? 'Jog requested. Inspection and reject containment still hold the conveyor at each station.'
        : 'Jog released.',
      manual: {
        ...state.manual,
        jogConveyor: action.enabled,
      },
    }
  }

  if (action.type === 'setRejectGate') {
    const blockers = manualCommandBlockers(state)
    if (action.enabled && blockers.length) {
      return rejectAction(state, `Reject command denied: ${blockers.join('; ')}.`)
    }
    return {
      ...state,
      operatorInstruction: action.enabled
        ? 'Manual reject gate requested; all motion interlocks remain enforced.'
        : 'Manual reject gate released.',
      manual: {
        ...state.manual,
        rejectGateForced: action.enabled,
      },
    }
  }

  if (action.type === 'forceSensor') {
    if (!sensorTags.includes(action.tag))
      return rejectAction(state, 'Sensor override rejected: this tag is not forceable.')
    return {
      ...state,
      operatorInstruction: `${action.tag}: ${action.value === undefined ? 'override removed' : `forced ${action.value ? 'high' : 'low'}`}.`,
      manual: {
        ...state.manual,
        forcedSensors: {
          ...state.manual.forcedSensors,
          [action.tag]: action.value,
        },
      },
    }
  }

  if (action.type === 'start') {
    const conditions = getInterlockReasons(state)
    if (
      state.mode !== 'auto' ||
      state.resetRequired ||
      state.machineState === 'recovery' ||
      conditions.length
    ) {
      return rejectAction(
        state,
        `Start rejected: ${conditions.join('; ') || (state.mode !== 'auto' ? 'select auto mode' : 'complete Reset and recovery first')}.`,
      )
    }
    return {
      ...state,
      runRequested: true,
      productionScheduled: true,
      machineState:
        state.machineState === 'stopped' || state.machineState === 'idle'
          ? 'starting'
          : state.machineState,
      timers: {
        ...state.timers,
        stateElapsedMs: state.runRequested ? state.timers.stateElapsedMs : 0,
      },
      operatorInstruction: state.runRequested
        ? 'Run request is already active; the current cycle continues.'
        : 'Start accepted. Starting permissive delay is active.',
    }
  }

  if (action.type === 'stop') {
    return holdOutputs({
      ...state,
      runRequested: false,
      productionScheduled: false,
      machineState: state.resetRequired
        ? 'fault'
        : state.machineState === 'recovery'
          ? 'recovery'
          : 'stopped',
      manual: createManualState(),
      operatorInstruction:
        'Stop accepted. Production window closed and outputs off; any recovery delay still applies.',
    })
  }

  if (action.type === 'emergencyStop') {
    return holdOutputs({
      ...state,
      runRequested: false,
      emergencyStop: true,
      resetRequired: true,
      machineState: 'fault',
      operatorInstruction:
        'Emergency stop held. Release the button, clear the cell, Reset, then Start.',
    })
  }

  if (action.type === 'releaseEmergencyStop') {
    return {
      ...state,
      emergencyStop: false,
      operatorInstruction: state.resetRequired
        ? 'Button released. The stop remains latched until Reset; Reset never starts motion.'
        : 'Emergency-stop button is released; no reset latch is active.',
    }
  }

  if (action.type === 'injectFault') {
    if (
      !Number.isFinite(action.durationMs) ||
      action.durationMs < state.scanTimeMs ||
      action.durationMs > 600000
    ) {
      return rejectAction(state, 'Fault duration must be between one scan and ten minutes.')
    }
    if (state.elapsedMs + action.durationMs > 600000)
      return rejectAction(
        state,
        'Fault injection rejected: duration extends beyond this run’s ten-minute limit.',
      )
    if (state.scenario.events.length >= 100)
      return rejectAction(
        state,
        'Fault injection rejected: this recipe already contains 100 events.',
      )
    return {
      ...state,
      operatorInstruction: `${action.fault} injected for ${action.durationMs / 1000} s; inputs are evaluated on the next scan.`,
      scenario: {
        ...state.scenario,
        events: [
          ...state.scenario.events,
          {
            type: action.fault,
            atMs: state.elapsedMs,
            durationMs: action.durationMs,
            label: `Injected ${action.fault}`,
          },
        ],
      },
    }
  }

  if (action.type === 'clearFault') {
    return {
      ...state,
      operatorInstruction: `${action.fault}: physical condition cleared. A trip still requires Reset and a separate Start.`,
      scenario: {
        ...state.scenario,
        events: state.scenario.events.map((event) =>
          event.type === action.fault &&
          event.atMs <= state.elapsedMs &&
          event.atMs + event.durationMs > state.elapsedMs
            ? { ...event, durationMs: state.elapsedMs - event.atMs }
            : event,
        ),
      },
    }
  }

  if (action.type === 'inspectionResult') {
    if (state.scenario.inspectionMode !== 'external')
      return rejectAction(state, 'Inspection rejected: recipe uses simulated inspection.')
    try {
      const result = validateInspectionResult(action.result)
      const previous = state.inspectionResults.find((item) => item.eventId === result.eventId)
      if (previous)
        return rejectAction(
          state,
          JSON.stringify(previous) === JSON.stringify(result)
            ? 'Duplicate inspection event ignored.'
            : 'Inspection rejected: event ID conflicts with an earlier result.',
        )
      const item = state.packages.find(
        (item) =>
          item.id === result.packageId &&
          item.position >= 44 &&
          item.position <= 56 &&
          !item.inspected,
      )
      if (!item)
        return rejectAction(state, 'Inspection rejected: package is not awaiting inspection.')
      if (
        result.capturedAtMs < item.createdAtMs ||
        result.capturedAtMs > state.elapsedMs ||
        state.elapsedMs - result.capturedAtMs > 2500
      )
        return rejectAction(
          state,
          'Inspection rejected: capture timestamp is stale or from the future.',
        )
      if (state.inspectionResults.some((item) => item.frameId === result.frameId))
        return rejectAction(state, 'Inspection rejected: frame was already consumed.')
      return {
        ...state,
        packages: state.packages.map((item) =>
          item.id === result.packageId
            ? {
                ...item,
                inspected: true,
                reject: result.decision === 'reject',
                qualityScore: result.score,
              }
            : item,
        ),
        inspectionResults: [...state.inspectionResults, result],
        operatorInstruction: `Inspection ${result.eventId} accepted for package ${result.packageId}: ${result.decision}.`,
      }
    } catch (error) {
      return rejectAction(
        state,
        `Inspection rejected: ${error instanceof Error ? error.message : 'invalid event'}`,
      )
    }
  }

  const conditions = getInterlockReasons(state)
  if (conditions.length) return rejectAction(state, `Reset rejected: ${conditions.join('; ')}.`)
  if (!state.resetRequired)
    return rejectAction(state, 'Reset not required. Select auto mode and Start when ready.')
  return holdOutputs({
    ...state,
    resetRequired: false,
    runRequested: false,
    machineState: 'recovery',
    operatorInstruction:
      'Reset accepted. Recovery runs with outputs off; a separate Start is required.',
    timers: {
      ...state.timers,
      recoveryTimerMs: 0,
      stateElapsedMs: 0,
      sensorStuckMs: 0,
      motorOverloadDelayMs: 0,
      infeedTimeoutMs: 0,
      inspectionDwellMs: 0,
      rejectActuationMs: 0,
    },
    counters: {
      ...state.counters,
      recoveryEvents: state.counters.recoveryEvents + 1,
    },
  })
}

export function applyOperatorAction(
  state: SimulationState,
  action: OperatorAction,
): SimulationState {
  let next = applyAction(state, action)
  const detail = action.type.replace(/([A-Z])/g, ' $1').toLowerCase()
  next = logEvent(next, 'command', `${detail}: ${next.operatorInstruction}`)
  if (state.machineState !== next.machineState)
    next = logEvent(
      next,
      'transition',
      `${state.machineState} → ${next.machineState}: ${next.operatorInstruction}`,
    )
  return next
}

export function scanCycle(state: SimulationState, deltaMs = state.scanTimeMs): SimulationState {
  if (!Number.isFinite(deltaMs) || deltaMs <= 0)
    throw new Error('Scan duration must be finite and positive')
  // Subdivide accelerated runs so event boundaries and station windows cannot be skipped.
  if (deltaMs > state.scanTimeMs) {
    let next = state
    for (let remaining = deltaMs; remaining > 0; remaining -= state.scanTimeMs)
      next = scanCycle(next, Math.min(remaining, state.scanTimeMs))
    return next
  }
  const elapsedMs = state.elapsedMs + deltaMs
  // Inputs are sampled at the beginning of [clock, clock + scan). A one-scan
  // event therefore affects exactly one complete scan rather than disappearing.
  const activeEvents = getActiveScenarioEvents(state.scenario, state.elapsedMs)
  const activeTypes = new Set(activeEvents.map((event) => event.type))
  const tags = cloneTagDatabase(state.tags)
  const timers = { ...state.timers }
  const counters = cloneCounters(state.counters)
  const scanPhases: ScanPhase[] = []
  let packages = state.packages.map((item) => ({ ...item }))
  let machineState = state.machineState
  let resetRequired = state.resetRequired
  let runRequested = state.runRequested

  timers.stateElapsedMs += deltaMs
  timers.historianElapsedMs += deltaMs
  scanPhases.push({ name: 'read inputs', status: `${activeEvents.length} scheduled event(s)` })

  const motorOverloadPending = isActive('motorOverload', activeTypes)
  const rejectGateFailure = isActive('rejectGateFailure', activeTypes)
  const airLow = isActive('compressedAirLoss', activeTypes)
  const infeedJam = isActive('infeedJam', activeTypes)
  const stuckPhotoeye = isActive('stuckPhotoeye', activeTypes)
  const maintenanceStop = isActive('maintenanceStop', activeTypes)
  const slowActuator = isActive('slowActuator', activeTypes)

  timers.motorOverloadDelayMs = motorOverloadPending ? timers.motorOverloadDelayMs + deltaMs : 0
  const baseInfeed = packages.some((item) => item.position >= 4 && item.position <= 15)
  const baseInspection = packages.some(
    (item) => item.position >= 44 && item.position <= 56 && !item.counted,
  )
  const baseExit = packages.some((item) => item.position >= 90 && item.position <= 99)

  const forcedInfeed = state.manual.forcedSensors.PE_INFEED_BLOCKED
  const forcedInspection = state.manual.forcedSensors.PE_INSPECTION_PRESENT
  const forcedExit = state.manual.forcedSensors.PE_EXIT_BLOCKED
  const infeedBlocked = forcedInfeed ?? (baseInfeed || infeedJam)
  const inspectionPresent = forcedInspection ?? (baseInspection || stuckPhotoeye)
  const exitBlocked = forcedExit ?? baseExit

  const explicitStuckSensor = stuckPhotoeye || forcedInspection === true
  if (explicitStuckSensor) timers.sensorStuckMs += deltaMs
  else if (!inspectionPresent || state.resetRequired) timers.sensorStuckMs = 0
  else if (state.tags.MTR_CONV_RUN.value) timers.sensorStuckMs += deltaMs
  // Intentional inspection, startup and recovery holds do not consume a normal
  // sensor's allowed transport time. Explicit stuck-input faults still time out.
  timers.infeedTimeoutMs =
    state.runRequested && !infeedBlocked && packages.length === 0
      ? timers.infeedTimeoutMs + deltaMs
      : 0

  const activeAlarmIds = new Set<string>()
  if (state.emergencyStop) activeAlarmIds.add('ALM_ESTOP_ACTIVE')
  if (infeedJam || timers.infeedTimeoutMs >= INFEED_TIMEOUT_MS) activeAlarmIds.add('ALM_JAM_INFEED')
  if (timers.motorOverloadDelayMs >= MOTOR_OVERLOAD_DELAY_MS)
    activeAlarmIds.add('ALM_MOTOR_OVERLOAD')
  const expectedSensorResidenceMs =
    12000 / (state.scenario.conveyorUnitsPerSecond * (slowActuator ? 0.4 : 1)) +
    4 * state.scanTimeMs
  if (timers.sensorStuckMs >= Math.max(SENSOR_STUCK_DELAY_MS, expectedSensorResidenceMs))
    activeAlarmIds.add('ALM_SENSOR_STUCK')
  if (airLow) activeAlarmIds.add('ALM_AIR_PRESSURE_LOW')

  const inspectionPackage = packages.find(
    (item) => item.position >= 44 && item.position <= 56 && !item.inspected,
  )
  if (
    state.scenario.inspectionMode === 'external' &&
    inspectionPackage &&
    timers.inspectionDwellMs >= 2500
  )
    activeAlarmIds.add('ALM_INSPECTION_MISSING')
  const rejectPackage = packages.find(
    (item) =>
      item.inspected && item.reject && item.position >= 65 && item.position <= 76 && !item.diverted,
  )
  const criticalAlarmPending =
    activeAlarmIds.has('ALM_MOTOR_OVERLOAD') ||
    activeAlarmIds.has('ALM_AIR_PRESSURE_LOW') ||
    activeAlarmIds.has('ALM_ESTOP_ACTIVE')
  const blockedAlarmPending =
    activeAlarmIds.has('ALM_JAM_INFEED') ||
    activeAlarmIds.has('ALM_SENSOR_STUCK') ||
    maintenanceStop

  if (rejectGateFailure) {
    activeAlarmIds.add('ALM_REJECT_GATE_FAIL')
  }

  const alarmResult = reconcileAlarms(state.alarms, activeAlarmIds, elapsedMs)
  const alarms = alarmResult.alarms
  alarmResult.raisedAlarmIds.forEach((alarmId) => {
    counters.faultsByType[alarmId] = (counters.faultsByType[alarmId] ?? 0) + 1
    if (alarmId === 'ALM_JAM_INFEED') {
      counters.jamCount += 1
    }
  })

  if (
    criticalAlarmPending ||
    activeAlarmIds.has('ALM_REJECT_GATE_FAIL') ||
    activeAlarmIds.has('ALM_INSPECTION_MISSING')
  ) {
    resetRequired = true
    runRequested = false
    machineState = setStateWithTimer(machineState, 'fault', timers)
  } else if (blockedAlarmPending) {
    resetRequired = true
    runRequested = false
    machineState = setStateWithTimer(machineState, 'blocked', timers)
  } else if (resetRequired) {
    machineState = setStateWithTimer(machineState, 'fault', timers)
  } else if (machineState === 'recovery') {
    timers.recoveryTimerMs += deltaMs
    if (timers.recoveryTimerMs >= RECOVERY_TIME_MS) {
      machineState = setStateWithTimer(machineState, 'idle', timers)
      timers.recoveryTimerMs = 0
    }
  } else if (!runRequested && state.mode === 'auto') {
    machineState = setStateWithTimer(machineState, 'stopped', timers)
  } else if (runRequested && machineState === 'stopped') {
    machineState = setStateWithTimer(machineState, 'starting', timers)
  } else if (machineState === 'starting') {
    if (timers.stateElapsedMs >= 1400)
      machineState = setStateWithTimer(machineState, 'infeed', timers)
  } else if (runRequested || state.mode === 'manual') {
    if (inspectionPackage) {
      machineState = setStateWithTimer(machineState, 'inspect', timers)
    } else if (rejectPackage) {
      machineState = setStateWithTimer(machineState, 'reject', timers)
    } else if (exitBlocked) {
      machineState = setStateWithTimer(machineState, 'discharge', timers)
    } else if (infeedBlocked) {
      machineState = setStateWithTimer(machineState, 'infeed', timers)
    } else {
      machineState = setStateWithTimer(
        machineState,
        packages.some((item) => item.inspected && !item.reject) ? 'accept' : 'index conveyor',
        timers,
      )
    }
  }
  scanPhases.push({ name: 'run state machine', status: machineState })

  const canRunAutoConveyor =
    runRequested &&
    state.mode === 'auto' &&
    !['stopped', 'fault', 'blocked', 'recovery', 'starting', 'inspect', 'reject'].includes(
      machineState,
    )
  const motionPermitted =
    !resetRequired &&
    !criticalAlarmPending &&
    !blockedAlarmPending &&
    !rejectGateFailure &&
    machineState !== 'recovery'
  const stationHold = Boolean(inspectionPackage || rejectPackage)
  const conveyorRun =
    motionPermitted &&
    !stationHold &&
    (canRunAutoConveyor || (state.mode === 'manual' && state.manual.jogConveyor))
  const rejectCommand =
    motionPermitted &&
    ((state.mode === 'auto' &&
      runRequested &&
      machineState === 'reject' &&
      Boolean(rejectPackage)) ||
      (state.mode === 'manual' && state.manual.rejectGateForced))
  let createdPackages = 0

  if (
    runRequested &&
    state.mode === 'auto' &&
    packages.length === 0 &&
    !['blocked', 'fault', 'recovery', 'stopped'].includes(machineState)
  ) {
    packages = [createPackage(state, elapsedMs)]
    createdPackages = 1
  } else if (
    runRequested &&
    state.mode === 'auto' &&
    conveyorRun &&
    packages.length < 5 &&
    Math.min(...packages.map((item) => item.position), 100) > state.scenario.packageSpacing
  ) {
    packages = [...packages, createPackage(state, elapsedMs)]
    createdPackages = 1
  }

  if (machineState === 'inspect' && inspectionPackage) {
    timers.inspectionDwellMs += deltaMs
    if (
      state.scenario.inspectionMode !== 'external' &&
      timers.inspectionDwellMs >= INSPECTION_DWELL_MS * (slowActuator ? 3 : 1)
    ) {
      packages = packages.map((item) =>
        item.id === inspectionPackage.id ? { ...item, inspected: true } : item,
      )
      timers.inspectionDwellMs = 0
    }
  } else if (!activeAlarmIds.has('ALM_INSPECTION_MISSING')) {
    timers.inspectionDwellMs = 0
  }

  if (rejectCommand && machineState === 'reject' && rejectPackage) {
    timers.rejectActuationMs += deltaMs
    if (timers.rejectActuationMs >= REJECT_ACTUATION_MS && !rejectGateFailure && !airLow) {
      packages = packages.map((item) =>
        item.id === rejectPackage.id ? { ...item, diverted: true, counted: true } : item,
      )
      counters.rejects += 1
      counters.totalParts += 1
      timers.rejectActuationMs = 0
    }
  } else {
    timers.rejectActuationMs = 0
  }

  const motorLoadPct = conveyorRun
    ? Math.min(98, 38 + packages.length * 9 + (motorOverloadPending ? 44 : 0))
    : 0
  const motorCurrentA = conveyorRun ? Number((1.8 + motorLoadPct * 0.045).toFixed(2)) : 0
  if (conveyorRun) {
    counters.motorRuntimeMs += deltaMs
    const move = (state.scenario.conveyorUnitsPerSecond * deltaMs * (slowActuator ? 0.4 : 1)) / 1000
    packages = packages.map((item) => ({
      ...item,
      position: Math.min(item.inspected ? (item.reject ? 65 : 110) : 44, item.position + move),
    }))
  }

  packages.forEach((item) => {
    if (item.position >= 100 && item.inspected && !item.reject && !item.counted) {
      item.counted = true
      counters.goodParts += 1
      counters.totalParts += 1
    }
  })
  packages = packages.filter((item) => !item.counted)

  if (state.productionScheduled && maintenanceStop) counters.plannedStopMs += deltaMs
  if (state.productionScheduled && !maintenanceStop) counters.plannedRuntimeMs += deltaMs
  if (
    state.productionScheduled &&
    !maintenanceStop &&
    (!runRequested ||
      ['blocked', 'fault', 'recovery'].includes(machineState) ||
      state.mode === 'manual')
  ) {
    counters.downtimeMs += deltaMs
  }
  scanPhases.push({ name: 'update timers/counters', status: `${counters.totalParts} complete` })

  const metrics = calculateOeeMetrics(counters, elapsedMs, motorLoadPct, motorCurrentA)
  setTagValue(
    tags,
    'PE_INFEED_BLOCKED',
    infeedBlocked,
    elapsedMs,
    forcedInfeed === undefined ? 'Good' : 'Forced',
  )
  setTagValue(
    tags,
    'PE_INSPECTION_PRESENT',
    inspectionPresent,
    elapsedMs,
    forcedInspection === undefined ? 'Good' : 'Forced',
  )
  setTagValue(
    tags,
    'PE_EXIT_BLOCKED',
    exitBlocked,
    elapsedMs,
    forcedExit === undefined ? 'Good' : 'Forced',
  )
  setTagValue(tags, 'PE_REJECT_CHUTE_CLEAR', !rejectCommand, elapsedMs)
  setTagValue(tags, 'AIR_MAIN_OK', !airLow, elapsedMs)
  setTagValue(tags, 'MTR_CONV_RUN', conveyorRun, elapsedMs)
  setTagValue(tags, 'MTR_CONV_FAULT', activeAlarmIds.has('ALM_MOTOR_OVERLOAD'), elapsedMs)
  setTagValue(tags, 'MTR_CONV_SPEED_PCT', conveyorRun ? 78 : 0, elapsedMs)
  setTagValue(tags, 'MTR_CONV_CURRENT_A', metrics.motorCurrentA, elapsedMs)
  setTagValue(tags, 'DRV_CONV_LOAD_PCT', metrics.motorLoadPct, elapsedMs)
  setTagValue(
    tags,
    'CYL_REJECT_EXT',
    rejectCommand,
    elapsedMs,
    state.manual.rejectGateForced ? 'Forced' : 'Good',
  )
  setTagValue(tags, 'MODE_AUTO', state.mode === 'auto', elapsedMs)
  setTagValue(tags, 'CNT_GOOD_PARTS', counters.goodParts, elapsedMs)
  setTagValue(tags, 'CNT_REJECTS', counters.rejects, elapsedMs)
  setTagValue(tags, 'CNT_TOTAL_PARTS', counters.totalParts, elapsedMs)
  setTagValue(tags, 'OEE_AVAILABILITY', metrics.availability, elapsedMs)
  setTagValue(tags, 'OEE_PERFORMANCE', metrics.performance, elapsedMs)
  setTagValue(tags, 'OEE_QUALITY', metrics.quality, elapsedMs)
  setTagValue(tags, 'OEE_OVERALL', metrics.oee, elapsedMs)
  setTagValue(
    tags,
    'CELL_THROUGHPUT_PPM',
    Number(metrics.throughputPerMinute.toFixed(2)),
    elapsedMs,
  )
  setTagValue(tags, 'CYCLE_TIME_MS', Number(metrics.actualCycleTimeMs.toFixed(0)), elapsedMs)
  setMachineStateTag(tags, machineState, elapsedMs)
  Object.values(tags)
    .filter((tag) => tag.name.startsWith('ALM_'))
    .forEach((tag) => setTagValue(tags, tag.name, activeAlarmIds.has(tag.name), elapsedMs))
  scanPhases.push({
    name: 'update outputs',
    status: conveyorRun ? 'motor run output true' : 'outputs held safe',
  })

  const baseNext: SimulationState = {
    ...state,
    elapsedMs,
    previousMachineState: state.machineState,
    machineState,
    resetRequired,
    runRequested,
    manual: motionPermitted
      ? state.manual
      : { ...state.manual, jogConveyor: false, rejectGateForced: false },
    stateDurationsMs: {
      ...state.stateDurationsMs,
      [machineState]: (state.stateDurationsMs[machineState] ?? 0) + deltaMs,
    },
    activeStation: getStationFromPackages(packages),
    operatorInstruction: getOperatorInstruction(machineState, alarms, state.mode),
    tags,
    alarms,
    packages,
    timers,
    counters,
    metrics,
    scanPhases,
    nextPackageId: state.nextPackageId + createdPackages,
  }
  const historian = addHistorianPoint(baseNext, timers)
  scanPhases.push({ name: 'log historian data', status: `${historian.length} points` })

  let next = logSensorEvents(state, {
    ...baseNext,
    historian,
    timers,
    scanPhases,
  })
  const reasons: Partial<Record<MachineState, string>> = {
    fault:
      alarms
        .filter((alarm) => alarm.active)
        .map((alarm) => alarm.message)
        .join('; ') || 'The reset latch remains set after the physical condition cleared',
    blocked: maintenanceStop
      ? 'Scheduled maintenance inhibits motion'
      : alarms
          .filter((alarm) => alarm.active)
          .map((alarm) => alarm.message)
          .join('; '),
    idle: `Recovery delay of ${RECOVERY_TIME_MS} ms completed; a separate motion command is required`,
    stopped: 'No automatic run request is active',
    starting: 'Start request requires the 1400 ms permissive delay',
    inspect: `Package ${inspectionPackage?.id} reached inspection; ${state.scenario.inspectionMode === 'external' ? 'a valid external result is required' : `seeded inspection dwell is ${INSPECTION_DWELL_MS * (slowActuator ? 3 : 1)} ms`}`,
    reject: `Package ${rejectPackage?.id} has a reject decision; hold for ${REJECT_ACTUATION_MS} ms of gate actuation`,
    discharge: `PE_EXIT_BLOCKED is high${forcedExit === true ? ' due to its manual override' : '; an inspected package is at discharge'}`,
    infeed:
      state.machineState === 'starting'
        ? 'Startup permissive delay completed'
        : 'PE_INFEED_BLOCKED is high',
    accept: 'An inspected package has an accept decision; conveyor advances toward discharge',
    'index conveyor':
      'No station hold or discharge input is active; advance toward the next station',
  }
  if (next.machineState !== state.machineState)
    next = logEvent(
      next,
      'transition',
      `${state.machineState} → ${next.machineState}: ${reasons[next.machineState] ?? next.operatorInstruction}`,
    )
  for (const id of alarmResult.raisedAlarmIds) next = logEvent(next, 'alarm', `${id} raised`)
  for (const alarm of state.alarms.filter((alarm) => alarm.active && !activeAlarmIds.has(alarm.id)))
    next = logEvent(next, 'alarm', `${alarm.id} condition cleared; reset latch remains independent`)
  if (counters.goodParts > state.counters.goodParts)
    next = logEvent(
      next,
      'production',
      `${counters.goodParts - state.counters.goodParts} accepted; total good ${counters.goodParts}`,
    )
  if (counters.rejects > state.counters.rejects)
    next = logEvent(
      next,
      'production',
      `${counters.rejects - state.counters.rejects} rejected; total rejected ${counters.rejects}`,
    )
  if (resetRequired && !alarms.some((alarm) => alarm.active))
    next.operatorInstruction =
      'Physical conditions cleared. Reset is still required, followed by a separate Start.'
  return next
}

export function stepScan(state: SimulationState): SimulationState {
  return scanCycle(state, state.scanTimeMs)
}

export function getScanConstants() {
  return {
    inspectionDwellMs: INSPECTION_DWELL_MS,
    rejectActuationMs: REJECT_ACTUATION_MS,
    motorOverloadDelayMs: MOTOR_OVERLOAD_DELAY_MS,
    sensorStuckDelayMs: SENSOR_STUCK_DELAY_MS,
    infeedTimeoutMs: INFEED_TIMEOUT_MS,
    recoveryTimeMs: RECOVERY_TIME_MS,
    idealCycleTimeMs: IDEAL_CYCLE_TIME_MS,
  }
}
