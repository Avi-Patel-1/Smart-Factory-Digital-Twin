export type MachineState =
  | 'stopped'
  | 'idle'
  | 'starting'
  | 'infeed'
  | 'index conveyor'
  | 'inspect'
  | 'accept'
  | 'reject'
  | 'discharge'
  | 'blocked'
  | 'fault'
  | 'recovery'

export type MachineMode = 'auto' | 'manual'

export type TagValue = boolean | number | string

export type TagDataType = 'BOOL' | 'DINT' | 'REAL' | 'STRING'

export type TagQuality = 'Good' | 'Forced' | 'Bad' | 'Simulated'

export interface TagRecord {
  name: string
  type: TagDataType
  value: TagValue
  source: string
  description: string
  lastChangedMs: number
  quality: TagQuality
}

export type AlarmSeverity = 'info' | 'warning' | 'critical'

export interface AlarmDefinition {
  id: string
  tag: string
  message: string
  severity: AlarmSeverity
  rootCauseHint: string
  recoverySteps: string
  effect: string
  component: string
}

export interface AlarmRecord extends AlarmDefinition {
  active: boolean
  acknowledged: boolean
  cleared: boolean
  raisedAtMs: number
  acknowledgedAtMs?: number
  clearedAtMs?: number
  occurrenceCount: number
}

export type ScenarioEventType =
  | 'infeedJam'
  | 'motorOverload'
  | 'stuckPhotoeye'
  | 'rejectGateFailure'
  | 'compressedAirLoss'
  | 'maintenanceStop'
  | 'slowActuator'

export interface ScenarioEvent {
  type: ScenarioEventType
  atMs: number
  durationMs: number
  label: string
}

export interface ScenarioPreset {
  id: string
  name: string
  description: string
  seed: number
  rejectRate: number
  qualityDriftPerMinute: number
  packageSpacing: number
  conveyorUnitsPerSecond: number
  events: ScenarioEvent[]
  recommendation: string
  inspectionMode?: 'simulated' | 'external'
}

export interface InspectionResult {
  schemaVersion: 1
  eventId: string
  frameId: string
  packageId: number
  capturedAtMs: number
  decision: 'accept' | 'reject'
  score: number
}

export interface PackageItem {
  id: number
  position: number
  qualityScore: number
  reject: boolean
  inspected: boolean
  diverted: boolean
  counted: boolean
  createdAtMs: number
}

export interface TimerBank {
  stateElapsedMs: number
  infeedTimeoutMs: number
  inspectionDwellMs: number
  rejectActuationMs: number
  motorOverloadDelayMs: number
  sensorStuckMs: number
  recoveryTimerMs: number
  historianElapsedMs: number
}

export interface CounterBank {
  goodParts: number
  rejects: number
  totalParts: number
  faultsByType: Record<string, number>
  downtimeMs: number
  jamCount: number
  motorRuntimeMs: number
  recoveryEvents: number
  plannedRuntimeMs: number
  plannedStopMs: number
}

export interface OeeMetrics {
  availability: number
  performance: number
  quality: number
  oee: number
  plannedRuntimeMs: number
  unplannedDowntimeMs: number
  idealCycleTimeMs: number
  actualCycleTimeMs: number
  throughputPerMinute: number
  rejectRate: number
  mtbfMs: number
  mttrMs: number
  motorLoadPct: number
  motorCurrentA: number
}

export interface HistorianPoint {
  timeMs: number
  cycleTimeMs: number
  throughputPerMinute: number
  oee: number
  rejectRate: number
  downtimeSeconds: number
  motorLoadPct: number
  motorCurrentA: number
  goodParts: number
  rejects: number
  machineState: MachineState
}

export interface SensorEventRecord {
  timeMs: number
  tag: string
  value: boolean
}

export interface ManualState {
  jogConveyor: boolean
  rejectGateForced: boolean
  forcedSensors: Record<string, boolean | undefined>
}

export interface ScanPhase {
  name: string
  status: string
}

export interface CellEvent {
  id: number
  timeMs: number
  category: 'command' | 'transition' | 'alarm' | 'production'
  message: string
}

export interface SimulationState {
  elapsedMs: number
  scanTimeMs: number
  runRequested: boolean
  emergencyStop: boolean
  resetRequired: boolean
  productionScheduled: boolean
  mode: MachineMode
  machineState: MachineState
  previousMachineState: MachineState
  activeStation: string
  operatorInstruction: string
  scenario: ScenarioPreset
  tags: Record<string, TagRecord>
  alarms: AlarmRecord[]
  packages: PackageItem[]
  timers: TimerBank
  counters: CounterBank
  metrics: OeeMetrics
  historian: HistorianPoint[]
  sensorEvents: SensorEventRecord[]
  manual: ManualState
  scanPhases: ScanPhase[]
  nextPackageId: number
  events: CellEvent[]
  nextEventId: number
  stateDurationsMs: Partial<Record<MachineState, number>>
  inspectionResults: InspectionResult[]
}

export type OperatorAction =
  | { type: 'start' }
  | { type: 'stop' }
  | { type: 'emergencyStop' }
  | { type: 'releaseEmergencyStop' }
  | { type: 'reset' }
  | { type: 'setMode'; mode: MachineMode }
  | { type: 'setScenario'; scenarioId: string }
  | { type: 'acknowledgeAlarm'; alarmId: string }
  | { type: 'clearAlarmHistory' }
  | { type: 'setJog'; enabled: boolean }
  | { type: 'setRejectGate'; enabled: boolean }
  | { type: 'forceSensor'; tag: string; value: boolean | undefined }
  | { type: 'injectFault'; fault: ScenarioEventType; durationMs: number }
  | { type: 'clearFault'; fault: ScenarioEventType }
  | { type: 'inspectionResult'; result: InspectionResult }
