import type { ScenarioPreset } from '../types'
import { advanceRun, createRun, dispatchRun, MAX_TICKS, type Run } from './session'
import { integerIn } from './recipes'

export interface RecipeComparison {
  baseline: Run
  candidate: Run
  summary: string
  losses: Array<{ state: string; baselineMs: number; candidateMs: number }>
  interventions: Array<{
    label: string
    explanation: string
    goodDelta: number
    downtimeDeltaMs: number
    run: Run
  }>
}

/** Both recipes receive the same automatic recovery policy, duration and scan cadence. */
export function evaluateRecipe(recipe: ScenarioPreset, ticks: number): Run {
  integerIn(ticks, 1, MAX_TICKS, 'Comparison duration')
  let run = dispatchRun(createRun(recipe), { type: 'start' })
  for (let tick = 0; tick < ticks; tick++) {
    if (run.state.resetRequired) {
      const retry = dispatchRun(run, { type: 'reset' })
      // Record recovery attempts so the returned run replays exactly.
      run = retry
    } else if (!run.state.runRequested && run.state.machineState !== 'recovery') {
      run = dispatchRun(run, { type: 'start' })
    }
    run = advanceRun(run)
  }
  return run
}

export function compareRecipes(
  baseline: ScenarioPreset,
  candidate: ScenarioPreset,
  ticks = 720,
): RecipeComparison {
  const a = evaluateRecipe(baseline, ticks)
  const b = evaluateRecipe(candidate, ticks)
  const states = new Set([
    ...Object.keys(a.state.stateDurationsMs),
    ...Object.keys(b.state.stateDurationsMs),
  ])
  const losses = [...states]
    .map((state) => ({
      state,
      baselineMs: a.state.stateDurationsMs[state as keyof typeof a.state.stateDurationsMs] ?? 0,
      candidateMs: b.state.stateDurationsMs[state as keyof typeof b.state.stateDurationsMs] ?? 0,
    }))
    .sort((a, b) => b.candidateMs - a.candidateMs)
  const wait = losses.filter((entry) =>
    ['inspect', 'reject', 'fault', 'blocked', 'recovery'].includes(entry.state),
  )[0]
  const difference = b.state.counters.goodParts - a.state.counters.goodParts
  const interventions = [
    {
      label: 'Faster transport',
      explanation:
        'Increase conveyor speed by 25%, capped at 30 units/s. Preserve seed, timing and all other inputs.',
      recipe: {
        ...candidate,
        conveyorUnitsPerSecond: Math.min(30, candidate.conveyorUnitsPerSecond * 1.25),
      },
    },
    {
      label: 'Clear disturbances',
      explanation:
        'Remove scheduled disturbances. Preserve seed, nominal speed, quality settings and the recovery policy.',
      recipe: { ...candidate, events: [] },
    },
  ].map(({ label, explanation, recipe }) => {
    const result = evaluateRecipe(recipe, ticks)
    return {
      label,
      explanation,
      goodDelta: result.state.counters.goodParts - b.state.counters.goodParts,
      downtimeDeltaMs: result.state.counters.downtimeMs - b.state.counters.downtimeMs,
      run: result,
    }
  })
  const summary = `${difference >= 0 ? '+' : ''}${difference} good parts versus baseline. ${wait ? `Largest candidate hold: ${wait.state}, ${(wait.candidateMs / 1000).toFixed(1)} s.` : 'No station hold recorded.'} State residence alone does not establish a bottleneck; controlled interventions below measure whether transport or scheduled disturbances constrain this recipe within the model.`
  return { baseline: a, candidate: b, losses, interventions, summary }
}
