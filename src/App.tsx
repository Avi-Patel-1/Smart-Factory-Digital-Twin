import { useEffect, useMemo, useState } from 'react'
import { HmiOverview } from './screens/HmiOverview'
import { DigitalTwinView } from './screens/DigitalTwinView'
import { AlarmsScreen } from './screens/AlarmsScreen'
import { TrendsScreen } from './screens/TrendsScreen'
import { MaintenanceScreen } from './screens/MaintenanceScreen'
import { TagBrowser } from './screens/TagBrowser'
import { ManualControls } from './screens/ManualControls'
import { ProductionReport } from './screens/ProductionReport'
import { ArchitecturePage } from './screens/ArchitecturePage'
import { FlowDiagram } from './screens/FlowDiagram'
import { MethodologyPage } from './screens/MethodologyPage'
import {
  advanceRun,
  bookmarkRun,
  branchRun,
  createRun,
  dispatchRun,
  exportRun,
  importRun,
  loadRun,
  MAX_TICKS,
  replayRun,
  saveRun,
} from './simulation/session'
import { importRecipe, validateScenario } from './simulation/recipes'
import { downloadText } from './export/formatters'
import { CellStudio } from './screens/CellStudio'
import { scenarioPresets } from './simulation/scenarios'
import type { OperatorAction, ScenarioPreset, SimulationState } from './types'
import { formatDuration, formatPercent } from './utils/format'
import './index.css'
import './studio.css'

type ScreenId =
  | 'studio'
  | 'hmi'
  | 'twin'
  | 'alarms'
  | 'trends'
  | 'maintenance'
  | 'tags'
  | 'manual'
  | 'report'
  | 'architecture'
  | 'flow'
  | 'methodology'

const screens: Array<{ id: ScreenId; label: string }> = [
  { id: 'studio', label: 'Cell Studio' },
  { id: 'hmi', label: 'HMI Overview' },
  { id: 'twin', label: 'Digital Twin' },
  { id: 'alarms', label: 'Alarms' },
  { id: 'trends', label: 'Trends' },
  { id: 'maintenance', label: 'Maintenance' },
  { id: 'tags', label: 'Tag Browser' },
  { id: 'manual', label: 'Manual Controls' },
  { id: 'report', label: 'Production Report' },
  { id: 'architecture', label: 'Architecture' },
  { id: 'flow', label: 'Flow' },
  { id: 'methodology', label: 'Methodology' },
]

function renderScreen(
  screen: ScreenId,
  state: SimulationState,
  dispatch: (action: OperatorAction) => void,
  paused: boolean,
  setPaused: (paused: boolean) => void,
  speed: number,
  setSpeed: (speed: number) => void,
  step: () => void,
) {
  if (screen === 'twin') return <DigitalTwinView state={state} />
  if (screen === 'alarms') return <AlarmsScreen state={state} dispatch={dispatch} />
  if (screen === 'trends') return <TrendsScreen state={state} />
  if (screen === 'maintenance') return <MaintenanceScreen state={state} />
  if (screen === 'tags') return <TagBrowser state={state} />
  if (screen === 'manual') {
    return (
      <ManualControls
        state={state}
        dispatch={dispatch}
        paused={paused}
        setPaused={setPaused}
        speed={speed}
        setSpeed={setSpeed}
        step={step}
      />
    )
  }
  if (screen === 'report') return <ProductionReport state={state} />
  if (screen === 'architecture') return <ArchitecturePage />
  if (screen === 'flow') return <FlowDiagram />
  if (screen === 'methodology') return <MethodologyPage />
  return <HmiOverview state={state} dispatch={dispatch} />
}

function restoreWorkspace() {
  let run = createRun(scenarioPresets[0])
  let custom: ScenarioPreset[] = []
  let notice = ''
  if (typeof window !== 'undefined') {
    try {
      run = loadRun(window.localStorage) ?? run
    } catch {
      notice =
        'Saved run could not be opened. Your stored file was left unchanged; import a valid run or begin a new one.'
    }
    try {
      const stored: unknown = JSON.parse(window.localStorage.getItem('factory-recipes-v1') ?? '[]')
      if (!Array.isArray(stored) || stored.length > 30) throw new Error('Invalid recipe library')
      custom = stored.map(validateScenario)
    } catch {
      notice =
        `${notice} Saved recipe library could not be opened; stored data was left unchanged.`.trim()
    }
  }
  return { run, custom, notice }
}

