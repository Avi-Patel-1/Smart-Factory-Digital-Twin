const flowSteps = [
  {
    number: '01',
    label: 'Input layer',
    title: 'Scenario + operator',
    bullets: ['Preset fault or quality mix', 'Start, stop, reset, E-stop', 'Manual sensor overrides'],
    code: 'scenarioPresets + dispatch(action)',
  },
  {
    number: '02',
    label: 'Plant layer',
    title: 'Simulated devices',
    bullets: ['Photoeyes and package position', 'Motor/load and air permissive', 'Reject gate position'],
    code: 'simulation state',
  },
  {
    number: '03',
    label: 'Control layer',
    title: 'PLC scan cycle',
    bullets: ['Read inputs', 'Advance state machine', 'Update timers, counters, outputs'],
    code: 'scanCycle.ts',
  },
  {
    number: '04',
    label: 'Tag layer',
    title: 'Live tag model',
    bullets: ['I/O tags and machine state', 'Active alarms', 'OEE, counts, downtime'],
    code: 'tagDatabase.ts',
  },
  {
    number: '05',
    label: 'View layer',
    title: 'Dashboard screens',
    bullets: ['HMI overview and twin', 'Alarms, trends, maintenance', 'Production report'],
    code: 'React screens',
  },
  {
    number: '06',
    label: 'Export layer',
    title: 'Historian files',
    bullets: ['SQLite event history', 'JSON summary', 'CSV trend exports'],
    code: 'analytics/historian',
  },
]

const scanLoop = ['Read inputs', 'Resolve state', 'Set outputs', 'Update metrics', 'Log snapshot']

const detailCards = [
  {
    title: 'Control boundary',
    items: ['Machine behavior stays in the PLC scan loop.', 'Screens read state and send commands; they do not own sequencing logic.'],
  },
  {
    title: 'Visibility boundary',
    items: ['Tags are the shared interface between control logic and HMI-style views.', 'Alarms and OEE are computed from the same live simulation state.'],
  },
  {
    title: 'Static reporting path',
    items: ['Python builds a SQLite historian from simulated runs.', 'The web app reads generated JSON/CSV files from public/data.'],
  },
]

export function FlowDiagram() {
  return (
    <div className="screen stack">
      <section className="panel">
        <div className="section-heading">
          <h2>System Flow</h2>
          <span>Inputs to control logic to dashboard output</span>
        </div>
        <div className="block-flow">
          {flowSteps.map((step) => (
            <article className="flow-card" key={step.title}>
              <div className="flow-card__top">
                <span className="flow-step-index">{step.number}</span>
                <span className="flow-card__label">{step.label}</span>
              </div>
              <h3>{step.title}</h3>
              <ul>
                {step.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
              <span className="flow-code-note">{step.code}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="flow-detail-grid">
        <article className="panel flow-detail-panel">
          <div className="section-heading">
            <h3>PLC loop detail</h3>
            <span>One scan</span>
          </div>
          <div className="flow-mini-cycle">
            {scanLoop.map((step) => (
              <span key={step}>{step}</span>
            ))}
          </div>
        </article>

        {detailCards.map((card) => (
          <article className="panel flow-detail-panel" key={card.title}>
            <h3>{card.title}</h3>
            <ul className="flow-compact-list">
              {card.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
        ))}
      </section>
    </div>
  )
}
