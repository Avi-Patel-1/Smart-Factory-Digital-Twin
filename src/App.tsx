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
import { applyOperatorAction, createInitialSimulationState, scanCycle, stepScan } from './plc/scanCycle'
import { scenarioPresets } from './simulation/scenarios'
import type { OperatorAction, SimulationState } from './types'
import { formatDuration, formatPercent } from './utils/format'
import './index.css'

type ScreenId =
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
    return <ManualControls state={state} dispatch={dispatch} paused={paused} setPaused={setPaused} speed={speed} setSpeed={setSpeed} step={step} />
  }
  if (screen === 'report') return <ProductionReport state={state} />
  if (screen === 'architecture') return <ArchitecturePage />
  if (screen === 'flow') return <FlowDiagram />
  if (screen === 'methodology') return <MethodologyPage />
  return <HmiOverview state={state} dispatch={dispatch} />
}

function App() {
  const [simulation, setSimulation] = useState(() => createInitialSimulationState())
  const [activeScreen, setActiveScreen] = useState<ScreenId>('hmi')
  const [paused, setPaused] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [walkthroughOpen, setWalkthroughOpen] = useState(false)

  useEffect(() => {
    if (paused) {
      return undefined
    }
    const timer = window.setInterval(() => {
      setSimulation((current) => scanCycle(current, current.scanTimeMs * speed))
    }, 350)
    return () => window.clearInterval(timer)
  }, [paused, speed])

  const dispatch = (action: OperatorAction) => {
    setSimulation((current) => applyOperatorAction(current, action))
  }

  const activeAlarmCount = useMemo(() => simulation.alarms.filter((alarm) => alarm.active).length, [simulation.alarms])
  const step = () => setSimulation((current) => stepScan(current))

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Packaging cell digital twin</p>
          <h1>Smart Factory Digital Twin & PLC/HMI Demonstrator</h1>
        </div>
        <div className="header-status">
          <span>Runtime {formatDuration(simulation.elapsedMs)}</span>
          <span>OEE {formatPercent(simulation.metrics.oee)}</span>
          <span>{activeAlarmCount} alarm(s)</span>
        </div>
      </header>

      <section className="scenario-strip">
        <label>
          Scenario
          <select value={simulation.scenario.id} onChange={(event) => dispatch({ type: 'setScenario', scenarioId: event.target.value })}>
            {scenarioPresets.map((scenario) => (
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

      <main>{renderScreen(activeScreen, simulation, dispatch, paused, setPaused, speed, setSpeed, step)}</main>
    </div>
  )
}

export default App