function App() {
  const [initial] = useState(restoreWorkspace)
  const [run, setRun] = useState(initial.run)
  const [custom, setCustom] = useState(initial.custom)
  const [notice, setNotice] = useState(initial.notice)
  const [activeScreen, setActiveScreen] = useState<ScreenId>('studio')
  const [paused, setPaused] = useState(true)
  const [speed, setSpeed] = useState(1)
  const [viewTick, setViewTick] = useState<number | null>(null)
  const [walkthroughOpen, setWalkthroughOpen] = useState(false)
  const atLimit = run.bundle.durationTicks >= MAX_TICKS
  const recipes = [...scenarioPresets, ...custom]
    .filter((recipe) => recipe.id !== run.bundle.recipe.id)
    .concat(run.bundle.recipe)
  const simulation = useMemo(
    () => (viewTick === null ? run.state : replayRun(run.bundle, viewTick)),
    [run, viewTick],
  )

  useEffect(() => {
    if (paused || viewTick !== null || atLimit) return
    const timer = window.setInterval(() => setRun((current) => advanceRun(current)), 250 / speed)
    return () => window.clearInterval(timer)
  }, [paused, speed, viewTick, atLimit])

  const dispatch = (action: OperatorAction) => {
    if (viewTick !== null) {
      setNotice('Return to live or branch from this point before changing the cell.')
      return
    }
    try {
      if (action.type === 'setScenario') {
        const recipe = recipes.find((recipe) => recipe.id === action.scenarioId)
        if (!recipe) throw new Error('Recipe is unavailable')
        setRun(createRun(recipe))
        setPaused(true)
        setNotice('New run loaded. The last saved run is unchanged until you save again.')
      } else {
        setRun(dispatchRun(run, action))
        if (action.type === 'start' || action.type === 'reset') setPaused(false)
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Command failed')
    }
  }
  const step = () => {
    if (viewTick === null) {
      setPaused(true)
      setRun(advanceRun(run))
    }
  }
  const seek = (tick: number | null) => {
    setPaused(true)
    setViewTick(tick)
  }
  const createSavedRecipe = (recipe: ScenarioPreset) => {
    const valid = validateScenario(recipe)
    const builtIn = scenarioPresets.find((item) => item.id === valid.id)
    if (builtIn) {
      if (JSON.stringify(validateScenario(builtIn)) !== JSON.stringify(valid))
        throw new Error(
          'Choose a unique recipe ID for modified input; built-in recipes cannot be overwritten.',
        )
      setRun(createRun(valid))
      setPaused(true)
      setViewTick(null)
      setNotice('Built-in recipe validated and a new run prepared. Saved recipes are unchanged.')
      return
    }
    const next = [...custom.filter((item) => item.id !== valid.id), valid]
    if (next.length > 30)
      throw new Error(
        'The recipe library holds 30 entries. Export a recipe and reuse its ID to replace it; no saved recipes were removed.',
      )
    window.localStorage.setItem('factory-recipes-v1', JSON.stringify(next))
    setCustom(next)
    setRun(createRun(valid))
    setPaused(true)
    setViewTick(null)
    setNotice('Recipe saved locally and a new run prepared. Press Start cell when ready.')
  }
  const loadFile = async (file: File | undefined, kind: 'run' | 'recipe') => {
    if (!file) return
    try {
      if (file.size > (kind === 'run' ? 2000000 : 100000))
        throw new Error('File exceeds the supported size')
      const source = await file.text()
      if (kind === 'run') {
        const imported = importRun(source)
        setRun(imported)
        setPaused(true)
        setViewTick(null)
        setNotice('Run validated and reconstructed. Save locally to retain it after reload.')
      } else createSavedRecipe(importRecipe(source))
    } catch (error) {
      setNotice(
        `Import failed; current work preserved. ${error instanceof Error ? error.message : ''}`,
      )
    }
  }
  const guide = () => {
    let example = dispatchRun(createRun(scenarioPresets[0]), { type: 'start' })
    example = bookmarkRun(example, 'Start production')
    example = advanceRun(example, 72)
    example = dispatchRun(example, { type: 'injectFault', fault: 'infeedJam', durationMs: 8000 })
    example = bookmarkRun(advanceRun(example), 'Jam trips the cell')
    example = advanceRun(example, 31)
    example = bookmarkRun(dispatchRun(example, { type: 'reset' }), 'Clear condition and Reset')
    example = advanceRun(example, 12)
    example = bookmarkRun(dispatchRun(example, { type: 'start' }), 'Separate restart')
    example = bookmarkRun(advanceRun(example, 124), '60-second result')
    setRun(example)
    setPaused(true)
    setViewTick(73)
    setActiveScreen('studio')
    setNotice(
      'A complete 60-second run was computed. Follow its bookmarks to inspect the jam, reset and restart, or branch to try another response.',
    )
  }
  const activeAlarmCount = simulation.alarms.filter((alarm) => alarm.active).length

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Packaging cell digital twin</p>
          <h1>
            Factory Cell Studio<span>Smart Factory Digital Twin</span>
          </h1>
        </div>
        <div className="header-status">
          <span>Runtime {formatDuration(simulation.elapsedMs)}</span>
          <span>OEE {formatPercent(simulation.metrics.oee)}</span>
          <span>{activeAlarmCount} alarm(s)</span>
        </div>
      </header>

      <section className="run-toolbar" aria-label="Run controls and files">
        <button onClick={() => setPaused(!paused)} disabled={viewTick !== null || atLimit}>
          {paused || atLimit ? 'Resume clock' : 'Pause clock'}
        </button>
        <button onClick={step} disabled={viewTick !== null || atLimit}>
          Step scan
        </button>
        <label>
          Clock speed
          <select value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>
            {[0.25, 1, 2, 4].map((value) => (
              <option key={value} value={value}>
                {value}×
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={() => {
            try {
              saveRun(run, window.localStorage)
              setNotice('Run saved locally. Reload will restore this exact point.')
            } catch (error) {
              setNotice(
                `Save failed; the previous saved run was preserved. ${error instanceof Error ? error.message : ''}`,
              )
            }
          }}
        >
          Save run
        </button>
        <button
          onClick={() => downloadText('factory-run.json', exportRun(run), 'application/json')}
        >
          Export run
        </button>
        <label className="file-button">
          Import run
          <input
            aria-label="Import run file"
            type="file"
            accept=".json,application/json"
            onChange={(event) => {
              void loadFile(event.target.files?.[0], 'run')
              event.target.value = ''
            }}
          />
        </label>
        <label className="file-button">
          Import recipe
          <input
            aria-label="Import recipe file"
            type="file"
            accept=".json,application/json"
            onChange={(event) => {
              void loadFile(event.target.files?.[0], 'recipe')
              event.target.value = ''
            }}
          />
        </label>
      </section>
      {notice ? (
        <div className="workspace-notice" role="status">
          <span>{notice}</span>
          <button aria-label="Dismiss message" onClick={() => setNotice('')}>
            ×
          </button>
        </div>
      ) : null}
      {atLimit ? (
        <p className="workspace-notice">
          Ten-minute run limit reached. Export or save this record, then select a recipe for a new
          run.
        </p>
      ) : null}
      <section className="scenario-strip" aria-label="Scenario selection">
        <label>
          Scenario
          <select
            value={run.bundle.recipe.id}
            disabled={viewTick !== null}
            onChange={(event) => dispatch({ type: 'setScenario', scenarioId: event.target.value })}
          >
            {recipes.map((scenario) => (
              <option key={scenario.id} value={scenario.id}>
                {scenario.name}
              </option>
            ))}
          </select>
        </label>
        <p>{simulation.scenario.description}</p>
        <button type="button" onClick={() => setWalkthroughOpen((open) => !open)}>
          Guided walkthrough
        </button>
      </section>

      {walkthroughOpen ? (
        <aside className="walkthrough">
          <strong>Demo walkthrough</strong>
          <ol>
            <li>Start the cell from HMI Overview and watch state transitions.</li>
            <li>Open Digital Twin to inspect package movement and live tags.</li>
            <li>Switch scenarios to create alarms, downtime, and reject trend changes.</li>
            <li>Use Manual Controls to force sensors or step one PLC scan.</li>
            <li>Export reports from Production Report for a shift review.</li>
          </ol>
        </aside>
      ) : null}

      <nav className="screen-nav" aria-label="Application screens">
        {screens.map((screen) => (
          <button
            type="button"
            key={screen.id}
            className={activeScreen === screen.id ? 'active' : ''}
            onClick={() => setActiveScreen(screen.id)}
          >
            {screen.label}
          </button>
        ))}
      </nav>

      <main>
        {activeScreen === 'studio' ? (
          <CellStudio
            run={run}
            state={simulation}
            recipes={recipes}
            viewTick={viewTick}
            onSeek={seek}
            onBranch={() => {
              if (viewTick !== null) {
                setRun(branchRun(run.bundle, viewTick))
                setViewTick(null)
                setNotice(
                  'A new branch begins at the selected point. Future commands from the original run were removed.',
                )
              }
            }}
            onBookmark={() => {
              try {
                setRun(bookmarkRun(run, `Bookmark ${run.bundle.bookmarks.length + 1}`))
              } catch (error) {
                setNotice(error instanceof Error ? error.message : 'Bookmark failed')
              }
            }}
            dispatch={dispatch}
            onRecipe={createSavedRecipe}
            onGuide={guide}
            notify={setNotice}
          />
        ) : (
          renderScreen(activeScreen, simulation, dispatch, paused, setPaused, speed, setSpeed, step)
        )}
      </main>
      <footer className="studio-footer">
        <span>Deterministic engineering simulation · all computation stays in your browser</span>
        <span>Inputs → state → outputs → evidence</span>
      </footer>
    </div>
  )
}

export default App
