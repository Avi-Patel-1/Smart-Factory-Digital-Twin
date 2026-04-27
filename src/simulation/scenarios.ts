import type { ScenarioEvent, ScenarioPreset } from '../types'

export const scenarioPresets: ScenarioPreset[] = [
  {
    id: 'normal-production',
    name: 'Normal production',
    description: 'Balanced package flow with low reject rate and no planned disturbance.',
    seed: 1101,
    rejectRate: 0.04,
    qualityDriftPerMinute: 0,
    packageSpacing: 24,
    conveyorUnitsPerSecond: 18,
    events: [],
    recommendation: 'Keep the cell in auto and watch for early quality drift or downtime loss.',
  },
  {
    id: 'high-reject-rate',
    name: 'High reject rate',
    description: 'Inspection rejects a larger portion of cartons while equipment remains available.',
    seed: 2202,
    rejectRate: 0.24,
    qualityDriftPerMinute: 0.01,
    packageSpacing: 24,
    conveyorUnitsPerSecond: 18,
    events: [],
    recommendation: 'Review upstream fill, label, or seal settings before chasing mechanical faults.',
  },
  {
    id: 'frequent-infeed-jams',
    name: 'Frequent infeed jams',
    description: 'Repeatable jams block the infeed and create short downtime events.',
    seed: 3303,
    rejectRate: 0.05,
    qualityDriftPerMinute: 0,
    packageSpacing: 23,
    conveyorUnitsPerSecond: 17,
    events: [
      { type: 'infeedJam', atMs: 18000, durationMs: 8000, label: 'Guide rail pinch at infeed' },
      { type: 'infeedJam', atMs: 52000, durationMs: 9000, label: 'Carton skew at lug transfer' },
      { type: 'infeedJam', atMs: 86000, durationMs: 7000, label: 'Low-friction belt slip' },
    ],
    recommendation: 'Trend jam count against infeed sensor dwell and inspect guide rail spacing.',
  },
  {
    id: 'motor-overload-event',
    name: 'Motor overload event',
    description: 'A scheduled drive overload trips the conveyor after a delay.',
    seed: 4404,
    rejectRate: 0.05,
    qualityDriftPerMinute: 0,
    packageSpacing: 24,
    conveyorUnitsPerSecond: 18,
    events: [{ type: 'motorOverload', atMs: 26000, durationMs: 12000, label: 'Drive current spike' }],
    recommendation: 'Compare motor load trend against package density and conveyor stops.',
  },
  {
    id: 'stuck-photoeye',
    name: 'Stuck photoeye',
    description: 'The inspection sensor remains high long enough to trigger sensor diagnostics.',
    seed: 5505,
    rejectRate: 0.06,
    qualityDriftPerMinute: 0,
    packageSpacing: 24,
    conveyorUnitsPerSecond: 18,
    events: [{ type: 'stuckPhotoeye', atMs: 24000, durationMs: 14000, label: 'Inspection PE blocked' }],
    recommendation: 'Use the sensor timeline to prove the input is stuck before replacing logic.',
  },
  {
    id: 'reject-gate-failure',
    name: 'Reject gate failure',
    description: 'Reject command occurs while the diverter cannot complete its stroke.',
    seed: 6606,
    rejectRate: 0.18,
    qualityDriftPerMinute: 0,
    packageSpacing: 24,
    conveyorUnitsPerSecond: 18,
    events: [{ type: 'rejectGateFailure', atMs: 22000, durationMs: 22000, label: 'Reject cylinder bind' }],
    recommendation: 'Contain suspect product and inspect valve output, cylinder, and air pressure.',
  },
  {
    id: 'maintenance-recovery',
    name: 'Maintenance recovery',
    description: 'A planned recovery sequence follows a brief infeed stop.',
    seed: 7707,
    rejectRate: 0.05,
    qualityDriftPerMinute: 0,
    packageSpacing: 26,
    conveyorUnitsPerSecond: 16,
    events: [
      { type: 'maintenanceStop', atMs: 20000, durationMs: 9000, label: 'Technician clears skewed carton' },
      { type: 'infeedJam', atMs: 21000, durationMs: 6000, label: 'Manual clear verification' },
    ],
    recommendation: 'Confirm recovery time and fault frequency after the intervention.',
  },
  {
    id: 'quality-drift',
    name: 'Quality drift',
    description: 'Reject rate rises over time while the machine keeps running.',
    seed: 8808,
    rejectRate: 0.03,
    qualityDriftPerMinute: 0.08,
    packageSpacing: 24,
    conveyorUnitsPerSecond: 18,
    events: [],
    recommendation: 'Use the reject trend to trigger process checks before OEE quality collapses.',
  },
]

export const defaultScenario = scenarioPresets[0]

export function getScenarioById(scenarioId: string): ScenarioPreset {
  return scenarioPresets.find((scenario) => scenario.id === scenarioId) ?? defaultScenario
}

export function getActiveScenarioEvents(scenario: ScenarioPreset, elapsedMs: number): ScenarioEvent[] {
  return scenario.events.filter((event) => elapsedMs >= event.atMs && elapsedMs < event.atMs + event.durationMs)
}
