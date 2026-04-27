import type { OperatorAction, SimulationState } from '../types'

interface ManualControlsProps {
  state: SimulationState
  dispatch: (action: OperatorAction) => void
  paused: boolean
  setPaused: (paused: boolean) => void
  speed: number
  setSpeed: (speed: number) => void
  step: () => void
}

const forceableSensors = ['PE_INFEED_BLOCKED', 'PE_INSPECTION_PRESENT', 'PE_EXIT_BLOCKED']

export function ManualControls({ state, dispatch, paused, setPaused, speed, setSpeed, step }: ManualControlsProps) {
  return (
    <div className="screen stack">
      <section className="panel">
        <div className="section-heading">
          <h2>Manual controls</h2>
          <span>{state.mode === 'manual' ? 'Manual mode active' : 'Switch to manual for jog controls'}</span>
        </div>
        <div className="control-grid">
          <label className="switch-row">
            <input
              type="checkbox"
              checked={state.mode === 'manual'}
              onChange={(event) => dispatch({ type: 'setMode', mode: event.target.checked ? 'manual' : 'auto' })}
            />
            Manual mode
          </label>
          <label className="switch-row">
            <input
              type="checkbox"
              checked={state.manual.jogConveyor}
              disabled={state.mode !== 'manual'}
              onChange={(event) => dispatch({ type: 'setJog', enabled: event.target.checked })}
            />
            Jog conveyor
          </label>
          <label className="switch-row">
            <input
              type="checkbox"
              checked={state.manual.rejectGateForced}
              disabled={state.mode !== 'manual'}
              onChange={(event) => dispatch({ type: 'setRejectGate', enabled: event.target.checked })}
            />
            Toggle reject gate
          </label>
          <label className="switch-row">
            <input type="checkbox" checked={paused} onChange={(event) => setPaused(event.target.checked)} />
            Pause simulation
          </label>
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <h2>Force sensor state</h2>
          <span>Testing overrides set tag quality to Forced</span>
        </div>
        <div className="force-grid">
          {forceableSensors.map((tag) => (
            <div key={tag} className="force-card">
              <strong>{tag}</strong>
              <div className="segmented">
                <button type="button" onClick={() => dispatch({ type: 'forceSensor', tag, value: true })}>
                  Force ON
                </button>
                <button type="button" onClick={() => dispatch({ type: 'forceSensor', tag, value: false })}>
                  Force OFF
                </button>
                <button type="button" onClick={() => dispatch({ type: 'forceSensor', tag, value: undefined })}>
                  Release
                </button>
              </div>
              <span>Current: {String(state.tags[tag].value)} · {state.tags[tag].quality}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <h2>Scan control</h2>
          <button type="button" className="table-action" onClick={step}>
            Step one PLC scan
          </button>
        </div>
        <label className="range-row">
          Simulation speed
          <input
            type="range"
            min="0.25"
            max="4"
            step="0.25"
            value={speed}
            onChange={(event) => setSpeed(Number(event.target.value))}
          />
          <strong>{speed.toFixed(2)}x</strong>
        </label>
        <div className="scan-phase-grid">
          {state.scanPhases.map((phase) => (
            <div key={phase.name}>
              <span>{phase.name}</span>
              <strong>{phase.status}</strong>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
