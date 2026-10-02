import { applyOperatorAction, createInitialSimulationState, scanCycle } from '../plc/scanCycle'
import type { OperatorAction, ScenarioPreset, SimulationState } from '../types'
import { faultType, integerIn, MAX_RUN_MS, object, text, validateScenario } from './recipes'
import { validateInspectionResult } from './inspection'

export const SCAN_MS = 250
export const MAX_TICKS = MAX_RUN_MS / SCAN_MS
export const MAX_COMMANDS = 4000
export interface TimedCommand {
  tick: number
  action: OperatorAction
}
export interface RunBundle {
  schemaVersion: 1
  engineVersion: 2
  recipe: ScenarioPreset
  durationTicks: number
  commands: TimedCommand[]
  bookmarks: Array<{ tick: number; label: string }>
}
export interface Run {
  state: SimulationState
  bundle: RunBundle
}

export function createRun(recipe: ScenarioPreset): Run {
  const scenario = validateScenario(recipe)
  return {
    state: { ...createInitialSimulationState(), scenario },
    bundle: {
      schemaVersion: 1,
      engineVersion: 2,
      recipe: scenario,
      durationTicks: 0,
      commands: [],
      bookmarks: [],
    },
  }
}

export function dispatchRun(run: Run, action: OperatorAction): Run {
  if (action.type === 'setScenario')
    throw new Error('Create a new run to change its initial recipe')
  const validated = validateAction(action)
  if (run.bundle.commands.length >= MAX_COMMANDS)
    throw new Error('Command limit reached; export this run and begin another')
  return {
    state: applyOperatorAction(run.state, validated),
    bundle: {
      ...run.bundle,
      commands: [...run.bundle.commands, { tick: run.bundle.durationTicks, action: validated }],
    },
  }
}

export function advanceRun(run: Run, ticks = 1): Run {
  integerIn(ticks, 0, MAX_TICKS, 'Advance count')
  const count = Math.min(ticks, MAX_TICKS - run.bundle.durationTicks)
  let state = run.state
  for (let tick = 0; tick < count; tick++) state = scanCycle(state, SCAN_MS)
  return { state, bundle: { ...run.bundle, durationTicks: run.bundle.durationTicks + count } }
}

export function replayRun(bundle: RunBundle, targetTick = bundle.durationTicks): SimulationState {
  integerIn(targetTick, 0, bundle.durationTicks, 'Replay tick')
  let state = createRun(bundle.recipe).state
  let cursor = 0
  for (let tick = 0; tick <= targetTick; tick++) {
    while (cursor < bundle.commands.length && bundle.commands[cursor].tick === tick) {
      state = applyOperatorAction(state, bundle.commands[cursor++].action)
    }
    if (tick < targetTick) state = scanCycle(state, SCAN_MS)
  }
  return state
}

export function bookmarkRun(run: Run, label: string): Run {
  if (run.bundle.bookmarks.length >= 50) throw new Error('At most 50 bookmarks are supported')
  return {
    ...run,
    bundle: {
      ...run.bundle,
      bookmarks: [
        ...run.bundle.bookmarks,
        { tick: run.bundle.durationTicks, label: text(label, 100, 'Bookmark') },
      ],
    },
  }
}

export function branchRun(bundle: RunBundle, tick: number): Run {
  const next: RunBundle = {
    ...bundle,
    durationTicks: tick,
    commands: bundle.commands.filter((command) => command.tick <= tick),
    bookmarks: bundle.bookmarks.filter((mark) => mark.tick <= tick),
  }
  return { bundle: next, state: replayRun(bundle, tick) }
}

function boolean(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new Error('Expected a boolean command value')
  return value
}

export function validateAction(value: unknown): OperatorAction {
  const action = object(value, 'Command')
  switch (action.type) {
    case 'start':
    case 'stop':
    case 'emergencyStop':
    case 'releaseEmergencyStop':
    case 'reset':
    case 'clearAlarmHistory':
      return { type: action.type }
    case 'setMode':
      if (action.mode !== 'auto' && action.mode !== 'manual')
        throw new Error('Unknown machine mode')
      return { type: action.type, mode: action.mode }
    case 'setJog':
    case 'setRejectGate':
      return { type: action.type, enabled: boolean(action.enabled) }
    case 'forceSensor':
      if (
        !['PE_INFEED_BLOCKED', 'PE_INSPECTION_PRESENT', 'PE_EXIT_BLOCKED'].includes(
          action.tag as string,
        )
      )
        throw new Error('Unknown forceable sensor')
      return {
        type: action.type,
        tag: action.tag as string,
        value: action.value === undefined ? undefined : boolean(action.value),
      }
    case 'acknowledgeAlarm':
      return { type: action.type, alarmId: text(action.alarmId, 80, 'Alarm ID') }
    case 'injectFault': {
      const durationMs = integerIn(action.durationMs, SCAN_MS, MAX_RUN_MS, 'Fault duration')
      if (durationMs % SCAN_MS) throw new Error('Fault duration must align with the scan clock')
      return { type: action.type, fault: faultType(action.fault), durationMs }
    }
    case 'clearFault':
      return { type: action.type, fault: faultType(action.fault) }
    case 'inspectionResult':
      return { type: action.type, result: validateInspectionResult(action.result) }
    default:
      throw new Error('Unsupported command type')
  }
}

export function importRun(source: string): Run {
  if (source.length > 2000000) throw new Error('Run file exceeds 2 MB')
  const input = object(JSON.parse(source), 'Run file')
  if (input.schemaVersion !== 1 || input.engineVersion !== 2)
    throw new Error('Unsupported run or engine version')
  const durationTicks = integerIn(input.durationTicks, 0, MAX_TICKS, 'Run duration')
  if (!Array.isArray(input.commands) || input.commands.length > MAX_COMMANDS)
    throw new Error('Invalid command list')
  let previous = 0
  const commands = input.commands.map((value): TimedCommand => {
    const command = object(value, 'Timed command')
    const tick = integerIn(command.tick, previous, durationTicks, 'Command tick')
    previous = tick
    return { tick, action: validateAction(command.action) }
  })
  if (!Array.isArray(input.bookmarks) || input.bookmarks.length > 50)
    throw new Error('Invalid bookmark list')
  const bookmarks = input.bookmarks.map((value) => {
    const mark = object(value, 'Bookmark')
    return {
      tick: integerIn(mark.tick, 0, durationTicks, 'Bookmark tick'),
      label: text(mark.label, 100, 'Bookmark label'),
    }
  })
  const bundle: RunBundle = {
    schemaVersion: 1,
    engineVersion: 2,
    recipe: validateScenario(input.recipe),
    durationTicks,
    commands,
    bookmarks,
  }
  return { bundle, state: replayRun(bundle) }
}

export function exportRun(run: Run): string {
  return JSON.stringify(run.bundle, null, 2)
}

export interface StoragePort {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}
export function saveRun(run: Run, storage: StoragePort): void {
  // Serialization and validation finish before the atomic storage replacement.
  const serialized = exportRun(run)
  importRun(serialized)
  storage.setItem('factory-cell-run-v1', serialized)
}
export function loadRun(storage: StoragePort): Run | null {
  const source = storage.getItem('factory-cell-run-v1')
  return source ? importRun(source) : null
}
