import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { CellScene } from '../components/CellScene'
import { compareRecipes, type RecipeComparison } from '../simulation/comparison'
import { exportRecipe, faultTypes, validateScenario } from '../simulation/recipes'
import { replayRun, type Run } from '../simulation/session'
import { validateInspectionResult } from '../simulation/inspection'
import type { OperatorAction, ScenarioEventType, ScenarioPreset, SimulationState } from '../types'
import { formatPercent } from '../utils/format'
import { downloadText } from '../export/formatters'

interface Props {
  run: Run
  state: SimulationState
  recipes: ScenarioPreset[]
  viewTick: number | null
  onSeek: (tick: number | null) => void
  onBranch: () => void
  onBookmark: () => void
  dispatch: (action: OperatorAction) => void
  onRecipe: (recipe: ScenarioPreset) => void
  onGuide: () => void
  notify: (message: string) => void
}

const faultNames: Record<ScenarioEventType, string> = {
  infeedJam: 'Infeed jam',
  motorOverload: 'Motor overload',
  stuckPhotoeye: 'Stuck photoeye',
  rejectGateFailure: 'Reject gate bind',
  compressedAirLoss: 'Air supply loss',
  maintenanceStop: 'Planned maintenance',
  slowActuator: 'Slow actuator',
}
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`

export function CellStudio({
  run,
  state,
  recipes,
  viewTick,
  onSeek,
  onBranch,
  onBookmark,
  dispatch,
  onRecipe,
  onGuide,
  notify,
}: Props) {
  const [selected, setSelected] = useState('MTR_CONV_RUN')
  const [fault, setFault] = useState<ScenarioEventType>('infeedJam')
  const [baselineId, setBaselineId] = useState('normal-production')
  const [comparison, setComparison] = useState<RecipeComparison | null>(null)
  const [comparisonTick, setComparisonTick] = useState(72)
  const [inspectionJson, setInspectionJson] = useState('')
  const [recipeEditor, setRecipeEditor] = useState(false)
  const tag = state.tags[selected] ?? state.tags.MTR_CONV_RUN
  const replaying = viewTick !== null
  const tick = viewTick ?? run.bundle.durationTicks
  const comparisonStates = useMemo(
    () =>
      comparison
        ? [
            replayRun(comparison.baseline.bundle, comparisonTick),
            replayRun(comparison.candidate.bundle, comparisonTick),
          ]
        : null,
    [comparison, comparisonTick],
  )
  const active = state.alarms.filter((alarm) => alarm.active)
  const pending = state.packages.find(
    (item) => item.position >= 44 && item.position <= 56 && !item.inspected,
  )

  const recipeSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const values = new FormData(event.currentTarget)
    try {
      onRecipe(
        validateScenario({
          ...run.bundle.recipe,
          id: `recipe-${Date.now()}`,
          name: values.get('name'),
          seed: Number(values.get('seed')),
          conveyorUnitsPerSecond: Number(values.get('speed')),
          packageSpacing: Number(values.get('spacing')),
          rejectRate: Number(values.get('reject')) / 100,
          inspectionMode: values.get('inspectionMode'),
        }),
      )
      setRecipeEditor(false)
      setComparison(null)
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Recipe is invalid')
    }
  }

  const compare = () => {
    try {
      const baseline = recipes.find((recipe) => recipe.id === baselineId) ?? recipes[0]
      setComparison(compareRecipes(baseline, run.bundle.recipe))
      notify(
        'Two 180-second experiments computed. Their automatic recovery policy is recorded in each export.',
      )
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Comparison failed')
    }
  }

  return (
    <div className="studio">
      <div className="studio-heading">
        <div>
          <p className="eyebrow">An operational view of the whole line</p>
          <h2>Every signal has a consequence.</h2>
          <p>Run the cell, introduce a fault, and follow the recovery all the way to output.</p>
        </div>
        <button className="guide-button" onClick={onGuide}>
          Run the 60-second walkthrough ↗
        </button>
      </div>
      <div className="studio-metrics">
        {[
          ['GOOD OUTPUT', state.counters.goodParts, 'accepted cartons'],
          ['QUALITY', formatPercent(state.metrics.quality), `${state.counters.rejects} rejected`],
          ['OEE', formatPercent(state.metrics.oee), 'availability × performance × quality'],
          [
            'LOST TIME',
            seconds(state.counters.downtimeMs),
            `${seconds(state.counters.plannedStopMs)} planned stop`,
          ],
        ].map(([label, value, detail]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{detail}</small>
          </div>
        ))}
      </div>
      <div className="studio-workspace">
        <section className="scene-panel">
          <div className="scene-toolbar">
            <span className={`state-pill ${state.resetRequired ? 'faulted' : ''}`}>
              {state.machineState.toUpperCase()}
            </span>
            <span>
              {replaying ? 'RECORDED STATE' : 'LIVE SIMULATION'} · {seconds(state.elapsedMs)}
            </span>
            <span>250 ms / scan</span>
          </div>
          <CellScene state={state} selected={selected} onSelect={setSelected} />
          <div className="cell-commands">
            <button
              className="primary"
              disabled={replaying}
              onClick={() => dispatch({ type: 'start' })}
            >
              Start cell
            </button>
            <button disabled={replaying} onClick={() => dispatch({ type: 'stop' })}>
              Stop
            </button>
            <button
              className="danger"
              disabled={replaying}
              onClick={() => dispatch({ type: 'emergencyStop' })}
            >
              Emergency stop
            </button>
            <button
              disabled={replaying || !state.emergencyStop}
              onClick={() => dispatch({ type: 'releaseEmergencyStop' })}
            >
              Release E-stop
            </button>
            <button
              disabled={replaying || !state.resetRequired}
              onClick={() => dispatch({ type: 'reset' })}
            >
              Reset latch
            </button>
          </div>
          <p className={state.resetRequired ? 'operator-note warning' : 'operator-note'}>
            {state.operatorInstruction}
          </p>
        </section>
        <aside className="signal-inspector">
          <p className="eyebrow">Signal inspector</p>
          <h3>{tag.description}</h3>
          <div className="signal-value">
            {typeof tag.value === 'boolean' ? (tag.value ? 'ON' : 'OFF') : String(tag.value)}
          </div>
          <code>{tag.name}</code>
          <dl>
            <dt>Source</dt>
            <dd>{tag.source}</dd>
            <dt>Quality</dt>
            <dd>{tag.quality}</dd>
            <dt>Last change</dt>
            <dd>{seconds(tag.lastChangedMs)}</dd>
            <dt>Reset latch</dt>
            <dd>{state.resetRequired ? 'Reset required' : 'Ready'}</dd>
          </dl>
          <label>
            Signal
            <select
              aria-label="Inspect signal"
              value={selected}
              onChange={(event) => setSelected(event.target.value)}
            >
              {Object.keys(state.tags).map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </label>
          <div className="inspector-alarms">
            <h4>Active conditions</h4>
            {active.length ? (
              active.map((alarm) => (
                <div key={alarm.id}>
                  <strong>{alarm.message}</strong>
                  <p>{alarm.recoverySteps}</p>
                  <button
                    disabled={replaying || alarm.acknowledged}
                    onClick={() => dispatch({ type: 'acknowledgeAlarm', alarmId: alarm.id })}
                  >
                    {alarm.acknowledged ? 'Acknowledged' : 'Acknowledge'}
                  </button>
                </div>
              ))
            ) : (
              <p>No active alarm condition. A cleared condition can still require a reset.</p>
            )}
          </div>
        </aside>
      </div>

      <section className="replay-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Deterministic run record</p>
            <h3>Move through time. Inspect the cause.</h3>
          </div>
          <div className="button-row">
            <button onClick={onBookmark} disabled={replaying}>
              Add bookmark
            </button>
            {replaying ? (
              <>
                <button onClick={() => onSeek(null)}>Return to live</button>
                <button onClick={onBranch}>Branch from here</button>
              </>
            ) : null}
          </div>
        </div>
        <label className="replay-slider">
          Replay time · {seconds(tick * 250)} / {seconds(run.bundle.durationTicks * 250)}
          <input
            type="range"
            aria-label="Replay time"
            min="0"
            max={Math.max(1, run.bundle.durationTicks)}
            step="1"
            value={tick}
            disabled={!run.bundle.durationTicks}
            onChange={(event) => onSeek(Number(event.target.value))}
          />
        </label>
        <div className="bookmark-row">
          {run.bundle.bookmarks.map((mark, index) => (
            <button key={index} onClick={() => onSeek(mark.tick)}>
              {mark.label} · {seconds(mark.tick * 250)}
            </button>
          ))}
        </div>
        <section className="event-list" aria-label="Cell event timeline">
          {state.events.length ? (
            state.events
              .slice(-12)
              .reverse()
              .map((event) => (
                <button
                  key={event.id}
                  onClick={() =>
                    onSeek(Math.min(run.bundle.durationTicks, Math.floor(event.timeMs / 250)))
                  }
                >
                  <time>{seconds(event.timeMs)}</time>
                  <span className={`event-kind ${event.category}`}>{event.category}</span>
                  <span>{event.message}</span>
                </button>
              ))
          ) : (
            <p>
              Start a run to record commands, transitions, alarm conditions and completed parts.
            </p>
          )}
        </section>
      </section>

      <div className="studio-bottom-grid">
        <section className="studio-card">
          <p className="eyebrow">Controlled disturbances</p>
          <h3>Find the limit. Recover deliberately.</h3>
          <p>
            Faults change the actual simulation. Clearing a physical condition does not bypass the
            reset latch.
          </p>
          <label>
            Disturbance
            <select
              value={fault}
              onChange={(event) => setFault(event.target.value as ScenarioEventType)}
            >
              {faultTypes.map((type) => (
                <option key={type} value={type}>
                  {faultNames[type]}
                </option>
              ))}
            </select>
          </label>
          <div className="button-row">
            <button
              disabled={replaying}
              onClick={() => dispatch({ type: 'injectFault', fault, durationMs: 10000 })}
            >
              Inject for 10 seconds
            </button>
            <button disabled={replaying} onClick={() => dispatch({ type: 'clearFault', fault })}>
              Clear physical condition
            </button>
          </div>
          <small>
            Mechanical/electrical behavior is simulated. No physical equipment is connected.
          </small>
        </section>
        <section className="studio-card">
          <p className="eyebrow">Versioned recipes</p>
          <h3>{run.bundle.recipe.name}</h3>
          <p>
            Seed {run.bundle.recipe.seed} · {run.bundle.recipe.conveyorUnitsPerSecond} units/s ·{' '}
            {(run.bundle.recipe.rejectRate * 100).toFixed(1)}% initial reject probability
          </p>
          <div className="button-row">
            <button onClick={() => setRecipeEditor(!recipeEditor)}>
              {recipeEditor ? 'Close editor' : 'Edit a new recipe'}
            </button>
            <button
              onClick={() =>
                downloadText(
                  'factory-recipe.json',
                  exportRecipe(run.bundle.recipe),
                  'application/json',
                )
              }
            >
              Export recipe
            </button>
          </div>
          {recipeEditor ? (
            <form key={run.bundle.recipe.id} className="recipe-form" onSubmit={recipeSubmit}>
              <label>
                Name
                <input
                  name="name"
                  required
                  maxLength={100}
                  defaultValue={`${run.bundle.recipe.name} variant`}
                />
              </label>
              <label>
                Seed
                <input
                  name="seed"
                  type="number"
                  min={0}
                  max={2147483647}
                  step={1}
                  required
                  defaultValue={run.bundle.recipe.seed}
                />
              </label>
              <label>
                Conveyor units / s
                <input
                  name="speed"
                  type="number"
                  min={5}
                  max={30}
                  step={0.5}
                  required
                  defaultValue={run.bundle.recipe.conveyorUnitsPerSecond}
                />
              </label>
              <label>
                Package spacing
                <input
                  name="spacing"
                  type="number"
                  min={18}
                  max={60}
                  step={1}
                  required
                  defaultValue={run.bundle.recipe.packageSpacing}
                />
              </label>
              <label>
                Initial reject %
                <input
                  name="reject"
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  required
                  defaultValue={run.bundle.recipe.rejectRate * 100}
                />
              </label>
              <label>
                Inspection mode
                <select
                  name="inspectionMode"
                  defaultValue={run.bundle.recipe.inspectionMode ?? 'simulated'}
                >
                  <option value="simulated">Seeded model</option>
                  <option value="external">External result required</option>
                </select>
              </label>
              <button className="primary" type="submit">
                Save recipe & start new run
              </button>
            </form>
          ) : null}
        </section>
        <section className="studio-card">
          <p className="eyebrow">Matched experiments</p>
          <h3>What changes the output?</h3>
          <p>
            Compare the current recipe with a baseline over 180 logical seconds, using identical
            recovery rules.
          </p>
          <label>
            Baseline recipe
            <select value={baselineId} onChange={(event) => setBaselineId(event.target.value)}>
              {recipes.map((recipe) => (
                <option key={recipe.id} value={recipe.id}>
                  {recipe.name}
                </option>
              ))}
            </select>
          </label>
          <button className="primary" onClick={compare}>
            Compute comparison
          </button>
        </section>
      </div>

      {comparison ? (
        <section className="comparison-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Computed comparison</p>
              <h3>
                {comparison.baseline.bundle.recipe.name} → {comparison.candidate.bundle.recipe.name}
              </h3>
            </div>
            <button
              onClick={() =>
                downloadText(
                  'recipe-comparison.json',
                  JSON.stringify(
                    {
                      baseline: comparison.baseline.bundle,
                      candidate: comparison.candidate.bundle,
                      summary: comparison.summary,
                      losses: comparison.losses,
                      interventions: comparison.interventions.map(({ run, ...entry }) => ({
                        ...entry,
                        bundle: run.bundle,
                      })),
                    },
                    null,
                    2,
                  ),
                  'application/json',
                )
              }
            >
              Export both runs
            </button>
          </div>
          <p>{comparison.summary}</p>
          <div className="comparison-columns">
            {[comparison.baseline, comparison.candidate].map((result, index) => (
              <div key={index}>
                <small>{index ? 'CANDIDATE' : 'BASELINE'}</small>
                <strong>
                  {result.state.counters.goodParts} good / {result.state.counters.rejects} rejected
                </strong>
                <span>
                  {result.state.metrics.throughputPerMinute.toFixed(1)} parts/min ·{' '}
                  {formatPercent(result.state.metrics.rejectRate)} rejected ·{' '}
                  {formatPercent(result.state.metrics.oee)} OEE ·{' '}
                  {seconds(result.state.counters.downtimeMs)} downtime
                </span>
              </div>
            ))}
          </div>
          <div className="residence-chart">
            {comparison.losses.map((entry) => (
              <div key={entry.state}>
                <span>{entry.state}</span>
                <div>
                  <i style={{ width: `${entry.baselineMs / 1800}%` }} />
                  <b style={{ width: `${entry.candidateMs / 1800}%` }} />
                </div>
                <small>
                  {seconds(entry.baselineMs)} / {seconds(entry.candidateMs)}
                </small>
              </div>
            ))}
          </div>
          <div className="comparison-columns">
            {comparison.interventions.map((entry) => (
              <div key={entry.label}>
                <small>{entry.label}</small>
                <strong>
                  {entry.goodDelta >= 0 ? '+' : ''}
                  {entry.goodDelta} good parts
                </strong>
                <span>
                  {(entry.downtimeDeltaMs / 1000).toFixed(1)} s downtime change from candidate
                </span>
                <p>{entry.explanation}</p>
              </div>
            ))}
          </div>
          <p>
            These are controlled simulation experiments, not measured improvements on real
            machinery. Multiple constraints can interact; a zero change at this duration does not
            prove unlimited capacity.
          </p>
          <p>Lavender shows baseline time; green shows candidate time.</p>
          {comparisonStates ? (
            <div className="comparison-replay">
              <label className="replay-slider">
                Compare trajectories · {seconds(comparisonTick * 250)}
                <input
                  aria-label="Comparison replay time"
                  type="range"
                  min={0}
                  max={comparison.candidate.bundle.durationTicks}
                  value={comparisonTick}
                  onChange={(event) => setComparisonTick(Number(event.target.value))}
                />
              </label>
              <div className="scene-panel">
                <CellScene
                  state={comparisonStates[1]}
                  ghost={comparisonStates[0]}
                  selected={selected}
                  onSelect={setSelected}
                />
              </div>
              <p>
                Solid cartons: candidate. Lavender ghosts: baseline. Both experiments use their
                recorded recovery commands. Selected signal {selected}: baseline{' '}
                {String(comparisonStates[0].tags[selected]?.value)}, candidate{' '}
                {String(comparisonStates[1].tags[selected]?.value)}.
              </p>
            </div>
          ) : null}
        </section>
      ) : null}

      {state.scenario.inspectionMode === 'external' ? (
        <section className="studio-card">
          <p className="eyebrow">Inspection event input / schema v1</p>
          <h3>
            {pending ? `Package ${pending.id} is waiting` : 'Waiting for a package at inspection'}
          </h3>
          <p>
            Provide a JSON event in the run's logical timebase. This demo input is local; missing
            results hold the cell.
          </p>
          <div className="button-row">
            <button
              disabled={!pending || replaying}
              onClick={() => {
                onSeek(null)
                setInspectionJson(
                  JSON.stringify(
                    {
                      schemaVersion: 1,
                      eventId: `local-${state.elapsedMs}`,
                      frameId: `frame-${pending?.id}`,
                      packageId: pending?.id,
                      capturedAtMs: state.elapsedMs,
                      decision: 'reject',
                      score: 0.94,
                    },
                    null,
                    2,
                  ),
                )
                notify(
                  'Clock paused so you can inspect and submit this synthetic event without its timestamp aging.',
                )
              }}
            >
              Prepare synthetic fixture
            </button>
            <button
              disabled={replaying}
              onClick={() => {
                try {
                  dispatch({
                    type: 'inspectionResult',
                    result: validateInspectionResult(JSON.parse(inspectionJson)),
                  })
                } catch (error) {
                  notify(error instanceof Error ? error.message : 'Invalid event')
                }
              }}
            >
              Submit inspection event
            </button>
          </div>
          <label>
            Inspection event JSON
            <textarea
              aria-label="Inspection event JSON"
              rows={9}
              value={inspectionJson}
              onChange={(event) => setInspectionJson(event.target.value)}
            />
          </label>
        </section>
      ) : null}
    </div>
  )
}
