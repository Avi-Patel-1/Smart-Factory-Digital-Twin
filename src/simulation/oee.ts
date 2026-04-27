import type { CounterBank, OeeMetrics } from '../types'

export const IDEAL_CYCLE_TIME_MS = 4200

function clampRatio(value: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }
  return Math.min(1, Math.max(0, value))
}

export function calculateOeeMetrics(
  counters: CounterBank,
  elapsedMs: number,
  motorLoadPct: number,
  motorCurrentA: number,
): OeeMetrics {
  const plannedRuntimeMs = Math.max(elapsedMs, 1)
  const operatingTimeMs = Math.max(plannedRuntimeMs - counters.downtimeMs, 0)
  const availability = clampRatio(operatingTimeMs / plannedRuntimeMs)
  const totalParts = counters.goodParts + counters.rejects
  const performance = totalParts === 0 ? 0 : clampRatio((IDEAL_CYCLE_TIME_MS * totalParts) / Math.max(operatingTimeMs, 1))
  const quality = totalParts === 0 ? 1 : clampRatio(counters.goodParts / totalParts)
  const actualCycleTimeMs = totalParts === 0 ? 0 : operatingTimeMs / totalParts
  const faultCount = Object.values(counters.faultsByType).reduce((sum, count) => sum + count, 0)
  const mtbfMs = faultCount === 0 ? operatingTimeMs : operatingTimeMs / faultCount
  const mttrMs = counters.recoveryEvents === 0 ? 0 : counters.downtimeMs / counters.recoveryEvents

  return {
    availability,
    performance,
    quality,
    oee: clampRatio(availability * performance * quality),
    plannedRuntimeMs,
    unplannedDowntimeMs: counters.downtimeMs,
    idealCycleTimeMs: IDEAL_CYCLE_TIME_MS,
    actualCycleTimeMs,
    throughputPerMinute: totalParts === 0 ? 0 : totalParts / (plannedRuntimeMs / 60000),
    rejectRate: totalParts === 0 ? 0 : counters.rejects / totalParts,
    mtbfMs,
    mttrMs,
    motorLoadPct,
    motorCurrentA,
  }
}
