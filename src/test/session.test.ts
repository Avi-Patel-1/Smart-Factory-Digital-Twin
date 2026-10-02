import { describe, expect, it } from 'vitest'
import { compareRecipes } from '../simulation/comparison'
import { exportRecipe, importRecipe } from '../simulation/recipes'
import { scenarioPresets } from '../simulation/scenarios'
import { advanceRun, bookmarkRun, branchRun, createRun, dispatchRun, exportRun, importRun, loadRun, replayRun, saveRun } from '../simulation/session'

describe('portable deterministic runs', () => {
  it('replays mixed commands, faults, reset and bookmarks exactly after JSON round trip', () => {
    let run = dispatchRun(createRun(scenarioPresets[0]), { type: 'start' })
    run = advanceRun(run, 60)
    const beforeFault = run.state
    run = dispatchRun(run, { type: 'injectFault', fault: 'infeedJam', durationMs: 4000 })
    run = advanceRun(run, 25)
    run = dispatchRun(run, { type: 'reset' })
    run = advanceRun(run, 20)
    run = dispatchRun(run, { type: 'start' })
    run = bookmarkRun(advanceRun(run, 100), 'Recovered production')
    const imported = importRun(exportRun(run))
    expect(imported).toEqual(run)
    // Actions at tick 60 are visible when selecting tick 60; tick 59 is pre-fault.
    expect(replayRun(run.bundle, 59).elapsedMs).toBe(beforeFault.elapsedMs - 250)
    const branch = branchRun(run.bundle, 59)
    expect(advanceRun(branch, 1).state).toEqual(beforeFault)
    expect(imported.bundle.bookmarks[0].label).toBe('Recovered production')
  })

  it('gives the same state for bulk stepping and one step at a time', () => {
    const initial = dispatchRun(createRun(scenarioPresets[7]), { type: 'start' })
    let incremental = initial
    for (let tick = 0; tick < 720; tick++) incremental = advanceRun(incremental)
    expect(advanceRun(initial, 720)).toEqual(incremental)
  })

  it('imports validated recipes without trusting generated counters or results', () => {
    const input = JSON.parse(exportRecipe(scenarioPresets[0]))
    input.scenario.counters = { goodParts: 1000000 }
    const recipe = importRecipe(JSON.stringify(input))
    expect(recipe).toEqual(scenarioPresets[0])
    expect(createRun(recipe).state.counters.goodParts).toBe(0)
  })

  it.each(['unknownVersion', 'unknownCommand', 'futureCommand', 'negativeTime', 'invalidSpeed', 'unordered', 'hugeDuration', 'badSensor', 'fractionalTick'])('rejects %s before replacing a saved run', (kind) => {
    const valid = dispatchRun(advanceRun(createRun(scenarioPresets[0]), 20), { type: 'start' })
    const data = JSON.parse(exportRun(valid))
    if (kind === 'unknownVersion') data.schemaVersion = 999
    if (kind === 'unknownCommand') data.commands[0].action.type = 'executeScript'
    if (kind === 'futureCommand') data.commands[0].tick = 21
    if (kind === 'negativeTime') data.durationTicks = -1
    if (kind === 'invalidSpeed') data.recipe.conveyorUnitsPerSecond = 100000
    if (kind === 'unordered') data.commands.push({ tick: 0, action: { type: 'stop' } })
    if (kind === 'hugeDuration') data.durationTicks = 1000000000
    if (kind === 'badSensor') data.commands[0].action = { type: 'forceSensor', tag: '__proto__', value: true }
    if (kind === 'fractionalTick') data.commands[0].tick = 0.5
    expect(() => importRun(JSON.stringify(data))).toThrow()
    expect(importRun(exportRun(valid))).toEqual(valid)
  })

  it('preserves the old saved value when storage reports quota failure', () => {
    const run = advanceRun(createRun(scenarioPresets[0]), 10)
    let stored = exportRun(run)
    const storage = { getItem: () => stored, setItem: (_key: string, value: string) => { stored = value } }
    saveRun(run, storage)
    expect(loadRun(storage)).toEqual(run)
    const failing = { ...storage, setItem: () => { throw new Error('Quota exceeded') } }
    expect(() => saveRun(advanceRun(run), failing)).toThrow('Quota exceeded')
    expect(loadRun(storage)).toEqual(run)
  })

  it('limits run length and rejects oversized files', () => {
    const run = advanceRun(createRun(scenarioPresets[0]), 2400)
    expect(advanceRun(run).state.elapsedMs).toBe(600000)
    expect(() => importRun(' '.repeat(2000001))).toThrow('2 MB')
  })
})

describe('matched recipe comparisons', () => {
  it('reproduces both recorded experiment runs and shows the quality tradeoff', () => {
    const low = { ...scenarioPresets[0], rejectRate: 0, qualityDriftPerMinute: 0 }
    const high = { ...low, rejectRate: 1 }
    const result = compareRecipes(low, high, 400)
    expect(result.baseline.state.counters.goodParts).toBeGreaterThan(0)
    expect(result.candidate.state.counters.rejects).toBeGreaterThan(0)
    expect(result.candidate.state.counters.goodParts).toBe(0)
    expect(replayRun(result.baseline.bundle)).toEqual(result.baseline.state)
    expect(replayRun(result.candidate.bundle)).toEqual(result.candidate.state)
    expect(result.summary).toContain('good parts versus baseline')
  })
})
