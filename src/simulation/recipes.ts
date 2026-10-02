import type { ScenarioEventType, ScenarioPreset } from '../types'

export const faultTypes: ScenarioEventType[] = [
  'infeedJam',
  'motorOverload',
  'stuckPhotoeye',
  'rejectGateFailure',
  'compressedAirLoss',
  'maintenanceStop',
  'slowActuator',
]
export const MAX_RUN_MS = 600000

export function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${label} must be an object`)
  return value as Record<string, unknown>
}
export function numberIn(value: unknown, min: number, max: number, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)
    throw new Error(`${label} must be a finite number from ${min} to ${max}`)
  return value
}
export function integerIn(value: unknown, min: number, max: number, label: string): number {
  const result = numberIn(value, min, max, label)
  if (!Number.isInteger(result)) throw new Error(`${label} must be an integer`)
  return result
}
export function text(value: unknown, max: number, label: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    throw new Error(`${label} must contain 1–${max} characters`)
  return value
}
export function faultType(value: unknown): ScenarioEventType {
  if (!faultTypes.includes(value as ScenarioEventType)) throw new Error('Unsupported fault type')
  return value as ScenarioEventType
}

/** Normalize to declared fields; never trust imported state, counters or generated results. */
export function validateScenario(value: unknown): ScenarioPreset {
  const input = object(value, 'Recipe')
  if (
    input.inspectionMode !== undefined &&
    input.inspectionMode !== 'simulated' &&
    input.inspectionMode !== 'external'
  )
    throw new Error('Unsupported inspection mode')
  if (!Array.isArray(input.events) || input.events.length > 100)
    throw new Error('Recipe requires at most 100 scheduled events')
  return {
    id: text(input.id, 80, 'Recipe ID'),
    name: text(input.name, 100, 'Recipe name'),
    description: text(input.description, 600, 'Description'),
    recommendation: text(input.recommendation, 600, 'Recommendation'),
    ...(input.inspectionMode === undefined
      ? {}
      : { inspectionMode: input.inspectionMode as 'simulated' | 'external' }),
    seed: integerIn(input.seed, 0, 2147483647, 'Seed'),
    rejectRate: numberIn(input.rejectRate, 0, 1, 'Reject probability'),
    qualityDriftPerMinute: numberIn(input.qualityDriftPerMinute, 0, 1, 'Quality drift'),
    packageSpacing: numberIn(input.packageSpacing, 18, 60, 'Package spacing'),
    conveyorUnitsPerSecond: numberIn(input.conveyorUnitsPerSecond, 5, 30, 'Conveyor speed'),
    events: input.events.map((value) => {
      const event = object(value, 'Scheduled event')
      const atMs = integerIn(event.atMs, 0, MAX_RUN_MS, 'Event time')
      const durationMs = integerIn(event.durationMs, 0, MAX_RUN_MS - atMs, 'Event duration')
      if (atMs % 250 || durationMs % 250)
        throw new Error('Events must align with the 250 ms scan clock')
      return {
        type: faultType(event.type),
        atMs,
        durationMs,
        label: text(event.label, 160, 'Event label'),
      }
    }),
  }
}

export function exportRecipe(scenario: ScenarioPreset): string {
  return JSON.stringify({ schemaVersion: 1, scenario: validateScenario(scenario) }, null, 2)
}

export function importRecipe(source: string): ScenarioPreset {
  if (source.length > 100000) throw new Error('Recipe file exceeds 100 KB')
  const input = object(JSON.parse(source), 'Recipe file')
  if (input.schemaVersion !== 1) throw new Error('Unsupported recipe version')
  return validateScenario(input.scenario)
}
