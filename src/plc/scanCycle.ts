import type {
  AlarmRecord,
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
import { cloneTagDatabase, createTagDatabase, setMachineStateTag, setTagValue } from '../simulation/tagDatabase'

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
  const value = Math.sin(seed * 12.9898 + index * 78.233) * 43758.5453
  return value - Math.floor(value)
}

function getRejectRate(state: SimulationState, elapsedMs: number): number {
  const drift = (elapsedMs / 60000) * state.scenario.qualityDriftPerMinute
  return Math.min(0.85, state.scenario.rejectRate + drift)
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
  }
}

export function applyOperatorAction(state: SimulationState, action: OperatorAction): SimulationState {
  if (action.type === 'setScenario') {
    return createInitialSimulationState(action.scenarioId)
  }

  if (action.type === 'acknowledgeAlarm') {
    return {
      ...state,
      alarms: acknowledgeAlarm(state.alarms, action.alarmId, state.elapsedMs),
    }
  }

  if (action.type === 'clearAlarmHistory') {
    return {
      ...state,
      alarms: clearInactiveAlarms(state.alarms),
    }
  }

  if (action.type === 'setMode') {
    return {
      ...state,
      mode: action.mode,
      manual: action.mode === 'auto' ? createManualState() : state.manual,
    }
  }

  if (action.type === 'setJog') {
    return {
      ...state,
      manual: {
        ...state.manual,
        jogConveyor: action.enabled,
      },
    }
  }

  if (action.type === 'setRejectGate') {
    return {
      ...state,
      manual: {
        ...state.manual,
        rejectGateForced: action.enabled,
      },
    }
  }

  if (action.type === 'forceSensor') {
    return {
      ...state,
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
    return {
      ...state,
      runRequested: true,
      emergencyStop: false,
      machineState: state.machineState === 'stopped' || state.machineState === 'idle' ? 'starting' : state.machineState,
    }
  }

  if (action.type === 'stop') {
    return {
      ...state,
      runRequested: false,
      machineState: 'stopped',
      manual: createManualState(),
    }
  }

  if (action.type === 'emergencyStop') {
    return {
      ...state,
      runRequested: false,
      emergencyStop: true,
      machineState: 'fault',
    }
  }

  return {
    ...state,
    emergencyStop: false,
    runRequested: false,
    machineState: state.alarms.some((alarm) => alarm.active) ? 'recovery' : 'idle',
    timers: {
      ...state.timers,
      recoveryTimerMs: 0,
      stateElapsedMs: 0,
    },
    counters: {
      ...state.counters,
      recoveryEvents: state.counters.recoveryEvents + 1,
    },
  }
}

export function scanCycle(state: SimulationState, deltaMs = state.scanTimeMs): SimulationState {
  const elapsedMs = state.elapsedMs + deltaMs
  const activeEvents = getActiveScenarioEvents(state.scenario, elapsedMs)
  const activeTypes = new Set(activeEvents.map((event) => event.type))
  const tags = cloneTagDatabase(state.tags)
  const timers = { ...state.timers }
  const counters = cloneCounters(state.counters)
  const scanPhases: ScanPhase[] = []
  let packages = state.packages.map((item) => ({ ...item }))
  let machineState = state.machineState

  timers.stateElapsedMs += deltaMs
  timers.historianElapsedMs += deltaMs
  scanPhases.push({ name: 'read inputs', status: `${activeEvents.length} scheduled event(s)` })

  const motorOverloadPending = isActive('motorOverload', activeTypes)
  const rejectGateFailure = isActive('rejectGateFailure', activeTypes)
  const airLow = isActive('compressedAirLoss', activeTypes)
  const infeedJam = isActive('infeedJam', activeTypes)
  const stuckPhotoeye = isActive('stuckPhotoeye', activeTypes)
  const maintenanceStop = isActive('maintenanceStop', activeTypes)

  timers.motorOverloadDelayMs = motorOverloadPending ? timers.motorOverloadDelayMs + deltaMs : 0
  const baseInfeed = packages.some((item) => item.position >= 4 && item.position <= 15)
  const baseInspection = packages.some((item) => item.position >= 44 && item.position <= 56 && !item.counted)
  const baseExit = packages.some((item) => item.position >= 90 && item.position <= 99)

  const forcedInfeed = state.manual.forcedSensors.PE_INFEED_BLOCKED
  const forcedInspection = state.manual.forcedSensors.PE_INSPECTION_PRESENT
  const forcedExit = state.manual.forcedSensors.PE_EXIT_BLOCKED
  const infeedBlocked = forcedInfeed ?? (baseInfeed || infeedJam)
  const inspectionPresent = forcedInspection ?? (baseInspection || stuckPhotoeye)
  const exitBlocked = forcedExit ?? baseExit

  timers.sensorStuckMs = inspectionPresent ? timers.sensorStuckMs + deltaMs : 0
  timers.infeedTimeoutMs = state.runRequested && !infeedBlocked && packages.length === 0 ? timers.infeedTimeoutMs + deltaMs : 0

  const activeAlarmIds = new Set<string>()
  if (state.emergencyStop) activeAlarmIds.add('ALM_ESTOP_ACTIVE')
  if (infeedJam || timers.infeedTimeoutMs >= INFEED_TIMEOUT_MS) activeAlarmIds.add('ALM_JAM_INFEED')
  if (timers.motorOverloadDelayMs >= MOTOR_OVERLOAD_DELAY_MS) activeAlarmIds.add('ALM_MOTOR_OVERLOAD')
  if (timers.sensorStuckMs >= SENSOR_STUCK_DELAY_MS) activeAlarmIds.add('ALM_SENSOR_STUCK')
  if (airLow) activeAlarmIds.add('ALM_AIR_PRESSURE_LOW')

  const inspectionPackage = packages.find((item) => item.position >= 44 && item.position <= 56 && !item.inspected)
  const rejectPackage = packages.find((item) => item.inspected && item.reject && item.position >= 65 && item.position <= 76 && !item.diverted)
  const criticalAlarmPending = activeAlarmIds.has('ALM_MOTOR_OVERLOAD') || activeAlarmIds.has('ALM_AIR_PRESSURE_LOW') || activeAlarmIds.has('ALM_ESTOP_ACTIVE')
  const blockedAlarmPending = activeAlarmIds.has('ALM_JAM_INFEED') || activeAlarmIds.has('ALM_SENSOR_STUCK') || maintenanceStop

  if (rejectPackage && rejectGateFailure) {
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

  if (criticalAlarmPending || activeAlarmIds.has('ALM_REJECT_GATE_FAIL')) {
    machineState = setStateWithTimer(machineState, 'fault', timers)
  } else if (blockedAlarmPending) {
    machineState = setStateWithTimer(machineState, 'blocked', timers)
  } else if (machineState === 'recovery') {
    timers.recoveryTimerMs += deltaMs
    if (timers.recoveryTimerMs >= RECOVERY_TIME_MS) {
      machineState = setStateWithTimer(machineState, state.runRequested ? 'starting' : 'idle', timers)
      timers.recoveryTimerMs = 0
    }
  } else if (!state.runRequested && state.mode === 'auto') {
    machineState = setStateWithTimer(machineState, 'stopped', timers)
  } else if (state.runRequested && machineState === 'stopped') {
    machineState = setStateWithTimer(machineState, 'starting', timers)
  } else if (machineState === 'starting' && timers.stateElapsedMs >= 1400) {
    machineState = setStateWithTimer(machineState, 'infeed', timers)
  } else if (state.runRequested || state.mode === 'manual') {
    if (inspectionPackage) {
      machineState = setStateWithTimer(machineState, 'inspect', timers)
    } else if (rejectPackage) {
      machineState = setStateWithTimer(machineState, 'reject', timers)
    } else if (exitBlocked) {
      machineState = setStateWithTimer(machineState, 'discharge', timers)
    } else if (infeedBlocked) {
      machineState = setStateWithTimer(machineState, 'infeed', timers)
    } else {
      machineState = setStateWithTimer(machineState, packages.some((item) => item.inspected && !item.reject) ? 'accept' : 'index conveyor', timers)
    }
  }
  scanPhases.push({ name: 'run state machine', status: machineState })

  const canRunAutoConveyor =
    state.runRequested &&
    state.mode === 'auto' &&
    !['stopped', 'fault', 'blocked', 'recovery', 'starting', 'inspect', 'reject'].includes(machineState)
  const conveyorRun = canRunAutoConveyor || (state.mode === 'manual' && state.manual.jogConveyor)
  const rejectCommand = (machineState === 'reject' && Boolean(rejectPackage)) || state.manual.rejectGateForced
  let createdPackages = 0

  if (state.runRequested && packages.length === 0 && !['blocked', 'fault', 'recovery', 'stopped'].includes(machineState)) {
    packages = [createPackage(state, elapsedMs)]
    createdPackages = 1
  } else if (
    state.runRequested &&
    conveyorRun &&
    packages.length < 5 &&
    Math.min(...packages.map((item) => item.position), 100) > state.scenario.packageSpacing
  ) {
    packages = [...packages, createPackage(state, elapsedMs)]
    createdPackages = 1
  }

  if (machineState === 'inspect' && inspectionPackage) {
    timers.inspectionDwellMs += deltaMs
    if (timers.inspectionDwellMs >= INSPECTION_DWELL_MS) {
      packages = packages.map((item) => (item.id === inspectionPackage.id ? { ...item, inspected: true } : item))
      timers.inspectionDwellMs = 0
    }
  } else {
    timers.inspectionDwellMs = 0
  }

  if (machineState === 'reject' && rejectPackage) {
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

  const motorLoadPct = conveyorRun ? Math.min(98, 38 + packages.length * 9 + (motorOverloadPending ? 44 : 0)) : 0
  const motorCurrentA = conveyorRun ? Number((1.8 + motorLoadPct * 0.045).toFixed(2)) : 0
  if (conveyorRun) {
    counters.motorRuntimeMs += deltaMs
    const move = (state.scenario.conveyorUnitsPerSecond * deltaMs) / 1000
    packages = packages.map((item) => ({ ...item, position: Math.min(110, item.position + move) }))
  }

  packages.forEach((item) => {
    if (item.position >= 100 && !item.reject && !item.counted) {
      item.counted = true
      counters.goodParts += 1
      counters.totalParts += 1
    }
  })
  packages = packages.filter((item) => !item.counted && item.position < 106)

  if (['blocked', 'fault', 'recovery'].includes(machineState) || maintenanceStop) {
    counters.downtimeMs += deltaMs
  }
  scanPhases.push({ name: 'update timers/counters', status: `${counters.totalParts} complete` })

  const metrics = calculateOeeMetrics(counters, elapsedMs, motorLoadPct, motorCurrentA)
  setTagValue(tags, 'PE_INFEED_BLOCKED', infeedBlocked, elapsedMs, forcedInfeed === undefined ? 'Good' : 'Forced')
  setTagValue(tags, 'PE_INSPECTION_PRESENT', inspectionPresent, elapsedMs, forcedInspection === undefined ? 'Good' : 'Forced')
  setTagValue(tags, 'PE_EXIT_BLOCKED', exitBlocked, elapsedMs, forcedExit === undefined ? 'Good' : 'Forced')
  setTagValue(tags, 'PE_REJECT_CHUTE_CLEAR', !rejectCommand, elapsedMs)
  setTagValue(tags, 'AIR_MAIN_OK', !airLow, elapsedMs)
  setTagValue(tags, 'MTR_CONV_RUN', conveyorRun, elapsedMs)
  setTagValue(tags, 'MTR_CONV_FAULT', activeAlarmIds.has('ALM_MOTOR_OVERLOAD'), elapsedMs)
  setTagValue(tags, 'MTR_CONV_SPEED_PCT', conveyorRun ? 78 : 0, elapsedMs)
  setTagValue(tags, 'MTR_CONV_CURRENT_A', metrics.motorCurrentA, elapsedMs)
  setTagValue(tags, 'DRV_CONV_LOAD_PCT', metrics.motorLoadPct, elapsedMs)
  setTagValue(tags, 'CYL_REJECT_EXT', rejectCommand, elapsedMs, state.manual.rejectGateForced ? 'Forced' : 'Good')
  setTagValue(tags, 'MODE_AUTO', state.mode === 'auto', elapsedMs)
  setTagValue(tags, 'CNT_GOOD_PARTS', counters.goodParts, elapsedMs)
  setTagValue(tags, 'CNT_REJECTS', counters.rejects, elapsedMs)
  setTagValue(tags, 'CNT_TOTAL_PARTS', counters.totalParts, elapsedMs)
  setTagValue(tags, 'OEE_AVAILABILITY', metrics.availability, elapsedMs)
  setTagValue(tags, 'OEE_PERFORMANCE', metrics.performance, elapsedMs)
  setTagValue(tags, 'OEE_QUALITY', metrics.quality, elapsedMs)
  setTagValue(tags, 'OEE_OVERALL', metrics.oee, elapsedMs)
  setTagValue(tags, 'CELL_THROUGHPUT_PPM', Number(metrics.throughputPerMinute.toFixed(2)), elapsedMs)
  setTagValue(tags, 'CYCLE_TIME_MS', Number(metrics.actualCycleTimeMs.toFixed(0)), elapsedMs)
  setMachineStateTag(tags, machineState, elapsedMs)
  Object.values(tags)
    .filter((tag) => tag.name.startsWith('ALM_'))
    .forEach((tag) => setTagValue(tags, tag.name, activeAlarmIds.has(tag.name), elapsedMs))
  scanPhases.push({ name: 'update outputs', status: conveyorRun ? 'motor run output true' : 'outputs held safe' })

  const baseNext: SimulationState = {
    ...state,
    elapsedMs,
    previousMachineState: state.machineState,
    machineState,
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

  return logSensorEvents(state, {
    ...baseNext,
    historian,
    timers,
    scanPhases,
  })
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
