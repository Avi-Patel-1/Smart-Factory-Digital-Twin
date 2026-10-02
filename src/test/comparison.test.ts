import { expect, it } from 'vitest'
import { compareRecipes } from '../simulation/comparison'
import { replayRun } from '../simulation/session'
import { defaultScenario } from '../simulation/scenarios'

it('measures a controlled disturbance intervention and exports replayable experiments', () => {
  const candidate = { ...defaultScenario, events: [{ type: 'infeedJam' as const, atMs: 10000, durationMs: 30000, label: 'Blocked infeed' }] }
  const result = compareRecipes(defaultScenario, candidate)
  const clear = result.interventions.find((entry) => entry.label === 'Clear disturbances')!
  expect(clear.goodDelta).toBeGreaterThan(0)
  expect(clear.downtimeDeltaMs).toBeLessThan(-30000)
  expect(clear.run.state.counters).toEqual(result.baseline.state.counters)
  for (const entry of result.interventions) expect(replayRun(entry.run.bundle)).toEqual(entry.run.state)
  expect(candidate.events).toHaveLength(1)
})
